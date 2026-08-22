import { describe, expect, it } from "vitest";
import { createPlanLimitGuard, PLAN_LIMIT_GUARD_CODE } from "@/core/plans/guard";
import type { TransitionContext } from "@/core/pipeline/types";
import type { TenantDb } from "@/core/tenancy/isolation";

const BAND = ["I_SOLU", "TILBOD_MOTTEKID", "TILBOD_SAMTHYKKT", "KAUPSAMNINGUR", "AFHENDING"];

function ctx(from: string, to: string, activeCount: number, dbCalls: string[] = []): TransitionContext {
  const db = {
    listing: {
      count: async (args: { where: Record<string, unknown> }) => {
        dbCalls.push("count");
        expect(args.where).toMatchObject({ id: { not: "l1" } });
        return activeCount;
      },
    },
  } as unknown as TenantDb;
  return { db, tenantId: "t1", listingId: "l1", from, to, actorUserId: "u1" };
}

describe("plan-limit guard (SPEC §12)", () => {
  const guard = (limit: number | null) =>
    createPlanLimitGuard({ activeStages: BAND, getPlanLimit: async () => limit });

  it("allows entering the band under the limit", async () => {
    expect(await guard(10)(ctx("UNDIRBUNINGUR", "I_SOLU", 9))).toEqual({ ok: true });
  });

  it("blocks (non-overridable) at the limit", async () => {
    expect(await guard(10)(ctx("UNDIRBUNINGUR", "I_SOLU", 10))).toEqual({
      ok: false,
      code: PLAN_LIMIT_GUARD_CODE,
      overridable: false,
    });
  });

  it("blocks entering any band stage, not just Í sölu (engine allows jumps)", async () => {
    expect(await guard(10)(ctx("UNDIRBUNINGUR", "TILBOD_MOTTEKID", 10))).toMatchObject({
      ok: false,
    });
    expect(await guard(10)(ctx("FALLID_FRA", "AFHENDING", 10))).toMatchObject({
      ok: false,
    });
  });

  it("short-circuits moves within the band without touching the DB", async () => {
    const calls: string[] = [];
    const result = await guard(1)(ctx("TILBOD_MOTTEKID", "TILBOD_SAMTHYKKT", 99, calls));
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
    // Backward moves inside the band too.
    expect(await guard(1)(ctx("TILBOD_MOTTEKID", "I_SOLU", 99, calls))).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it("unlimited plans (null) never block and never count", async () => {
    const calls: string[] = [];
    expect(await guard(null)(ctx("UNDIRBUNINGUR", "I_SOLU", 999, calls))).toEqual({
      ok: true,
    });
    expect(calls).toHaveLength(0);
  });
});
