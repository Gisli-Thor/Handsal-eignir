/**
 * M5 integration: commission finalization on Afsal/Lokið (freeze-once), the
 * plan-limit guard on real Postgres, CommissionRecord isolation +
 * append-only, and the plan-usage warning job with the mock email adapter.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTenantDb, TenantIsolationError, type TenantDb } from "@/core/tenancy/isolation";
import { executeTransition } from "@/core/pipeline/engine";
import { createCommissionHook } from "@/core/commission/finalize";
import { createPlanLimitGuard } from "@/core/plans/guard";
import { sendUsageWarnings } from "@/core/plans/usage-warning";
import { commissionSchemeSchema } from "@/core/commission/scheme";
import type { PipelineConfig } from "@/core/pipeline/types";
import { eignirPipeline, ACTIVE_STAGES, EIGNIR_STAGES } from "@/verticals/eignir/pipeline";
import { MockEmailAdapter } from "@/adapters/email/mock";
import { createTestClient, seedTwoTenants, truncateAll } from "./helpers";

const db = createTestClient();

let fixture: Awaited<ReturnType<typeof seedTwoTenants>>;
let dbA: TenantDb;

const SCHEME = commissionSchemeSchema.parse({
  version: 1,
  type: "FIXED_PERCENT",
  percent: 2.2,
  lineItems: [{ label: "Gagnaöflun", amountISK: "39900" }],
});

/** Test pipeline: real stages, commission hook wired to a fixed scheme,
 * plan guard wired to the fixture tenant's plan. */
function testPipeline(limit: number | null): PipelineConfig {
  const guard = createPlanLimitGuard({
    activeStages: ACTIVE_STAGES,
    getPlanLimit: async () => limit,
  });
  const hook = createCommissionHook({ getTenantScheme: async () => SCHEME });
  return {
    vertical: "EIGNIR",
    stages: EIGNIR_STAGES,
    withdrawnStage: "FALLID_FRA",
    guards: Object.fromEntries(ACTIVE_STAGES.map((stage) => [stage, [guard]])),
    hooks: { AFSAL_LOKID: [hook] },
  };
}

beforeEach(async () => {
  await truncateAll(db);
  fixture = await seedTwoTenants(db);
  dbA = createTenantDb(db, fixture.tenantA.id);
});

afterAll(async () => {
  await db.$disconnect();
});

async function createListing(
  client: TenantDb,
  tenantId: string,
  stage: string,
  priceISK: bigint | null = 50_000_000n,
) {
  return client.listing.create({
    data: { tenantId, vertical: "EIGNIR", stage, askingPriceISK: priceISK },
  });
}

describe("commission finalization hook (SPEC §10)", () => {
  it("freezes exactly one record on entering Afsal/Lokið; re-entry is a no-op", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "AFHENDING");
    await dbA.listingAgent.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        userId: fixture.userA.id,
        isPrimary: true,
      },
    });

    const pipeline = testPipeline(null);
    const first = await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "AFHENDING" },
      to: "AFSAL_LOKID",
      actorUserId: fixture.userA.id,
    });
    expect(first).toEqual({ ok: true, hookErrors: [] });

    const record = await dbA.commissionRecord.findUniqueOrThrow({
      where: { listingId: listing.id },
    });
    // 2.2% of 50M = 1.100.000; +39.900 fees = 1.139.900; VSK 24% = 273.576.
    expect(record.grossISK).toBe(1_100_000n);
    expect(record.vskISK).toBe(273_576n);
    expect(record.totalISK).toBe(1_413_476n);
    const splits = record.agentSplits as Array<{ userId: string; amountISK: string }>;
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({
      userId: fixture.userA.id,
      amountISK: "1100000",
    });

    // Leave and re-enter the stage — still exactly one, unchanged record.
    await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "AFSAL_LOKID" },
      to: "AFHENDING",
      actorUserId: fixture.userA.id,
    });
    await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "AFHENDING" },
      to: "AFSAL_LOKID",
      actorUserId: fixture.userA.id,
    });
    expect(await dbA.commissionRecord.count()).toBe(1);
    const audits = await db.auditLog.count({
      where: { tenantId: fixture.tenantA.id, action: "COMMISSION_RECORD_CREATED" },
    });
    expect(audits).toBe(1);
  });

  it("uses the accepted offer amount over the asking price", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "AFHENDING", 50_000_000n);
    await dbA.offer.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        amountISK: 48_000_000n,
        gildistimi: new Date(),
        status: "ACCEPTED",
        decidedAt: new Date(),
      },
    });
    await executeTransition(dbA, testPipeline(null), {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "AFHENDING" },
      to: "AFSAL_LOKID",
      actorUserId: null,
    });
    const record = await dbA.commissionRecord.findUniqueOrThrow({
      where: { listingId: listing.id },
    });
    expect(record.salePriceISK).toBe(48_000_000n);
  });

  it("skips priceless listings without failing the transition", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "AFHENDING", null);
    const result = await executeTransition(dbA, testPipeline(null), {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "AFHENDING" },
      to: "AFSAL_LOKID",
      actorUserId: null,
    });
    expect(result).toEqual({ ok: true, hookErrors: [] });
    expect(await dbA.commissionRecord.count()).toBe(0);
  });
});

