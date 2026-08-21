/**
 * Pipeline engine (SPEC §6): validates and executes stage transitions,
 * runs guards and hooks, and writes the append-only stage history.
 *
 * Transition rules (decision recorded in PROGRESS.md M3):
 *  - any distinct known stage is reachable from any other — real workflows
 *    skip and revisit stages, so correctness is enforced by guards on the
 *    target stage (fyrirvarar before Kaupsamningur, plan limit before Í sölu
 *    in M5), not by an adjacency matrix;
 *  - entering the withdrawn side-state (Fallið frá) requires a reason;
 *  - an overridable guard may be bypassed with `override` (callers must
 *    verify the actor is ADMIN first) — the transition row is marked and an
 *    audit event written.
 */
import { logAudit } from "@/core/audit/log";
import type {
  GuardResult,
  PipelineConfig,
  TransitionContext,
  TransitionHook,
} from "@/core/pipeline/types";
import { isKnownStage } from "@/core/pipeline/types";
import type { TenantDb } from "@/core/tenancy/isolation";

export type TransitionResult =
  | {
      ok: true;
      /** Hooks that failed post-commit (transition itself succeeded). */
      hookErrors: string[];
    }
  | { ok: false; error: "invalidTransition" }
  | { ok: false; error: "reasonRequired" }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "blocked"; code: string; overridable: boolean };

export interface TransitionInput {
  tenantId: string;
  listing: { id: string; stage: string };
  to: string;
  /** null = system transition (offer acceptance, jobs). */
  actorUserId: string | null;
  /** Required for the withdrawn stage; stored on the history row. */
  reason?: string;
  /** Bypass overridable guards. Caller must have verified ADMIN role. */
  override?: boolean;
}

export function canTransition(
  config: PipelineConfig,
  from: string,
  to: string,
): boolean {
  return from !== to && isKnownStage(config, from) && isKnownStage(config, to);
}

async function runGuards(
  config: PipelineConfig,
  ctx: TransitionContext,
): Promise<GuardResult> {
  for (const guard of config.guards[ctx.to] ?? []) {
    const result = await guard(ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function executeTransition(
  db: TenantDb,
  config: PipelineConfig,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { tenantId, listing, to, actorUserId } = input;
  const from = listing.stage;
  if (!canTransition(config, from, to)) return { ok: false, error: "invalidTransition" };
  const reason = input.reason?.trim() || null;
  if (to === config.withdrawnStage && !reason) {
    return { ok: false, error: "reasonRequired" };
  }

  const ctx: TransitionContext = {
    db,
    tenantId,
    listingId: listing.id,
    from,
    to,
    actorUserId,
  };

  const guardResult = await runGuards(config, ctx);
  let overridden = false;
  if (!guardResult.ok) {
    if (!(guardResult.overridable && input.override && reason)) {
      return {
        ok: false,
        error: "blocked",
        code: guardResult.code,
        overridable: guardResult.overridable,
      };
    }
    overridden = true;
  }

  try {
    await db.$transaction(async (tx) => {
      // Optimistic stage check: a concurrent transition loses (0 rows updated).
      const updated = await tx.listing.updateMany({
        where: { id: listing.id, stage: from },
        data: { stage: to },
      });
      if (updated.count === 0) throw new StaleStageError();
      await tx.stageTransition.create({
        data: {
          tenantId,
          listingId: listing.id,
          fromStage: from,
          toStage: to,
          actorUserId,
          reason,
          overridden,
        },
      });
    });
  } catch (error) {
    if (error instanceof StaleStageError) return { ok: false, error: "conflict" };
    throw error;
  }

  await logAudit(db, {
    actorUserId: actorUserId ?? undefined,
    action: "STAGE_CHANGED",
    targetType: "Listing",
    targetId: listing.id,
    metadata: { from, to, ...(reason ? { reason } : {}) },
  });
  if (overridden) {
    await logAudit(db, {
      actorUserId: actorUserId ?? undefined,
      action: "STAGE_GUARD_OVERRIDDEN",
      targetType: "Listing",
      targetId: listing.id,
      metadata: { from, to, code: (guardResult as { code?: string }).code, reason },
    });
  }

  const hookErrors: string[] = [];
  for (const hook of (config.hooks[to] ?? []) as readonly TransitionHook[]) {
    try {
      await hook(ctx);
    } catch (error) {
      hookErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { ok: true, hookErrors };
}

/** Thrown inside the transaction when the listing's stage changed under us. */
export class StaleStageError extends Error {
  constructor() {
    super("Listing stage changed concurrently");
    this.name = "StaleStageError";
  }
}
