/**
 * M2 cross-tenant isolation for the domain models (SPEC §1.2, §13).
 *
 * The generic scoping mechanism is proven in tenant-isolation.test.ts; this
 * suite covers the M2-specific hardening: per-tenant unique kennitala and the
 * composite (tenantId, id) foreign keys that make cross-tenant references
 * impossible at the database level even if application code slips.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTenantDb, type TenantDb } from "@/core/tenancy/isolation";
import { createTestClient, seedTwoTenants, truncateAll } from "./helpers";

const db = createTestClient();

let fixture: Awaited<ReturnType<typeof seedTwoTenants>>;
let dbA: TenantDb;
let dbB: TenantDb;

beforeEach(async () => {
  await truncateAll(db);
  fixture = await seedTwoTenants(db);
  dbA = createTenantDb(db, fixture.tenantA.id);
  dbB = createTenantDb(db, fixture.tenantB.id);
});

afterAll(async () => {
  await db.$disconnect();
});

function expectPrismaCode(error: unknown, code: string) {
  expect(error).toMatchObject({ code });
}

async function createListing(client: TenantDb, tenantId: string) {
  return client.listing.create({
    data: { tenantId, vertical: "EIGNIR", askingPriceISK: 50_000_000n },
  });
}

describe("contacts", () => {
  it("are invisible across tenants", async () => {
    const contact = await dbA.contact.create({
      data: {
        tenantId: fixture.tenantA.id,
        type: "PERSON",
        name: "Gunna",
        kennitala: "0101302989",
      },
    });
    expect(await dbB.contact.findUnique({ where: { id: contact.id } })).toBeNull();
    expect(await dbB.contact.count()).toBe(0);
  });

  it("allow the same kennitala in different tenants but not twice in one", async () => {
    await dbA.contact.create({
      data: {
        tenantId: fixture.tenantA.id,
        type: "PERSON",
        name: "Gunna",
        kennitala: "0101302989",
      },
    });
    await expect(
      dbB.contact.create({
        data: {
          tenantId: fixture.tenantB.id,
          type: "PERSON",
          name: "Gunna hjá B",
          kennitala: "0101302989",
        },
      }),
    ).resolves.toBeTruthy();
    await expect(
      dbA.contact
        .create({
          data: {
            tenantId: fixture.tenantA.id,
            type: "PERSON",
            name: "Tvítekin",
            kennitala: "0101302989",
          },
        })
        .catch((error) => {
          expectPrismaCode(error, "P2002");
          throw error;
        }),
    ).rejects.toBeTruthy();
  });
});

describe("composite tenant-safe foreign keys", () => {
  it("reject linking another tenant's contact to a listing", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    const contactB = await dbB.contact.create({
      data: { tenantId: fixture.tenantB.id, type: "PERSON", name: "B-tengiliður" },
    });
    // The scoped client stamps tenantId=A; the DB then refuses because
    // (tenantId A, contactId of B) matches no Contact(tenantId, id).
    await expect(
      dbA.listingContact
        .create({
          data: {
            tenantId: fixture.tenantA.id,
            listingId: listingA.id,
            contactId: contactB.id,
            role: "SELLER",
          },
        })
        .catch((error) => {
          expectPrismaCode(error, "P2003");
          throw error;
        }),
    ).rejects.toBeTruthy();
  });

  it("reject assigning another tenant's user as listing agent", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    await expect(
      dbA.listingAgent
        .create({
          data: {
            tenantId: fixture.tenantA.id,
            listingId: listingA.id,
            userId: fixture.userB.id,
          },
        })
        .catch((error) => {
          expectPrismaCode(error, "P2003");
          throw error;
        }),
    ).rejects.toBeTruthy();
  });

  it("reject attaching a property to another tenant's listing", async () => {
    await db.postalCode.upsert({
      where: { code: "101" },
      create: { code: "101", locality: "Reykjavík", municipality: "Reykjavíkurborg" },
      update: {},
    });
    const listingB = await createListing(dbB, fixture.tenantB.id);
    await expect(
      dbA.property
        .create({
          data: {
            tenantId: fixture.tenantA.id,
            listingId: listingB.id,
            fastanumer: "F1234567",
            gotuheiti: "Laugavegur",
            husnumer: "1",
            postnumer: "101",
            tegund: "FJOLBYLI",
          },
        })
        .catch((error) => {
          expectPrismaCode(error, "P2003");
          throw error;
        }),
    ).rejects.toBeTruthy();
  });

  it("reject media and documents pointing at another tenant's listing", async () => {
    const listingB = await createListing(dbB, fixture.tenantB.id);
    await expect(
      dbA.mediaAsset.create({
        data: {
          tenantId: fixture.tenantA.id,
          listingId: listingB.id,
          category: "PHOTO",
          storageKey: "k",
          filename: "a.jpg",
          contentType: "image/jpeg",
          sizeBytes: 1,
          sortOrder: 0,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      dbA.listingDocument.create({
        data: {
          tenantId: fixture.tenantA.id,
          listingId: listingB.id,
          type: "ANNAD",
          title: "Skjal",
          storageKey: "k",
          filename: "a.pdf",
          contentType: "application/pdf",
          sizeBytes: 1,
        },
      }),
    ).rejects.toBeTruthy();
  });
});

describe("listing aggregates", () => {
  it("scope listings, loans and includes to the tenant", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    await createListing(dbB, fixture.tenantB.id);
    await dbA.encumbranceLoan.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listingA.id,
        lender: "Íslandsbanki",
        remainingBalanceISK: 25_000_000n,
        verdtryggt: true,
      },
    });

    expect(await dbA.listing.count()).toBe(1);
    expect(await dbB.encumbranceLoan.count()).toBe(0);

    const withLoans = await dbA.listing.findUnique({
      where: { id: listingA.id },
      include: { loans: true },
    });
    expect(withLoans?.loans).toHaveLength(1);
  });

  it("cascade-deletes children when a listing is deleted", async () => {
    const listingA = await createListing(dbA, fixture.tenantA.id);
    await dbA.encumbranceLoan.create({
      data: {
        tenantId: fixture.tenantA.id,
        listingId: listingA.id,
        lender: "LÍN",
        remainingBalanceISK: 1n,
      },
    });
    await dbA.listing.delete({ where: { id: listingA.id } });
    expect(await dbA.encumbranceLoan.count()).toBe(0);
  });
});
