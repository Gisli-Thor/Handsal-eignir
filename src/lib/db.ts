import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTenantDb, type TenantDb } from "@/core/tenancy/isolation";

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

const globalForPrisma = globalThis as unknown as {
  prismaUnscoped?: PrismaClient;
  prismaScopedCache?: Map<string, TenantDb>;
};

/**
 * Raw Prisma client with NO tenant scoping.
 *
 * Only legitimate call sites: auth (looking up users by email at login),
 * the /admin superadmin area, the audit log for platform events, seeds and
 * migrations/tests. All tenant business data access goes through
 * {@link getTenantDb}.
 */
export const unscopedDb: PrismaClient =
  globalForPrisma.prismaUnscoped ??
  createPrismaClient(process.env.DATABASE_URL ?? "");

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaUnscoped = unscopedDb;
}

const scopedCache =
  globalForPrisma.prismaScopedCache ?? new Map<string, TenantDb>();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaScopedCache = scopedCache;
}

/**
 * The single entry point for tenant business data. Every query issued through
 * the returned client is constrained to `tenantId` (see
 * src/core/tenancy/isolation.ts).
 */
export function getTenantDb(tenantId: string): TenantDb {
  let db = scopedCache.get(tenantId);
  if (!db) {
    db = createTenantDb(unscopedDb, tenantId);
    scopedCache.set(tenantId, db);
  }
  return db;
}