describe("plan-limit guard on real DB (SPEC §12)", () => {
  it("blocks entering the band at the limit; within-band moves stay free", async () => {
    // Two already-active listings, limit 2.
    await createListing(dbA, fixture.tenantA.id, "I_SOLU");
    const active = await createListing(dbA, fixture.tenantA.id, "TILBOD_MOTTEKID");
    const waiting = await createListing(dbA, fixture.tenantA.id, "UNDIRBUNINGUR");

    const pipeline = testPipeline(2);
    const blocked = await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: waiting.id, stage: "UNDIRBUNINGUR" },
      to: "I_SOLU",
      actorUserId: fixture.userA.id,
    });
    expect(blocked).toEqual({
      ok: false,
      error: "blocked",
      code: "planLimitReached",
      overridable: false,
    });

    // A listing already in the band moves freely at the limit.
    const moved = await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: active.id, stage: "TILBOD_MOTTEKID" },
      to: "TILBOD_SAMTHYKKT",
      actorUserId: fixture.userA.id,
    });
    expect(moved.ok).toBe(true);

    // Freeing a slot (Fallið frá) lets the waiting listing in.
    await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: active.id, stage: "TILBOD_SAMTHYKKT" },
      to: "FALLID_FRA",
      actorUserId: fixture.userA.id,
      reason: "próf",
    });
    const allowed = await executeTransition(dbA, pipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: waiting.id, stage: "UNDIRBUNINGUR" },
      to: "I_SOLU",
      actorUserId: fixture.userA.id,
    });
    expect(allowed.ok).toBe(true);
  });

  it("the production Eignir config guards every band stage", () => {
    for (const stage of ACTIVE_STAGES) {
      expect(eignirPipeline.guards[stage]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("CommissionRecord isolation & immutability", () => {
  it("is invisible across tenants and rejects cross-tenant listings", async () => {
    const dbB = createTenantDb(db, fixture.tenantB.id);
    const listingA = await createListing(dbA, fixture.tenantA.id, "AFSAL_LOKID");
    await dbA.commissionRecord.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listingA.id,
        salePriceISK: 1n,
        scheme: {},
        grossISK: 1n,
        vskISK: 0n,
        totalISK: 1n,
        lineItems: [],
        agentSplits: [],
      },
    });
    expect(await dbB.commissionRecord.count()).toBe(0);

    const listingB = await createListing(dbB, fixture.tenantB.id, "AFSAL_LOKID");
    await expect(
      dbA.commissionRecord.create({
        data: {
          tenantId: fixture.tenantA.id,
          listingId: listingB.id,
          salePriceISK: 1n,
          scheme: {},
          grossISK: 1n,
          vskISK: 0n,
          totalISK: 1n,
          lineItems: [],
          agentSplits: [],
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("is append-only through the scoped client", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "AFSAL_LOKID");
    const record = await dbA.commissionRecord.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        salePriceISK: 1n,
        scheme: {},
        grossISK: 1n,
        vskISK: 0n,
        totalISK: 1n,
        lineItems: [],
        agentSplits: [],
      },
    });
    await expect(
      dbA.commissionRecord.update({ where: { id: record.id }, data: { grossISK: 2n } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(
      dbA.commissionRecord.delete({ where: { id: record.id } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});

describe("plan-usage warning job (SPEC §12)", () => {
  const STAGES = { EIGNIR: ACTIVE_STAGES };

  async function setLimit(limit: number) {
    await db.plan.update({
      where: { id: fixture.plan.id },
      data: { maxActiveListings: limit },
    });
  }

  it("warns every ADMIN once when crossing 90%, clears when usage drops", async () => {
    await setLimit(10);
    for (let i = 0; i < 9; i += 1) {
      await createListing(dbA, fixture.tenantA.id, "I_SOLU");
    }
    const email = new MockEmailAdapter();

    const first = await sendUsageWarnings(db, email, STAGES);
    expect(first.sent).toBe(1); // one ADMIN in the fixture
    expect(email.sent[0].to).toBe(fixture.userA.email);
    expect(email.sent[0].subject).toContain("9 af 10");

    // Second run: stamped — no re-send.
    const second = await sendUsageWarnings(db, email, STAGES);
    expect(second.sent).toBe(0);

    // Usage drops below 90% → stamp cleared…
    const one = await dbA.listing.findFirstOrThrow({ where: { stage: "I_SOLU" } });
    await dbA.listing.update({ where: { id: one.id }, data: { stage: "FALLID_FRA" } });
    const third = await sendUsageWarnings(db, email, STAGES);
    expect(third.cleared).toBe(1);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: fixture.tenantA.id } });
    expect(tenant.usageWarnedAt).toBeNull();

    // …and crossing again re-warns.
    await dbA.listing.update({ where: { id: one.id }, data: { stage: "I_SOLU" } });
    const fourth = await sendUsageWarnings(db, email, STAGES);
    expect(fourth.sent).toBe(1);
  });

  it("rolls the stamp back when the send fails", async () => {
    await setLimit(1);
    await createListing(dbA, fixture.tenantA.id, "I_SOLU");
    const failing = {
      send: async () => {
        throw new Error("smtp down");
      },
    };
    const result = await sendUsageWarnings(db, failing, STAGES);
    expect(result.errors).toBe(1);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: fixture.tenantA.id } });
    expect(tenant.usageWarnedAt).toBeNull(); // retried next run
  });

  it("ignores unlimited plans", async () => {
    await db.plan.update({
      where: { id: fixture.plan.id },
      data: { maxActiveListings: null },
    });
    for (let i = 0; i < 3; i += 1) {
      await createListing(dbA, fixture.tenantA.id, "I_SOLU");
    }
    const email = new MockEmailAdapter();
    const result = await sendUsageWarnings(db, email, STAGES);
    expect(result.sent).toBe(0);
  });
});
