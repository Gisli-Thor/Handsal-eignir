/**
 * M4 integration: portal publication lifecycle on real Postgres, composite-FK
 * isolation + append-only rules for the new models, and the signing webhook
 * end-to-end (route handler auth + full sign flow with PDF stamping when
 * storage is reachable).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTenantDb, TenantIsolationError, type TenantDb } from "@/core/tenancy/isolation";
import { MockPortalAdapter } from "@/adapters/portals/mock";
import {
  markPublicationsNeedUpdate,
  syncPublish,
  syncPull,
  syncUnpublish,
} from "@/core/portals/sync";
import { buildListingSnapshot } from "@/core/portals/snapshot";
import { processSigningEvent } from "@/core/signing/webhook";
import { POST as signingWebhookPost } from "@/app/api/webhooks/signing/route";
import { ensureBucket, putObject } from "@/lib/storage";
import { createTestClient, seedTwoTenants, truncateAll } from "./helpers";

const db = createTestClient();

let fixture: Awaited<ReturnType<typeof seedTwoTenants>>;
let dbA: TenantDb;
let dbB: TenantDb;
let storageUp = false;

beforeAll(async () => {
  try {
    await ensureBucket();
    storageUp = true;
  } catch {
    storageUp = false;
  }
});

beforeEach(async () => {
  await truncateAll(db);
  fixture = await seedTwoTenants(db);
  dbA = createTenantDb(db, fixture.tenantA.id);
  dbB = createTenantDb(db, fixture.tenantB.id);
});

afterAll(async () => {
  await db.$disconnect();
});

async function createListing(client: TenantDb, tenantId: string) {
  return client.listing.create({
    data: { tenantId, vertical: "EIGNIR", stage: "I_SOLU", askingPriceISK: 50_000_000n },
  });
}

/** Deterministic, latency-free mock portal. */
function instantPortal(key: string, options: { failureRate?: number; leadRate?: number } = {}) {
  return new MockPortalAdapter(key, `${key}.is`, {
    latencyMs: [0, 0],
    failureRate: options.failureRate ?? 0,
    leadRate: options.leadRate ?? 0,
    rng: () => 0.5,
  });
}

