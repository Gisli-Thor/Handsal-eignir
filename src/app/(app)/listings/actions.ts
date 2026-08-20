"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { deleteObjects } from "@/lib/storage";
import { logAudit } from "@/core/audit/log";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type ListingActionState = {
  ok?: boolean;
  error?: "invalid" | "notFound" | "forbidden" | "unknown";
} | null;

function mapError(error: unknown): ListingActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

// ── Form value parsing ───────────────────────────────────────────────────────
// Icelandic-formatted inputs: ISK amounts may carry dot thousands separators,
// areas use a decimal comma.

const optionalIsk = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v.replace(/(kr\.?|[.\s])/gi, "")))
  .refine((v) => v === null || /^\d{1,15}$/.test(v), "invalid")
  .transform((v) => (v === null ? null : BigInt(v)));

const optionalArea = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(/\s/g, "").replace(",", "."))))
  .refine(
    (v) => v === null || (Number.isFinite(v) && v >= 0 && v < 100_000),
    "invalid",
  )
  .transform((v) => (v === null ? null : Math.round(v * 10) / 10));

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= min && v <= max),
      "invalid",
    );

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const propertySchema = z.object({
  // Identifiers
  fastanumer: z.string().trim().min(1).max(30),
  landeignarnumer: optionalTrimmed(30),
  // Address
  gotuheiti: z.string().trim().min(1).max(120),
  husnumer: z.string().trim().min(1).max(20),
  ibud: optionalTrimmed(20),
  postnumer: z.string().trim().regex(/^\d{3}$/),
  // Type & sizes
  tegund: z.enum([
    "FJOLBYLI",
    "EINBYLI",
    "RADHUS",
    "PARHUS",
    "HAED",
    "ATVINNUHUSNAEDI",
    "SUMARHUS",
    "LOD",
    "ANNAD",
  ]),
  birtStaerd: optionalArea,
  tharAfGeymsla: optionalArea,
  // Rooms
  herbergi: optionalInt(0, 200),
  svefnherbergi: optionalInt(0, 100),
  badherbergi: optionalInt(0, 100),
  // Building
  haed: optionalInt(-5, 200),
  lyfta: z.string().nullish().transform((v) => v === "on" || v === "true"),
  parkingType: z.enum(["NONE", "BILSKUR", "BILSKYLI", "STAEDI", "STAEDI_I_BILAHUSI"]),
  parkingCount: optionalInt(0, 1000),
  byggingarar: optionalInt(1700, new Date().getFullYear() + 3),
  // Valuations & price
  fasteignamatISK: optionalIsk,
  brunabotamatISK: optionalIsk,
  askingPriceISK: optionalIsk,
  // Text
  descriptionIs: optionalTrimmed(20_000),
  descriptionEn: optionalTrimmed(20_000),
  athugasemdir: optionalTrimmed(10_000),
});

function parsePropertyForm(formData: FormData) {
  const value = (name: string) => (formData.get(name) ?? "") as string;
  return propertySchema.safeParse({
    fastanumer: value("fastanumer"),
    landeignarnumer: value("landeignarnumer"),
    gotuheiti: value("gotuheiti"),
    husnumer: value("husnumer"),
    ibud: value("ibud"),
    postnumer: value("postnumer"),
    tegund: formData.get("tegund"),
    birtStaerd: value("birtStaerd"),
    tharAfGeymsla: value("tharAfGeymsla"),
    herbergi: value("herbergi"),
    svefnherbergi: value("svefnherbergi"),
    badherbergi: value("badherbergi"),
    haed: value("haed"),
    lyfta: formData.get("lyfta"),
    parkingType: formData.get("parkingType") ?? "NONE",
    parkingCount: value("parkingCount"),
    byggingarar: value("byggingarar"),
    fasteignamatISK: value("fasteignamatISK"),
    brunabotamatISK: value("brunabotamatISK"),
    askingPriceISK: value("askingPriceISK"),
    descriptionIs: value("descriptionIs"),
    descriptionEn: value("descriptionEn"),
    athugasemdir: value("athugasemdir"),
  });
}

function splitParsed(data: z.infer<typeof propertySchema>) {
  const { askingPriceISK, descriptionIs, descriptionEn, ...property } = data;
  return { listing: { askingPriceISK, descriptionIs, descriptionEn }, property };
}

// ── Listing + property CRUD ──────────────────────────────────────────────────

export async function createListingAction(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const session = await requireTenantUser();
  const parsed = parsePropertyForm(formData);
  if (!parsed.success) return { error: "invalid" };
  const { listing: listingData, property } = splitParsed(parsed.data);
  const tenantId = session.user.tenantId;
  const db = getTenantDb(tenantId);

  let listingId: string;
  try {
    listingId = await db.$transaction(async (tx) => {
      const listing = await tx.listing.create({
        data: { tenantId, vertical: "EIGNIR", ...listingData },
      });
      await tx.property.create({
        data: { tenantId, listingId: listing.id, ...property },
      });
      // The creator is the primary responsible agent.
      await tx.listingAgent.create({
        data: {
          tenantId,
          listingId: listing.id,
          userId: session.user.id,
          isPrimary: true,
        },
      });
      return listing.id;
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "LISTING_CREATED",
      targetType: "Listing",
      targetId: listingId,
      metadata: {
        fastanumer: property.fastanumer,
        address: `${property.gotuheiti} ${property.husnumer}`,
      },
    });
  } catch {
    return { error: "unknown" };
  }
  revalidatePath("/listings");
  redirect(`/listings/${listingId}`);
}

