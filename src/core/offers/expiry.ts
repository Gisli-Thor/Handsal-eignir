/**
 * Offer expiry (SPEC §7): PENDING offers whose gildistími has passed become
 * EXPIRED. Runs across all tenants from the in-process scheduler
 * (src/lib/jobs.ts) — hence the unscoped client, a documented legitimate
 * call site (src/lib/db.ts).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { logAudit } from "@/core/audit/log";

export async function expireOverdueOffers(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const overdue = await db.offer.findMany({
    where: { status: "PENDING", gildistimi: { lt: now } },
    select: { id: true, tenantId: true, listingId: true },
  });
  if (overdue.length === 0) return 0;

  await db.offer.updateMany({
    where: { id: { in: overdue.map((offer) => offer.id) }, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  for (const offer of overdue) {
    await logAudit(db, {
      tenantId: offer.tenantId,
      action: "OFFER_EXPIRED",
      targetType: "Offer",
      targetId: offer.id,
      metadata: { listingId: offer.listingId },
    });
  }
  return overdue.length;
}
