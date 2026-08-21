"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type ActivityActionState = {
  ok?: boolean;
  error?: "invalid" | "notFound" | "forbidden" | "unknown";
} | null;

function mapError(error: unknown): ActivityActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

// ── Viewings (skoðun / opið hús) ─────────────────────────────────────────────

const viewingSchema = z.object({
  kind: z.enum(["SKODUN", "OPID_HUS"]),
  startsAt: z
    .string()
    .trim()
    .min(1)
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), "invalid"),
  endsAt: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : new Date(v)))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), "invalid"),
  note: z.string().trim().max(4_000).transform((v) => (v === "" ? null : v)),
});

export async function addViewingAction(
  listingId: string,
  _prev: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = viewingSchema.safeParse({
      kind: formData.get("kind"),
      startsAt: formData.get("startsAt") ?? "",
      endsAt: formData.get("endsAt") ?? "",
      note: formData.get("note") ?? "",
    });
    if (!parsed.success) return { error: "invalid" };
    if (parsed.data.endsAt && parsed.data.endsAt <= parsed.data.startsAt) {
      return { error: "invalid" };
    }
    const attendeeIds = [
      ...new Set(formData.getAll("attendeeContactId").map(String).filter(Boolean)),
    ];
    if (attendeeIds.length > 0) {
      const found = await db.contact.count({ where: { id: { in: attendeeIds } } });
      if (found !== attendeeIds.length) return { error: "notFound" };
    }

    await db.$transaction(async (tx) => {
      const viewing = await tx.viewing.create({
        data: {
          tenantId: session.user.tenantId,
          listingId: listing.id,
          kind: parsed.data.kind,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          note: parsed.data.note,
          createdById: session.user.id,
        },
      });
      for (const contactId of attendeeIds) {
        await tx.viewingAttendee.create({
          data: { tenantId: session.user.tenantId, viewingId: viewing.id, contactId },
        });
      }
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteViewingAction(
  listingId: string,
  viewingId: string,
): Promise<ActivityActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.viewing.deleteMany({ where: { id: viewingId, listingId: listing.id } });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function addNoteAction(
  listingId: string,
  _prev: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const body = String(formData.get("body") ?? "").trim();
    if (body === "" || body.length > 10_000) return { error: "invalid" };
    await db.listingNote.create({
      data: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        body,
        createdById: session.user.id,
      },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteNoteAction(
  listingId: string,
  noteId: string,
): Promise<ActivityActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.listingNote.deleteMany({ where: { id: noteId, listingId: listing.id } });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

const taskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : new Date(v)))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), "invalid"),
  assigneeUserId: z.string().trim().transform((v) => (v === "" ? null : v)),
});

export async function addTaskAction(
  listingId: string,
  _prev: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = taskSchema.safeParse({
      title: formData.get("title") ?? "",
      dueDate: formData.get("dueDate") ?? "",
      assigneeUserId: formData.get("assigneeUserId") ?? "",
    });
    if (!parsed.success) return { error: "invalid" };
    if (parsed.data.assigneeUserId) {
      const user = await db.user.findUnique({
        where: { id: parsed.data.assigneeUserId },
      });
      if (!user || !user.active) return { error: "notFound" };
    }
    await db.listingTask.create({
      data: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        title: parsed.data.title,
        dueDate: parsed.data.dueDate,
        assigneeUserId: parsed.data.assigneeUserId,
        createdById: session.user.id,
      },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function toggleTaskAction(
  listingId: string,
  taskId: string,
  done: boolean,
): Promise<ActivityActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.listingTask.updateMany({
      where: { id: taskId, listingId: listing.id },
      data: { completedAt: done ? new Date() : null },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteTaskAction(
  listingId: string,
  taskId: string,
): Promise<ActivityActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.listingTask.deleteMany({ where: { id: taskId, listingId: listing.id } });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
