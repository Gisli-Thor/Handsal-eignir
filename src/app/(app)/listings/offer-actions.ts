"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/core/audit/log";
import {
  buildAcceptedSnapshot,
  canDecide,
  validatePaymentItems,
} from "@/core/offers/state";
import { executeTransition } from "@/core/pipeline/engine";
import { getPipeline } from "@/lib/pipelines";
import { EIGNIR_STAGES } from "@/verticals/eignir/pipeline";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type OfferActionState = {
  ok?: boolean;
  error?:
    | "invalid"
    | "notFound"
    | "forbidden"
    | "unknown"
    | "buyersRequired"
    | "paymentEmpty"
    | "paymentNonPositive"
    | "paymentSumMismatch"
    | "gildistimiPast"
    | "notPending";
  /** For paymentSumMismatch: how far off the items are (ISK, signed). */
  diffISK?: string;
} | null;

function mapError(error: unknown): OfferActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

// Icelandic-formatted amount: "89.990.000" or plain digits.
const iskAmount = z
  .string()
  .trim()
  .transform((v) => v.replace(/(kr\.?|[.\s])/gi, ""))
  .refine((v) => /^\d{1,15}$/.test(v), "invalid")
  .transform((v) => BigInt(v));

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : new Date(v)))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "invalid");

const requiredDateTime = z
  .string()
  .trim()
  .min(1)
  .transform((v) => new Date(v))
  .refine((v) => !Number.isNaN(v.getTime()), "invalid");

const offerSchema = z.object({
  amountISK: iskAmount,
  gildistimi: requiredDateTime,
  afhendingDate: optionalDate,
  terms: z.string().trim().max(20_000).transform((v) => (v === "" ? null : v)),
  parentId: z.string().trim().transform((v) => (v === "" ? null : v)),
});

interface ParsedPaymentItem {
  description: string;
  amountISK: bigint;
  dueDate: Date | null;
}

/** Payment line items arrive as parallel arrays (dynamic form rows). */
function parsePaymentItems(formData: FormData): ParsedPaymentItem[] | null {
  const descriptions = formData.getAll("paymentDescription").map(String);
  const amounts = formData.getAll("paymentAmount").map(String);
  const dueDates = formData.getAll("paymentDueDate").map(String);
  const items: ParsedPaymentItem[] = [];
  for (let i = 0; i < descriptions.length; i += 1) {
    const description = descriptions[i]?.trim() ?? "";
    const rawAmount = amounts[i]?.trim() ?? "";
    if (description === "" && rawAmount === "") continue; // skip blank rows
    const amount = iskAmount.safeParse(rawAmount);
    if (description === "" || description.length > 1_000 || !amount.success) return null;
    const rawDue = dueDates[i]?.trim() ?? "";
    const dueDate = rawDue === "" ? null : new Date(rawDue);
    if (dueDate && Number.isNaN(dueDate.getTime())) return null;
    items.push({ description, amountISK: amount.data, dueDate });
  }
  return items;
}

