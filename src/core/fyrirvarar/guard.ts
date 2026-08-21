/**
 * Fyrirvarar stage guard (SPEC §7): advancing to Kaupsamningur requires every
 * fyrirvari on the listing's ACCEPTED offer to be FULFILLED or WAIVED. An
 * ADMIN can override with a logged reason — hence `overridable: true`.
 */
import type { GuardResult, TransitionContext, TransitionGuard } from "@/core/pipeline/types";

export const FYRIRVARAR_GUARD_CODE = "fyrirvararOpen";

export const fyrirvararGuard: TransitionGuard = async (
  ctx: TransitionContext,
): Promise<GuardResult> => {
  const open = await ctx.db.fyrirvari.count({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      offer: { listingId: ctx.listingId, status: "ACCEPTED" },
    },
  });
  return open === 0
    ? { ok: true }
    : { ok: false, code: FYRIRVARAR_GUARD_CODE, overridable: true };
};
