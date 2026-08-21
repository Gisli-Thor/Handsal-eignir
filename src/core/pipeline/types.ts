/**
 * Pipeline engine types (SPEC §6). Stages are configuration data per
 * vertical; the engine is generic and lives in core. Vertical modules build
 * a {@link PipelineConfig} and app code executes transitions through
 * src/core/pipeline/engine.ts.
 */
import type { TenantDb } from "@/core/tenancy/isolation";

export interface TransitionContext {
  db: TenantDb;
  tenantId: string;
  listingId: string;
  from: string;
  to: string;
  actorUserId: string | null;
}

/** A guard blocks entry into a stage. `overridable` guards can be bypassed
 * by an ADMIN with a logged reason (SPEC §7 fyrirvarar guard). */
export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; overridable: boolean };

export type TransitionGuard = (ctx: TransitionContext) => Promise<GuardResult>;

/** Side-effect run after a committed transition (SPEC §6: portal publish on
 * Í sölu, unpublish on Kaupsamningur, commission on Afsal — registered by
 * their milestones). Hooks are best-effort: a hook failure never rolls back
 * the transition; the engine collects failures for the caller to surface. */
export type TransitionHook = (ctx: TransitionContext) => Promise<void>;

export interface PipelineConfig {
  vertical: "EIGNIR" | "BILAR";
  /** Ordered main flow, first stage = intake. */
  stages: readonly string[];
  /** Terminal side-state reachable from any stage (Fallið frá), requires a reason. */
  withdrawnStage: string;
  /** Guards keyed by TARGET stage. */
  guards: Partial<Record<string, readonly TransitionGuard[]>>;
  /** Post-commit hooks keyed by TARGET stage. */
  hooks: Partial<Record<string, readonly TransitionHook[]>>;
}

export function isKnownStage(config: PipelineConfig, stage: string): boolean {
  return config.stages.includes(stage) || stage === config.withdrawnStage;
}