export async function createOfferAction(
  listingId: string,
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const tenantId = session.user.tenantId;

    const parsed = offerSchema.safeParse({
      amountISK: formData.get("amountISK") ?? "",
      gildistimi: formData.get("gildistimi") ?? "",
      afhendingDate: formData.get("afhendingDate") ?? "",
      terms: formData.get("terms") ?? "",
      parentId: formData.get("parentId") ?? "",
    });
    if (!parsed.success) return { error: "invalid" };
    if (parsed.data.gildistimi.getTime() <= Date.now()) {
      return { error: "gildistimiPast" };
    }

    const items = parsePaymentItems(formData);
    if (items === null) return { error: "invalid" };
    const paymentCheck = validatePaymentItems(items, parsed.data.amountISK);
    if (!paymentCheck.ok) {
      if (paymentCheck.error === "empty") return { error: "paymentEmpty" };
      if (paymentCheck.error === "nonPositiveItem") return { error: "paymentNonPositive" };
      return { error: "paymentSumMismatch", diffISK: paymentCheck.diffISK?.toString() };
    }

    // Buyers: chain roots need at least one; counters inherit the parent's.
    let buyerContacts: Array<{ contactId: string; sharePct: number | null }> = [];
    let parent: { id: string; status: string } | null = null;
    if (parsed.data.parentId) {
      const parentOffer = await db.offer.findUnique({
        where: { id: parsed.data.parentId },
        include: { buyers: true },
      });
      if (!parentOffer || parentOffer.listingId !== listing.id) {
        return { error: "notFound" };
      }
      if (!canDecide(parentOffer.status)) return { error: "notPending" };
      parent = { id: parentOffer.id, status: parentOffer.status };
      buyerContacts = parentOffer.buyers.map((buyer) => ({
        contactId: buyer.contactId,
        sharePct: buyer.sharePct === null ? null : Number(buyer.sharePct),
      }));
    } else {
      const contactIds = formData.getAll("buyerContactId").map(String).filter(Boolean);
      const shares = formData.getAll("buyerSharePct").map(String);
      if (contactIds.length === 0) return { error: "buyersRequired" };
      const seen = new Set<string>();
      for (let i = 0; i < contactIds.length; i += 1) {
        if (seen.has(contactIds[i])) continue;
        seen.add(contactIds[i]);
        const rawShare = shares[i]?.trim().replace(",", ".") ?? "";
        const share = rawShare === "" ? null : Number(rawShare);
        if (share !== null && (!Number.isFinite(share) || share <= 0 || share > 100)) {
          return { error: "invalid" };
        }
        buyerContacts.push({ contactId: contactIds[i], sharePct: share });
      }
      // Scoped read proves every contact belongs to this tenant.
      const found = await db.contact.count({
        where: { id: { in: buyerContacts.map((buyer) => buyer.contactId) } },
      });
      if (found !== buyerContacts.length) return { error: "notFound" };
    }

    const offerId = await db.$transaction(async (tx) => {
      if (parent) {
        // Countering closes the parent (SPEC §7).
        const updated = await tx.offer.updateMany({
          where: { id: parent.id, status: "PENDING" },
          data: { status: "COUNTERED", decidedById: session.user.id, decidedAt: new Date() },
        });
        if (updated.count === 0) throw new ListingAccessError("notFound");
      }
      const offer = await tx.offer.create({
        data: {
          tenantId,
          listingId: listing.id,
          parentId: parent?.id ?? null,
          amountISK: parsed.data.amountISK,
          gildistimi: parsed.data.gildistimi,
          afhendingDate: parsed.data.afhendingDate,
          terms: parsed.data.terms,
          createdById: session.user.id,
        },
      });
      for (const buyer of buyerContacts) {
        await tx.offerBuyer.create({
          data: {
            tenantId,
            offerId: offer.id,
            contactId: buyer.contactId,
            sharePct: buyer.sharePct,
          },
        });
      }
      for (const [index, item] of items.entries()) {
        await tx.offerPaymentItem.create({
          data: {
            tenantId,
            offerId: offer.id,
            description: item.description,
            amountISK: item.amountISK,
            dueDate: item.dueDate,
            sortOrder: index,
          },
        });
      }
      return offer.id;
    });

    await logAudit(db, {
      actorUserId: session.user.id,
      action: "OFFER_CREATED",
      targetType: "Offer",
      targetId: offerId,
      metadata: {
        listingId: listing.id,
        amountISK: parsed.data.amountISK.toString(),
        kind: parent ? "GAGNTILBOD" : "KAUPTILBOD",
        ...(parent ? { parentId: parent.id } : {}),
      },
    });

    // Receiving the first offer on a published listing moves it to
    // Tilboð móttekið (decision recorded in PROGRESS.md M3).
    if (listing.stage === "I_SOLU") {
      await executeTransition(db, getPipeline(listing.vertical), {
        tenantId,
        listing,
        to: "TILBOD_MOTTEKID",
        actorUserId: session.user.id,
      });
    }

    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/offers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

async function decideOffer(
  listingId: string,
  offerId: string,
  decision: "REJECTED" | "WITHDRAWN",
): Promise<OfferActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const offer = await db.offer.findUnique({ where: { id: offerId } });
    if (!offer || offer.listingId !== listing.id) return { error: "notFound" };
    if (!canDecide(offer.status)) return { error: "notPending" };

    const updated = await db.offer.updateMany({
      where: { id: offer.id, status: "PENDING" },
      data: { status: decision, decidedById: session.user.id, decidedAt: new Date() },
    });
    if (updated.count === 0) return { error: "notPending" };

    await logAudit(db, {
      actorUserId: session.user.id,
      action: decision === "REJECTED" ? "OFFER_REJECTED" : "OFFER_WITHDRAWN",
      targetType: "Offer",
      targetId: offer.id,
      metadata: { listingId: listing.id },
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/offers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function rejectOfferAction(
  listingId: string,
  offerId: string,
): Promise<OfferActionState> {
  return decideOffer(listingId, offerId, "REJECTED");
}

export async function withdrawOfferAction(
  listingId: string,
  offerId: string,
): Promise<OfferActionState> {
  return decideOffer(listingId, offerId, "WITHDRAWN");
}

export async function acceptOfferAction(
  listingId: string,
  offerId: string,
): Promise<OfferActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const offer = await db.offer.findUnique({
      where: { id: offerId },
      include: {
        buyers: { include: { contact: { select: { name: true } } } },
        paymentItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!offer || offer.listingId !== listing.id) return { error: "notFound" };
    if (!canDecide(offer.status)) return { error: "notPending" };

    const snapshot = buildAcceptedSnapshot({
      amountISK: offer.amountISK,
      afhendingDate: offer.afhendingDate,
      gildistimi: offer.gildistimi,
      terms: offer.terms,
      buyers: offer.buyers.map((buyer) => ({
        contactId: buyer.contactId,
        name: buyer.contact.name,
        sharePct: buyer.sharePct === null ? null : Number(buyer.sharePct),
      })),
      paymentItems: offer.paymentItems.map((item) => ({
        description: item.description,
        amountISK: item.amountISK,
        dueDate: item.dueDate,
      })),
    });

    await db.$transaction(async (tx) => {
      const updated = await tx.offer.updateMany({
        where: { id: offer.id, status: "PENDING" },
        data: {
          status: "ACCEPTED",
          decidedById: session.user.id,
          decidedAt: new Date(),
          acceptedSnapshot: snapshot as Prisma.InputJsonObject,
        },
      });
      if (updated.count === 0) throw new ListingAccessError("notFound");
      // Accepting closes every other open offer on the listing (the chain has
      // one PENDING leaf; parallel chains from other buyers close too — the
      // property is under an accepted offer either way).
      await tx.offer.updateMany({
        where: { listingId: listing.id, status: "PENDING", id: { not: offer.id } },
        data: { status: "REJECTED", decidedById: session.user.id, decidedAt: new Date() },
      });
    });

    await logAudit(db, {
      actorUserId: session.user.id,
      action: "OFFER_ACCEPTED",
      targetType: "Offer",
      targetId: offer.id,
      metadata: { listingId: listing.id, amountISK: offer.amountISK.toString() },
    });

    // Move the listing forward to Tilboð samþykkt (SPEC §7) — system move,
    // only when the listing is currently in an earlier stage.
    const stageIndex = EIGNIR_STAGES.indexOf(
      listing.stage as (typeof EIGNIR_STAGES)[number],
    );
    const targetIndex = EIGNIR_STAGES.indexOf("TILBOD_SAMTHYKKT");
    if (stageIndex !== -1 && stageIndex < targetIndex) {
      await executeTransition(db, getPipeline(listing.vertical), {
        tenantId: session.user.tenantId,
        listing,
        to: "TILBOD_SAMTHYKKT",
        actorUserId: session.user.id,
      });
    }

    revalidatePath("/listings");
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/offers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