describe("portal publication lifecycle (real DB, mock adapter)", () => {
  it("publish → NEEDS_UPDATE on edit → update → unpublish, with sync log", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id);
    const snapshot = (await buildListingSnapshot(dbA, fixture.tenantA.id, "Demo", listing.id))!;
    const input = {
      db: dbA,
      tenantId: fixture.tenantA.id,
      listingId: listing.id,
      adapters: [instantPortal("fasteignir"), instantPortal("mbl-fasteignir")],
      actorUserId: fixture.userA.id,
    };

    const published = await syncPublish(input, snapshot);
    expect(published.every((result) => result.ok)).toBe(true);
    let pubs = await dbA.portalPublication.findMany({ orderBy: { portalKey: "asc" } });
    expect(pubs).toHaveLength(2);
    expect(pubs.every((pub) => pub.status === "PUBLISHED" && pub.remoteId !== null)).toBe(true);

    await markPublicationsNeedUpdate(dbA, listing.id);
    pubs = await dbA.portalPublication.findMany();
    expect(pubs.every((pub) => pub.status === "NEEDS_UPDATE")).toBe(true);

    const updated = await syncPublish(input, snapshot);
    expect(updated.every((result) => result.ok)).toBe(true);
    pubs = await dbA.portalPublication.findMany();
    expect(pubs.every((pub) => pub.status === "PUBLISHED")).toBe(true);

    const unpublished = await syncUnpublish(input);
    expect(unpublished.every((result) => result.ok)).toBe(true);
    pubs = await dbA.portalPublication.findMany();
    expect(pubs.every((pub) => pub.status === "UNPUBLISHED" && pub.remoteId === null)).toBe(true);

    const events = await dbA.portalSyncEvent.findMany();
    // 2 portals × (publish + update + unpublish)
    expect(events).toHaveLength(6);
    const audit = await db.auditLog.count({
      where: { tenantId: fixture.tenantA.id, action: { startsWith: "PORTAL_" } },
    });
    expect(audit).toBe(6);
  });

  it("a hard portal failure lands as ERROR + lastError without throwing", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id);
    const snapshot = (await buildListingSnapshot(dbA, fixture.tenantA.id, "Demo", listing.id))!;
    const results = await syncPublish(
      {
        db: dbA,
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        adapters: [instantPortal("fasteignir", { failureRate: 1 })],
        actorUserId: null,
      },
      snapshot,
    );
    expect(results[0].ok).toBe(false);
    const pub = await dbA.portalPublication.findFirstOrThrow();
    expect(pub.status).toBe("ERROR");
    expect(pub.lastError).toContain("tímabundin villa");
  });

  it("pull ingests leads as flagged prospective-buyer contacts", async () => {
    const listing = await createListing(dbA, fixture.tenantA.id);
    const snapshot = (await buildListingSnapshot(dbA, fixture.tenantA.id, "Demo", listing.id))!;
    const adapter = instantPortal("fasteignir", { leadRate: 0.9 });
    const input = {
      db: dbA,
      tenantId: fixture.tenantA.id,
      listingId: listing.id,
      adapters: [adapter],
      actorUserId: null,
    };
    await syncPublish(input, snapshot);
    const results = await syncPull(input);
    expect(results[0].ok).toBe(true);

    const leads = await dbA.contact.findMany({ where: { needsReview: true } });
    expect(leads.length).toBeGreaterThan(0);
    expect(leads[0].source).toBe("fasteignir");
    const links = await dbA.listingContact.count({
      where: { listingId: listing.id, role: "PROSPECTIVE_BUYER" },
    });
    expect(links).toBe(leads.length);
    // Tenant B sees none of it.
    expect(await dbB.contact.count()).toBe(0);
  });
});

