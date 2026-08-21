import { describe, expect, it } from "vitest";
import { canTransition, executeTransition } from "@/core/pipeline/engine";
import type { PipelineConfig, TransitionGuard } from "@/core/pipeline/types";
import type { TenantDb } from "@/core/tenancy/isolation";

const baseConfig: PipelineConfig = {
  vertical: "EIGNIR",
  stages: ["A", "B", "C"],
  withdrawnStage: "FALLID_FRA",
  guards: {},
  hooks: {},
};

/** Minimal fake of the tenant-scoped client for engine tests. */
function fakeDb(options: { staleStage?: boolean } = {}) {
  const transitions: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const listingUpdates: Record<string, unknown>[] = [];
  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    listing: {
      updateMany: async (args: Record<string, unknown>) => {
        listingUpdates.push(args);
        return { count: options.staleStage ? 0 : 1 };
      },
    },
    stageTransition: {
      create: async (args: { data: Record<string, unknown> }) => {
        transitions.push(args.data);
        return args.data;
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        audits.push(args.data);
        return args.data;
      },
    },
  };
  return { db: db as unknown as TenantDb, transitions, audits, listingUpdates };
}

const input = (to: string, extra: Partial<Parameters<typeof executeTransition>[2]> = {}) => ({
  tenantId: "t1",
  listing: { id: "l1", stage: "A" },
  to,
  actorUserId: "u1",
  ...extra,
});

describe("canTransition", () => {
  it("allows any distinct known stage (guards enforce correctness)", () => {
    expect(canTransition(baseConfig, "A", "B")).toBe(true);
    expect(canTransition(baseConfig, "A", "C")).toBe(true);
    expect(canTransition(baseConfig, "C", "A")).toBe(true);
    expect(canTransition(baseConfig, "A", "FALLID_FRA")).toBe(true);
    expect(canTransition(baseConfig, "FALLID_FRA", "B")).toBe(true);
  });

  it("rejects self-transitions and unknown stages", () => {
    expect(canTransition(baseConfig, "A", "A")).toBe(false);
    expect(canTransition(baseConfig, "A", "NOPE")).toBe(false);
    expect(canTransition(baseConfig, "NOPE", "A")).toBe(false);
  });
});

describe("executeTransition", () => {
  it("updates the stage and writes a history row", async () => {
    const { db, transitions } = fakeDb();
    const result = await executeTransition(db, baseConfig, input("B"));
    expect(result).toEqual({ ok: true, hookErrors: [] });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromStage: "A",
      toStage: "B",
      actorUserId: "u1",
      overridden: false,
    });
  });

  it("requires a reason for the withdrawn stage", async () => {
    const { db } = fakeDb();
    expect(await executeTransition(db, baseConfig, input("FALLID_FRA"))).toEqual({
      ok: false,
      error: "reasonRequired",
    });
    const withReason = await executeTransition(
      db,
      baseConfig,
      input("FALLID_FRA", { reason: "Seljandi hætti við" }),
    );
    expect(withReason.ok).toBe(true);
  });

  it("is blocked by a failing guard on the target stage", async () => {
    const guard: TransitionGuard = async () => ({
      ok: false,
      code: "testBlock",
      overridable: true,
    });
    const config = { ...baseConfig, guards: { B: [guard] } };
    const { db } = fakeDb();
    expect(await executeTransition(db, config, input("B"))).toEqual({
      ok: false,
      error: "blocked",
      code: "testBlock",
      overridable: true,
    });
  });

  it("override bypasses an overridable guard, marks the row, audits it", async () => {
    const guard: TransitionGuard = async () => ({
      ok: false,
      code: "testBlock",
      overridable: true,
    });
    const config = { ...baseConfig, guards: { B: [guard] } };
    const { db, transitions, audits } = fakeDb();
    const result = await executeTransition(
      db,
      config,
      input("B", { override: true, reason: "ADMIN ákvörðun" }),
    );
    expect(result.ok).toBe(true);
    expect(transitions[0]).toMatchObject({ overridden: true, reason: "ADMIN ákvörðun" });
    expect(audits.map((a) => a.action)).toContain("STAGE_GUARD_OVERRIDDEN");
  });

  it("override cannot bypass a non-overridable guard", async () => {
    const guard: TransitionGuard = async () => ({
      ok: false,
      code: "hardBlock",
      overridable: false,
    });
    const config = { ...baseConfig, guards: { B: [guard] } };
    const { db } = fakeDb();
    const result = await executeTransition(
      db,
      config,
      input("B", { override: true, reason: "no" }),
    );
    expect(result).toMatchObject({ ok: false, error: "blocked", code: "hardBlock" });
  });

  it("returns conflict when the stage changed concurrently", async () => {
    const { db } = fakeDb({ staleStage: true });
    expect(await executeTransition(db, baseConfig, input("B"))).toEqual({
      ok: false,
      error: "conflict",
    });
  });

  it("collects hook failures without failing the transition", async () => {
    const config = {
      ...baseConfig,
      hooks: {
        B: [
          async () => {},
          async () => {
            throw new Error("portal down");
          },
        ],
      },
    };
    const { db } = fakeDb();
    const result = await executeTransition(db, config, input("B"));
    expect(result).toEqual({ ok: true, hookErrors: ["portal down"] });
  });
});
