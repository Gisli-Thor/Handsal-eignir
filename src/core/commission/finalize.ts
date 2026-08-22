/**
 * Commission finalization (SPEC §10): entering Afsal/Lokið computes and
 * freezes a CommissionRecord. Registered as a pipeline hook in the vertical
 * config; the tenant-default scheme lookup is injected (Tenant is a platform
 * model unreachable through the scoped client — same DI seam as the plan
 * guard and the fyrirvari reminders).
 *
 * Skips silently when a record already exists (re-entering the stage is a
 * no-op — records are frozen) or when the listing has no price and no
 * accepted offer.
 */
import { logAudit } from "@/core/audit/log";
import type { TransitionHook } from "@/core/pipeline/types";
import { calculateCommission } from "./calculate";
import { parseScheme } from "./scheme";

export function createCommissionHook(deps: {
  getTenantScheme: (tenantId: string) => Promise<unknown>;
}): TransitionHook {
  return async (ctx) => {
    const existing = await ctx.db.commissionRecord.findUnique({
      where: { listingId: ctx.listingId },
      select: { id: true },
    });
    if (existing) return;

    const listing = await ctx.db.listing.findUnique({
      where: { id: ctx.listingId },
      include: {
        offers: {
          where: { status: "ACCEPTED" },
          orderBy: { decidedAt: "desc" },
          take: 1,
          select: { amountISK: true },
        },
        agents: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!listing) return;

    const salePriceISK = listing.offers[0]?.amountISK ?? listing.askingPriceISK;
    if (salePriceISK === null) {
      console.warn(
        `commission: listing ${ctx.listingId} has no accepted offer or asking price — skipping record`,
      );
      return;
    }

    const listingScheme = parseScheme(listing.commissionSchemeOverride);
    const tenantScheme = listingScheme
      ? null
      : parseScheme(await deps.getTenantScheme(ctx.tenantId));
    const scheme = listingScheme ?? tenantScheme;
    const schemeSource = listingScheme ? "LISTING" : tenantScheme ? "TENANT" : "NONE";

    const result = calculateCommission(
      scheme ?? { version: 1, type: "FIXED_PERCENT", percent: 0, lineItems: [] },
      salePriceISK,
      listing.agents.map((link) => ({
        userId: link.userId,
        name: link.user.name,
        isPrimary: link.isPrimary,
        splitPct: link.splitPct === null ? null : Number(link.splitPct),
      })),
    );

    await ctx.db.commissionRecord.create({
      data: {
        tenantId: ctx.tenantId,
        listingId: ctx.listingId,
        salePriceISK,
        scheme: { schemeSource, scheme: scheme ?? null },
        grossISK: result.grossISK,
        vskISK: result.vskISK,
        totalISK: result.totalISK,
        lineItems: result.lineItems.map((item) => ({
          label: item.label,
          amountISK: item.amountISK.toString(),
        })),
        agentSplits: result.splits.map((split) => ({
          userId: split.userId,
          name: split.name,
          percent: split.percent,
          amountISK: split.amountISK.toString(),
        })),
      },
    });
    await logAudit(ctx.db, {
      actorUserId: ctx.actorUserId ?? undefined,
      action: "COMMISSION_RECORD_CREATED",
      targetType: "Listing",
      targetId: ctx.listingId,
      metadata: {
        salePriceISK: salePriceISK.toString(),
        totalISK: result.totalISK.toString(),
        schemeSource,
      },
    });
  };
}
