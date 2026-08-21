/**
 * Handsal Eignir pipeline configuration (SPEC §6).
 *
 * Guards/hooks land with their milestones:
 *  - M3: fyrirvarar guard before Kaupsamningur; publishedAt/soldAt stamps.
 *  - M4: portal auto-publish on Í sölu, auto-unpublish on Kaupsamningur.
 *  - M5: plan-limit guard before Í sölu; commission record on Afsal/Lokið.
 */
import type { PipelineConfig, TransitionHook } from "@/core/pipeline/types";
import { fyrirvararGuard } from "@/core/fyrirvarar/guard";
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

export const eignirPipeline: PipelineConfig = {
  vertical: "EIGNIR",
  stages: EIGNIR_STAGES,
  withdrawnStage: WITHDRAWN_STAGE,
  guards: {
    KAUPSAMNINGUR: [fyrirvararGuard],
  },
  hooks: {
    I_SOLU: [stampPublishedAt, publishToPortals],
    KAUPSAMNINGUR: [unpublishFromPortals],
    AFSAL_LOKID: [stampSoldAt],
  },
};
