/**
 * Handsal Eignir pipeline configuration (SPEC §6).
 *
 * Guards/hooks by milestone:
 *  - M3: fyrirvarar guard before Kaupsamningur; publishedAt/soldAt stamps.
 *  - M4: portal auto-publish on Í sölu, auto-unpublish on Kaupsamningur.
 *  - M5: plan-limit guard on every ACTIVE-band stage (the engine allows
 *    any→any jumps, so guarding only Í sölu would be a hole); commission
 *    record frozen on Afsal/Lokið.
 */
import type { PipelineConfig, TransitionHook } from "@/core/pipeline/types";
import { fyrirvararGuard } from "@/core/fyrirvarar/guard";
import { createCommissionHook } from "@/core/commission/finalize";
import { createPlanLimitGuard } from "@/core/plans/guard";
import { unscopedDb } from "@/lib/db";
import { runPortalSync } from "@/lib/portal-sync";

export const EIGNIR_STAGES = [
  "UNDIRBUNINGUR",
  "I_SOLU",
  "TILBOD_MOTTEKID",
  "TILBOD_SAMTHYKKT",
  "KAUPSAMNINGUR",
  "AFHENDING",
  "AFSAL_LOKID",
] as const;

export const WITHDRAWN_STAGE = "FALLID_FRA";

/** SPEC §12: "active" = Í sölu through Afhending — the plan-limit band. */
export const ACTIVE_STAGES = [
  "I_SOLU",
  "TILBOD_MOTTEKID",
  "TILBOD_SAMTHYKKT",
  "KAUPSAMNINGUR",
  "AFHENDING",
] as const;

/** First entry into Í sölu stamps publishedAt (kept on re-entry). */
const stampPublishedAt: TransitionHook = async (ctx) => {
  await ctx.db.listing.updateMany({
    where: { id: ctx.listingId, publishedAt: null },
    data: { publishedAt: new Date() },
  });
};

/** Entering Afsal/Lokið stamps soldAt. */
const stampSoldAt: TransitionHook = async (ctx) => {
  await ctx.db.listing.updateMany({
    where: { id: ctx.listingId, soldAt: null },
    data: { soldAt: new Date() },
  });
};

/** SPEC §8: entering Í sölu auto-publishes to all enabled portals. The sync
 * layer isolates per-portal failures (never throws). */
const publishToPortals: TransitionHook = async (ctx) => {
  await runPortalSync("publish", {
    tenantId: ctx.tenantId,
    listingId: ctx.listingId,
    actorUserId: ctx.actorUserId,
  });
};

/** SPEC §8: entering Kaupsamningur auto-unpublishes from all portals. */
const unpublishFromPortals: TransitionHook = async (ctx) => {
  await runPortalSync("unpublish", {
    tenantId: ctx.tenantId,
    listingId: ctx.listingId,
    actorUserId: ctx.actorUserId,
  });
};

/** Plan-limit guard deps: Tenant/Plan are platform models — unscoped lookup
 * (verticals compose lib + core; core takes deps as params). */
const planLimitGuard = createPlanLimitGuard({
  activeStages: ACTIVE_STAGES,
  getPlanLimit: async (tenantId) => {
    const tenant = await unscopedDb.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: { select: { maxActiveListings: true } } },
    });
    return tenant?.plan.maxActiveListings ?? null;
  },
});

/** SPEC §10: freeze the commission record on Afsal/Lokið. */
const finalizeCommission = createCommissionHook({
  getTenantScheme: async (tenantId) => {
    const tenant = await unscopedDb.tenant.findUnique({
      where: { id: tenantId },
      select: { commissionScheme: true },
    });
    return tenant?.commissionScheme ?? null;
  },
});

export const eignirPipeline: PipelineConfig = {
  vertical: "EIGNIR",
  stages: EIGNIR_STAGES,
  withdrawnStage: WITHDRAWN_STAGE,
  guards: {
    I_SOLU: [planLimitGuard],
    TILBOD_MOTTEKID: [planLimitGuard],
    TILBOD_SAMTHYKKT: [planLimitGuard],
    // Non-overridable plan guard first — an ADMIN fyrirvarar override must
    // not sneak past the plan limit.
    KAUPSAMNINGUR: [planLimitGuard, fyrirvararGuard],
    AFHENDING: [planLimitGuard],
  },
  hooks: {
    I_SOLU: [stampPublishedAt, publishToPortals],
    KAUPSAMNINGUR: [unpublishFromPortals],
    AFSAL_LOKID: [stampSoldAt, finalizeCommission],
  },
};
