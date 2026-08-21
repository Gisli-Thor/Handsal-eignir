"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/core/audit/log";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type FyrirvariActionState = {
  ok?: boolean;
  error?: "invalid" | "notFound" | "forbidden" | "unknown" | "offerClosed";
} | null;

function mapError(error: unknown): FyrirvariActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

const fyrirvariSchema = z.object({
  type: z.enum([
    "FJARMOGNUN",
    "SALA_EIGIN_EIGNAR",
    "ASTANDSSKODUN",
    "SAMTHYKKI_STJORNAR",
    "ANNAD",
  ]),
  description: z.string().trim().min(1).max(4_000),
  deadline: z
    .string()
    .trim()
    .min(1)
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), "invalid"),
  responsible: z.enum(["BUYER", "SELLER"]),
});

/** Fyrirvarar attach to an open or accepted offer — they are typically agreed
 * in the offer itself and tracked to resolution after acceptance (SPEC §7). */
export async function addFyrirvariAction(
  listingId: string,
  offerId: string,
  _prev: FyrirvariActionState,
  formData: FormData,
): Promise<FyrirvariActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const offer = await db.offer.findUnique({ where: { id: offerId } });
    if (!offer || offer.listingId !== listing.id) return { error: "notFound" };
    if (offer.status !== "PENDING" && offer.status !== "ACCEPTED") {
      return { error: "offerClosed" };
    }
    const parsed = fyrirvariSchema.safeParse({
      type: formData.get("type"),
      description: formData.get("description") ?? "",
      deadline: formData.get("deadline") ?? "",
      responsible: formData.get("responsible"),
    });
    if (!parsed.success) return { error: "invalid" };

    const fyrirvari = await db.fyrirvari.create({
      data: {
        tenantId: session.user.tenantId,
        offerId: offer.id,
        type: parsed.data.type,
        description: parsed.data.description,
        deadline: parsed.data.deadline,
        responsible: parsed.data.responsible,
      },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "FYRIRVARI_CREATED",
      targetType: "Fyrirvari",
      targetId: fyrirvari.id,
      metadata: { listingId: listing.id, offerId: offer.id, type: parsed.data.type },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

const RESOLUTIONS = z.enum(["FULFILLED", "WAIVED", "FAILED", "PENDING"]);

/** Resolve a fyrirvari — or reopen it by passing PENDING (data-entry fixes). */
export async function resolveFyrirvariAction(
  listingId: string,
  fyrirvariId: string,
  status: z.infer<typeof RESOLUTIONS>,
): Promise<FyrirvariActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = RESOLUTIONS.safeParse(status);
    if (!parsed.success) return { error: "invalid" };
    const fyrirvari = await db.fyrirvari.findUnique({
      where: { id: fyrirvariId },
      include: { offer: { select: { listingId: true } } },
    });
    if (!fyrirvari || fyrirvari.offer.listingId !== listing.id) {
      return { error: "notFound" };
    }

    const reopening = parsed.data === "PENDING";
    await db.fyrirvari.update({
      where: { id: fyrirvari.id },
      data: {
        status: parsed.data,
        resolvedById: reopening ? null : session.user.id,
        resolvedAt: reopening ? null : new Date(),
      },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "FYRIRVARI_RESOLVED",
      targetType: "Fyrirvari",
      targetId: fyrirvari.id,
      metadata: { listingId: listing.id, from: fyrirvari.status, to: parsed.data },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteFyrirvariAction(
  listingId: string,
  fyrirvariId: string,
): Promise<FyrirvariActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const fyrirvari = await db.fyrirvari.findUnique({
      where: { id: fyrirvariId },
      include: { offer: { select: { listingId: true } } },
    });
    if (!fyrirvari || fyrirvari.offer.listingId !== listing.id) {
      return { error: "notFound" };
    }
    await db.fyrirvari.delete({ where: { id: fyrirvari.id } });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "FYRIRVARI_DELETED",
      targetType: "Fyrirvari",
      targetId: fyrirvari.id,
      metadata: { listingId: listing.id, type: fyrirvari.type },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
