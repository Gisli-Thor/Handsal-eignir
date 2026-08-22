/**
 * Plan-limit guard (SPEC §12): a tenant may not move a listing into the
 * active band (Í sölu … Afhending) beyond its plan's active-listing cap.
 *
 * Registered on EVERY band stage — the engine allows any→any transitions,
 * so guarding only Í sölu would let e.g. Undirbúningur → Tilboð móttekið
 * activate a listing past the limit. Moves WITHIN the band (including the
 * offer-acceptance system transition and backward moves) short-circuit
 * without touching the database: the listing is already active, the count
 * doesn't change.
 *
 * NON-overridable — SPEC §12 is a hard block with an upgrade prompt.
 * The plan lookup is injected (Tenant/Plan are platform models unreachable
 * through the scoped client); usage is counted through ctx.db.
 */
import type { GuardResult, TransitionContext, TransitionGuard } from "@/core/pipeline/types";

export const PLAN_LIMIT_GUARD_CODE = "planLimitReached";

export function createPlanLimitGuard(deps: {
  activeStages: readonly string[];
  /** null = unlimited plan. */
  getPlanLimit: (tenantId: string) => Promise<number | null>;
}): TransitionGuard {
  return async (ctx: TransitionContext): Promise<GuardResult> => {
    // Already active — moving within the band never changes the count.
    if (deps.activeStages.includes(ctx.from)) return { ok: true };

    const limit = await deps.getPlanLimit(ctx.tenantId);
    if (limit === null) return { ok: true };

    const active = await ctx.db.listing.count({
      where: {
        stage: { in: [...deps.activeStages] },
        // Defensive self-exclusion (self is normally outside the band here).
        id: { not: ctx.listingId },
      },
    });
    return active >= limit
      ? { ok: false, code: PLAN_LIMIT_GUARD_CODE, overridable: false }
      : { ok: true };
  };
}
