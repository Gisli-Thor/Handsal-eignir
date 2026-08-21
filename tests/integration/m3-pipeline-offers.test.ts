/**
 * M3 integration: pipeline engine against real Postgres, offer/fyrirvarar
 * isolation via composite tenant-safe FKs, the offer expiry job, and the
 * fyrirvarar reminder job (with the mock email adapter).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTenantDb, TenantIsolationError, type TenantDb } from "@/core/tenancy/isolation";
import { executeTransition } from "@/core/pipeline/engine";
import { eignirPipeline } from "@/verticals/eignir/pipeline";
import { expireOverdueOffers } from "@/core/offers/expiry";
import { sendFyrirvariReminders } from "@/core/fyrirvarar/reminders";
import { MockEmailAdapter } from "@/adapters/email/mock";
import { createTestClient, seedTwoTenants, truncateAll } from "./helpers";

const db = createTestClient();

let fixture: Awaited<ReturnType<typeof seedTwoTenants>>;
let dbA: TenantDb;
let dbB: TenantDb;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await truncateAll(db);
  fixture = await seedTwoTenants(db);
  dbA = createTenantDb(db, fixture.tenantA.id);
  dbB = createTenantDb(db, fixture.tenantB.id);
});

afterAll(async () => {
  await db.$disconnect();
});

async function createListing(client: TenantDb, tenantId: string, stage = "UNDIRBUNINGUR") {
  return client.listing.create({
    data: { tenantId, vertical: "EIGNIR", stage, askingPriceISK: 50_000_000n },
  });
}

async function createOffer(
  client: TenantDb,
  tenantId: string,
  listingId: string,
  overrides: Partial<{ status: "PENDING" | "ACCEPTED"; gildistimi: Date }> = {},
) {
  return client.offer.create({
    data: {
      tenantId,
      listingId,
      amountISK: 48_000_000n,
      gildistimi: overrides.gildistimi ?? new Date(Date.now() + 2 * DAY_MS),
      status: overrides.status ?? "PENDING",
    },
  });
}

describe("pipeline engine on real DB", () => {
  it("transitions, writes history, stamps publishedAt via hook, audits", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id);
    const result = await executeTransition(dbA, eignirPipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: listing.stage },
      to: "I_SOLU",
      actorUserId: fixture.userA.id,
    });
    expect(result).toEqual({ ok: true, hookErrors: [] });

    const updated = await dbA.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.stage).toBe("I_SOLU");
    expect(updated.publishedAt).not.toBeNull();

    const history = await dbA.stageTransition.findMany({ where: { listingId: listing.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStage: "UNDIRBUNINGUR",
      toStage: "I_SOLU",
      actorUserId: fixture.userA.id,
    });

    const audit = await db.auditLog.findMany({ where: { action: "STAGE_CHANGED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].tenantId).toBe(fixture.tenantA.id);
  });

  it("fyrirvarar guard blocks Kaupsamningur and ADMIN override is recorded", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "TILBOD_SAMTHYKKT");
    const offer = await createOffer(dbA, fixture.tenantA.id, listing.id, {
      status: "ACCEPTED",
    });
    await dbA.fyrirvari.create({
      data: {
        tenantId: fixture.tenantA.id,
        offerId: offer.id,
        type: "FJARMOGNUN",
        description: "Greiðslumat",
        deadline: new Date(Date.now() + 5 * DAY_MS),
        responsible: "BUYER",
      },
    });

    const blocked = await executeTransition(dbA, eignirPipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "TILBOD_SAMTHYKKT" },
      to: "KAUPSAMNINGUR",
      actorUserId: fixture.userA.id,
    });
    expect(blocked).toEqual({
      ok: false,
      error: "blocked",
      code: "fyrirvararOpen",
      overridable: true,
    });

    const overridden = await executeTransition(dbA, eignirPipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: "TILBOD_SAMTHYKKT" },
      to: "KAUPSAMNINGUR",
      actorUserId: fixture.userA.id,
      override: true,
      reason: "Stjórnandaákvörðun",
    });
    expect(overridden.ok).toBe(true);

    const history = await dbA.stageTransition.findFirst({
      where: { listingId: listing.id, toStage: "KAUPSAMNINGUR" },
    });
    expect(history).toMatchObject({ overridden: true, reason: "Stjórnandaákvörðun" });
    const overrideAudit = await db.auditLog.count({
      where: { action: "STAGE_GUARD_OVERRIDDEN", tenantId: fixture.tenantA.id },
    });
    expect(overrideAudit).toBe(1);
  });

  it("stage history is append-only through the scoped client", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id);
    await executeTransition(dbA, eignirPipeline, {
      tenantId: fixture.tenantA.id,
      listing: { id: listing.id, stage: listing.stage },
      to: "I_SOLU",
      actorUserId: null,
    });
    const row = await dbA.stageTransition.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    await expect(
      dbA.stageTransition.update({ where: { id: row.id }, data: { toStage: "X" } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(
      dbA.stageTransition.delete({ where: { id: row.id } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});

describe("offer isolation (composite FKs)", () => {
  it("offers are invisible across tenants", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const offer = await createOffer(dbA, fixture.tenantA.id, listingA.id);
    expect(await dbB.offer.findUnique({ where: { id: offer.id } })).toBeNull();
    expect(await dbB.offer.count()).toBe(0);
  });

  it("reject an offer on another tenant's listing", async () => {
    const listingB = await createListing(dbB, fixture.tenantB.id);
    await expect(
      createOffer(dbA, fixture.tenantA.id, listingB.id),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("reject a buyer link to another tenant's contact", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const offer = await createOffer(dbA, fixture.tenantA.id, listingA.id);
    const contactB = await dbB.contact.create({
      data: { tenantId: fixture.tenantB.id, type: "PERSON", name: "B-kaupandi" },
    });
    await expect(
      dbA.offerBuyer.create({
        data: { tenantId: fixture.tenantA.id, offerId: offer.id, contactId: contactB.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("reject a counter-offer chained to another tenant's offer", async () => {
    const listingB = await createListing(dbB, fixture.tenantB.id);
    const offerB = await createOffer(dbB, fixture.tenantB.id, listingB.id);
    const listingA = await createListing(dbA, fixture.tenantA.id);
    await expect(
      dbA.offer.create({
        data: {
          tenantId: fixture.tenantA.id,
          listingId: listingA.id,
          parentId: offerB.id,
          amountISK: 1n,
          gildistimi: new Date(Date.now() + DAY_MS),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("reject a viewing attendee from another tenant", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const viewing = await dbA.viewing.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listingA.id,
        kind: "SKODUN",
        startsAt: new Date(),
      },
    });
    const contactB = await dbB.contact.create({
      data: { tenantId: fixture.tenantB.id, type: "PERSON", name: "B-gestur" },
    });
    await expect(
      dbA.viewingAttendee.create({
        data: { tenantId: fixture.tenantA.id, viewingId: viewing.id, contactId: contactB.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("reject assigning a task to another tenant's user", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    await expect(
      dbA.listingTask.create({
        data: {
          tenantId: fixture.tenantA.id,
          listingId: listingA.id,
          title: "Verkefni",
          assigneeUserId: fixture.userB.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

describe("offer expiry job", () => {
  it("expires overdue PENDING offers across tenants and audits per tenant", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const listingB = await createListing(dbB, fixture.tenantB.id);
    const past = new Date(Date.now() - DAY_MS);
    const overdueA = await createOffer(dbA, fixture.tenantA.id, listingA.id, {
      gildistimi: past,
    });
    const overdueB = await createOffer(dbB, fixture.tenantB.id, listingB.id, {
      gildistimi: past,
    });
    const stillOpen = await createOffer(dbA, fixture.tenantA.id, listingA.id);
    const accepted = await createOffer(dbA, fixture.tenantA.id, listingA.id, {
      status: "ACCEPTED",
      gildistimi: past,
    });

    expect(await expireOverdueOffers(db)).toBe(2);

    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: overdueA.id } })).status,
    ).toBe("EXPIRED");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: overdueB.id } })).status,
    ).toBe("EXPIRED");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: stillOpen.id } })).status,
    ).toBe("PENDING");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: accepted.id } })).status,
    ).toBe("ACCEPTED");

    const audits = await db.auditLog.findMany({ where: { action: "OFFER_EXPIRED" } });
    expect(audits.map((a) => a.tenantId).sort()).toEqual(
      [fixture.tenantA.id, fixture.tenantB.id].sort(),
    );
    // Second run is a no-op.
    expect(await expireOverdueOffers(db)).toBe(0);
  });
});

describe("fyrirvarar reminder job", () => {
  it("emails the primary agent per tier, never twice", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id, "TILBOD_SAMTHYKKT");
    await dbA.listingAgent.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        userId: fixture.userA.id,
        isPrimary: true,
      },
    });
    const offer = await createOffer(dbA, fixture.tenantA.id, listing.id, {
      status: "ACCEPTED",
    });
    await dbA.fyrirvari.create({
      data: {
        tenantId: fixture.tenantA.id,
        offerId: offer.id,
        type: "FJARMOGNUN",
        description: "Greiðslumat",
        deadline: new Date(Date.now() + DAY_MS),
        responsible: "BUYER",
      },
    });
    // A resolved fyrirvari with a near deadline must NOT trigger a reminder.
    await dbA.fyrirvari.create({
      data: {
        tenantId: fixture.tenantA.id,
        offerId: offer.id,
        type: "ANNAD",
        description: "Lokið",
        deadline: new Date(Date.now() + DAY_MS),
        responsible: "SELLER",
        status: "FULFILLED",
      },
    });

    const email = new MockEmailAdapter();
    const first = await sendFyrirvariReminders(db, email);
    expect(first).toEqual({ sent: 1, errors: 0 });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe(fixture.userA.email);
    expect(email.sent[0].subject).toContain("Fyrirvari");

    // Same tier again → stamped, no re-send.
    const second = await sendFyrirvariReminders(db, email);
    expect(second).toEqual({ sent: 0, errors: 0 });
    expect(email.sent).toHaveLength(1);
  });
});
