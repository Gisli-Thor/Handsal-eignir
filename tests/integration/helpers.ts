import { hashSync } from "bcryptjs";
import { createPrismaClient } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://handsal:handsal@localhost:5432/handsal_test";

export function createTestClient(): PrismaClient {
  return createPrismaClient(TEST_DATABASE_URL);
}

export async function truncateAll(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "ListingDocument", "MediaAsset", "EncumbranceLoan", "Property", "ListingContact", "ListingAgent", "Listing", "Contact", "PostalCode", "AuditLog", "User", "Tenant", "Plan" CASCADE',
  );
}

const PASSWORD_HASH = hashSync("test-password", 4);

/** Two tenants with one user each — the base fixture for isolation tests. */
export async function seedTwoTenants(db: PrismaClient) {
  const plan = await db.plan.create({
    data: { name: "Test plan", maxActiveListings: 10, monthlyPriceISK: 1000 },
  });
  const tenantA = await db.tenant.create({
    data: { name: "Tenant A", slug: "tenant-a", vertical: "EIGNIR", planId: plan.id },
  });
  const tenantB = await db.tenant.create({
    data: { name: "Tenant B", slug: "tenant-b", vertical: "EIGNIR", planId: plan.id },
  });
  const userA = await db.user.create({
    data: {
      tenantId: tenantA.id,
      name: "User A",
      email: "a@a.test",
      passwordHash: PASSWORD_HASH,
      role: "ADMIN",
    },
  });
  const userB = await db.user.create({
    data: {
      tenantId: tenantB.id,
      name: "User B",
      email: "b@b.test",
      passwordHash: PASSWORD_HASH,
      role: "ADMIN",
    },
  });
  return { plan, tenantA, tenantB, userA, userB };
}