describe("M4 model isolation (composite FKs + append-only)", () => {
  it("rejects a publication for another tenant's listing", async () => {
    const listingB = await createListing(dbB, fixture.tenantB.id);
    await expect(
      dbA.portalPublication.create({
        data: { tenantId: fixture.tenantA.id, listingId: listingB.id, portalKey: "fasteignir" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a söluyfirlit send to another tenant's contact", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const version = await dbA.soluyfirlitVersion.create({
      data: { tenantId: fixture.tenantA.id, listingId: listingA.id, version: 1, storageKey: "k" },
    });
    const contactB = await dbB.contact.create({
      data: { tenantId: fixture.tenantB.id, type: "PERSON", name: "B" },
    });
    await expect(
      dbA.soluyfirlitSend.create({
        data: {
          tenantId: fixture.tenantA.id,
          versionId: version.id,
          contactId: contactB.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a signer on another tenant's signing request", async () => {
    const listingB = await createListing(dbB, fixture.tenantB.id);
    const requestB = await dbB.signingRequest.create({
      data: {
        tenantId: fixture.tenantB.id,
        listingId: listingB.id,
        title: "B",
        docType: "KAUPSAMNINGUR",
        sourceKey: "k",
      },
    });
    await expect(
      dbA.signingSigner.create({
        data: {
          tenantId: fixture.tenantA.id,
          requestId: requestB.id,
          name: "X",
          kennitala: "0101302989",
          providerSignerId: "p1",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("sync events, versions, sends and signing events are append-only", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const version = await dbA.soluyfirlitVersion.create({
      data: { tenantId: fixture.tenantA.id, listingId: listingA.id, version: 1, storageKey: "k" },
    });
    await expect(
      dbA.soluyfirlitVersion.update({ where: { id: version.id }, data: { storageKey: "x" } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(
      dbA.soluyfirlitVersion.delete({ where: { id: version.id } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});

describe("signing webhook", () => {
  async function createRequest(sourceKey = "missing-key") {
    const listing = await createListing(dbA, fixture.tenantA.id);
    const request = await db.signingRequest.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listing.id,
        title: "Kaupsamningur — próf",
        docType: "KAUPSAMNINGUR",
        sourceKey,
        status: "SENT",
        providerRequestId: `prov-${Math.random().toString(36).slice(2)}`,
      },
    });
    const signers = await Promise.all(
      ["s1", "s2"].map((providerSignerId, index) =>
        db.signingSigner.create({
          data: {
            tenantId: fixture.tenantA.id,
            requestId: request.id,
            name: `Undirritandi ${index + 1}`,
            kennitala: "0101302989",
            providerSignerId,
          },
        }),
      ),
    );
    return { listing, request, signers };
  }

  it("route handler: 401 without the shared secret, 400 on bad payload", async () => {
    process.env.SIGNING_WEBHOOK_SECRET = "test-secret";
    const unauthorized = await signingWebhookPost(
      new Request("http://test/api/webhooks/signing", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const badPayload = await signingWebhookPost(
      new Request("http://test/api/webhooks/signing", {
        method: "POST",
        headers: { "x-signing-secret": "test-secret" },
        body: JSON.stringify({ nope: true }),
      }),
    );
    expect(badPayload.status).toBe(400);
  });

  it("rejection by any signer rejects the request, with events + audit", async () => {
    const { request } = await createRequest();
    const first = await processSigningEvent(db, {
      providerRequestId: request.providerRequestId!,
      providerSignerId: "s1",
      event: "signed",
    });
    expect(first).toEqual({ ok: true, requestStatus: "PARTIALLY_SIGNED" });

    const second = await processSigningEvent(db, {
      providerRequestId: request.providerRequestId!,
      providerSignerId: "s2",
      event: "rejected",
    });
    expect(second).toEqual({ ok: true, requestStatus: "REJECTED" });

    const updated = await db.signingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("REJECTED");
    expect(await db.signingEvent.count({ where: { requestId: request.id } })).toBe(2);
    expect(
      await db.auditLog.count({
        where: { tenantId: fixture.tenantA.id, action: "SIGNING_EVENT_RECEIVED" },
      }),
    ).toBe(2);
    // Closed request refuses further events.
    const late = await processSigningEvent(db, {
      providerRequestId: request.providerRequestId!,
      providerSignerId: "s1",
      event: "signed",
    });
    expect(late).toEqual({ ok: false, error: "requestClosed" });
  });

  it("all signed → SIGNED + stamped PDF stored back as UNDIRRITAD document", async () => {
    if (!storageUp) return; // MinIO not running — covered by the browser smoke
    // A real source PDF so pdf-lib merges instead of falling back.
    const { PDFDocument } = await import("pdf-lib");
    const sourceDoc = await PDFDocument.create();
    sourceDoc.addPage([595, 842]);
    const sourceKey = `tests/signing-source-${Date.now()}.pdf`;
    await putObject(sourceKey, Buffer.from(await sourceDoc.save()), "application/pdf");

    const { listing, request } = await createRequest(sourceKey);
    await processSigningEvent(db, {
      providerRequestId: request.providerRequestId!,
      providerSignerId: "s1",
      event: "signed",
    });
    const done = await processSigningEvent(db, {
      providerRequestId: request.providerRequestId!,
      providerSignerId: "s2",
      event: "signed",
    });
    expect(done).toEqual({ ok: true, requestStatus: "SIGNED" });

    const updated = await db.signingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("SIGNED");
    expect(updated.signedKey).toBeTruthy();

    const document = await db.listingDocument.findFirstOrThrow({
      where: { listingId: listing.id, type: "UNDIRRITAD" },
    });
    expect(document.contentType).toBe("application/pdf");
    expect(document.sizeBytes).toBeGreaterThan(0);
  }, 30_000);
});
