/**
 * Offer chain state machine (SPEC §7).
 *
 * Statuses: PENDING → ACCEPTED | REJECTED | COUNTERED | EXPIRED | WITHDRAWN.
 * All non-PENDING statuses are terminal. Counter-offers (gagntilboð) reference
 * their parent: countering a PENDING offer closes it as COUNTERED and opens a
 * new PENDING offer, so a chain has at most one open (PENDING) leaf.
 */
import type { OfferStatus } from "@/generated/prisma/enums";

export type OfferDecision = "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "COUNTERED" | "EXPIRED";

/** Only a PENDING offer can change state. */
export function canDecide(status: OfferStatus): boolean {
  return status === "PENDING";
}

/** Kauptilboð (chain root, from a buyer) vs gagntilboð (counter). */
export function offerKind(parentId: string | null): "KAUPTILBOD" | "GAGNTILBOD" {
  return parentId === null ? "KAUPTILBOD" : "GAGNTILBOD";
}

export interface PaymentItemInput {
  description: string;
  amountISK: bigint;
  dueDate?: Date | null;
}

export type PaymentValidation =
  | { ok: true }
  | { ok: false; error: "empty" | "nonPositiveItem" | "sumMismatch"; diffISK?: bigint };

/**
 * Greiðslutilhögun validation (SPEC §7): at least one line item, every amount
 * positive, and the items must sum exactly to the offer amount.
 */
export function validatePaymentItems(
  items: readonly PaymentItemInput[],
  amountISK: bigint,
): PaymentValidation {
  if (items.length === 0) return { ok: false, error: "empty" };
  let sum = 0n;
  for (const item of items) {
    if (item.amountISK <= 0n) return { ok: false, error: "nonPositiveItem" };
    sum += item.amountISK;
  }
  if (sum !== amountISK) {
    return { ok: false, error: "sumMismatch", diffISK: amountISK - sum };
  }
  return { ok: true };
}

/**
 * The immutable snapshot written when an offer is accepted (SPEC §7).
 * Plain JSON — BigInt serialized as strings.
 */
export function buildAcceptedSnapshot(offer: {
  amountISK: bigint;
  afhendingDate: Date | null;
  gildistimi: Date;
  terms: string | null;
  buyers: Array<{ contactId: string; name: string; sharePct: number | null }>;
  paymentItems: Array<{ description: string; amountISK: bigint; dueDate: Date | null }>;
}): Record<string, unknown> {
  return {
    amountISK: offer.amountISK.toString(),
    afhendingDate: offer.afhendingDate?.toISOString() ?? null,
    gildistimi: offer.gildistimi.toISOString(),
    terms: offer.terms,
    buyers: offer.buyers.map((buyer) => ({
      contactId: buyer.contactId,
      name: buyer.name,
      sharePct: buyer.sharePct,
    })),
    paymentItems: offer.paymentItems.map((item) => ({
      description: item.description,
      amountISK: item.amountISK.toString(),
      dueDate: item.dueDate?.toISOString() ?? null,
    })),
    acceptedAt: new Date().toISOString(),
  };
}