export async function updateListingAction(
  listingId: string,
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = parsePropertyForm(formData);
    if (!parsed.success) return { error: "invalid" };
    const { listing: listingData, property } = splitParsed(parsed.data);
    const tenantId = session.user.tenantId;

    await db.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listing.id }, data: listingData });
      await tx.property.upsert({
        where: { listingId: listing.id },
        create: { tenantId, listingId: listing.id, ...property },
        update: property,
      });
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "LISTING_UPDATED",
      targetType: "Listing",
      targetId: listing.id,
      metadata: { fastanumer: property.fastanumer },
    });
    revalidatePath("/listings");
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteListingAction(
  listingId: string,
): Promise<ListingActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    // Collect object keys before the cascade removes the rows.
    const [media, documents] = await Promise.all([
      db.mediaAsset.findMany({
        where: { listingId: listing.id },
        select: { storageKey: true, webKey: true, thumbKey: true },
      }),
      db.listingDocument.findMany({
        where: { listingId: listing.id },
        select: { storageKey: true },
      }),
    ]);
    await db.listing.delete({ where: { id: listing.id } });
    await deleteObjects([
      ...media.flatMap((asset) => [asset.storageKey, asset.webKey, asset.thumbKey]),
      ...documents.map((doc) => doc.storageKey),
    ]);
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "LISTING_DELETED",
      targetType: "Listing",
      targetId: listing.id,
    });
  } catch (error) {
    return mapError(error);
  }
  revalidatePath("/listings");
  redirect("/listings");
}

// ── Contact links (sellers, buyers, prospects, co-owners) ───────────────────

const LISTING_CONTACT_ROLE = z.enum([
  "SELLER",
  "BUYER",
  "PROSPECTIVE_BUYER",
  "CO_OWNER",
]);

export async function addListingContactAction(
  listingId: string,
  contactId: string,
  role: z.infer<typeof LISTING_CONTACT_ROLE>,
): Promise<ListingActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsedRole = LISTING_CONTACT_ROLE.safeParse(role);
    if (!parsedRole.success || !contactId) return { error: "invalid" };
    // Scoped read proves the contact belongs to this tenant; the composite FK
    // would also refuse, this just gives a cleaner error.
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact) return { error: "notFound" };

    await db.listingContact.upsert({
      where: {
        listingId_contactId_role: {
          listingId: listing.id,
          contactId,
          role: parsedRole.data,
        },
      },
      create: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        contactId,
        role: parsedRole.data,
      },
      update: {},
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function removeListingContactAction(
  listingId: string,
  linkId: string,
): Promise<ListingActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.listingContact.deleteMany({
      where: { id: linkId, listingId: listing.id },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

// ── Responsible agents ───────────────────────────────────────────────────────

export async function addListingAgentAction(
  listingId: string,
  userId: string,
): Promise<ListingActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    if (!userId) return { error: "invalid" };
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) return { error: "notFound" };

    const count = await db.listingAgent.count({ where: { listingId: listing.id } });
    await db.listingAgent.upsert({
      where: { listingId_userId: { listingId: listing.id, userId } },
      create: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        userId,
        isPrimary: count === 0,
      },
      update: {},
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function removeListingAgentAction(
  listingId: string,
  linkId: string,
): Promise<ListingActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    const link = await db.listingAgent.findUnique({ where: { id: linkId } });
    if (!link || link.listingId !== listing.id) return { error: "notFound" };
    await db.listingAgent.delete({ where: { id: linkId } });
    if (link.isPrimary) {
      const next = await db.listingAgent.findFirst({
        where: { listingId: listing.id },
      });
      if (next) {
        await db.listingAgent.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

// ── Áhvílandi lán ────────────────────────────────────────────────────────────

const loanSchema = z.object({
  lender: z.string().trim().min(1).max(120),
  remainingBalanceISK: optionalIsk.refine((v) => v !== null, "required"),
  verdtryggt: z.string().nullish().transform((v) => v === "on" || v === "true"),
  interestRatePct: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "invalid"),
  yfirtakanlegt: z.string().nullish().transform((v) => v === "on" || v === "true"),
});

export async function addLoanAction(
  listingId: string,
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = loanSchema.safeParse({
      lender: formData.get("lender") ?? "",
      remainingBalanceISK: formData.get("remainingBalanceISK") ?? "",
      verdtryggt: formData.get("verdtryggt"),
      interestRatePct: formData.get("interestRatePct") ?? "",
      yfirtakanlegt: formData.get("yfirtakanlegt"),
    });
    if (!parsed.success) return { error: "invalid" };
    await db.encumbranceLoan.create({
      data: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        lender: parsed.data.lender,
        remainingBalanceISK: parsed.data.remainingBalanceISK!,
        verdtryggt: parsed.data.verdtryggt,
        interestRatePct: parsed.data.interestRatePct,
        yfirtakanlegt: parsed.data.yfirtakanlegt,
      },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteLoanAction(
  listingId: string,
  loanId: string,
): Promise<ListingActionState> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    await db.encumbranceLoan.deleteMany({
      where: { id: loanId, listingId: listing.id },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
