import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTenantDb,
  TenantIsolationError,
  type TenantDb,
} from "@/core/tenancy/isolation";
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

describe("tenant-scoped reads", () => {
  it("findMany only returns the tenant's own rows", async () => {
    const users = await dbA.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]!.id).toBe(fixture.userA.id);
  });

  it("findUnique by a foreign row's id returns null", async () => {
    const user = await dbA.user.findUnique({ where: { id: fixture.userB.id } });
    expect(user).toBeNull();
  });

  it("findUnique by a foreign unique email returns null", async () => {
    const user = await dbA.user.findUnique({ where: { email: "b@b.test" } });
    expect(user).toBeNull();
  });

  it("findFirst cannot match foreign rows", async () => {
    const user = await dbA.user.findFirst({ where: { name: "User B" } });
    expect(user).toBeNull();
  });

  it("count is scoped", async () => {
    await expect(dbA.user.count()).resolves.toBe(1);
    await expect(dbB.user.count()).resolves.toBe(1);
  });

  it("a hostile where clause cannot widen the result set", async () => {
    const byForeignTenant = await dbA.user.findMany({
      where: { tenantId: fixture.tenantB.id },
    });
    expect(byForeignTenant).toHaveLength(0);

    const viaOr = await dbA.user.findMany({
      where: { OR: [{ tenantId: fixture.tenantB.id }, { name: "User B" }] },
    });
    expect(viaOr).toHaveLength(0);
  });

  it("aggregate and groupBy are scoped", async () => {
    const agg = await dbA.user.aggregate({ _count: true });
    expect(agg._count).toBe(1);

    const grouped = await dbA.user.groupBy({ by: ["role"], _count: true });
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!._count).toBe(1);
  });

  it("filtering a unique read by a foreign tenantId throws", async () => {
    await expect(
      dbA.user.findUnique({
        where: { id: fixture.userB.id, tenantId: fixture.tenantB.id },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});

describe("tenant-scoped writes", () => {
  it("create stamps the tenantId automatically", async () => {
    const created = await dbA.user.create({
      data: {
        name: "New A",
        email: "new@a.test",
        passwordHash: "x",
        role: "AGENT",
      },
    });
    expect(created.tenantId).toBe(fixture.tenantA.id);
  });

  it("create with a foreign tenantId throws", async () => {
    await expect(
      dbA.user.create({
        data: {
          tenantId: fixture.tenantB.id,
          name: "Spoof",
          email: "spoof@a.test",
          passwordHash: "x",
          role: "AGENT",
        },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("create with a nested tenant relation write throws", async () => {
    await expect(
      dbA.user.create({
        data: {
          tenant: { connect: { id: fixture.tenantB.id } },
          name: "Spoof",
          email: "spoof2@a.test",
          passwordHash: "x",
          role: "AGENT",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("createMany stamps every row and rejects foreign rows", async () => {
    await dbA.user.createMany({
      data: [
        { name: "M1", email: "m1@a.test", passwordHash: "x", role: "AGENT" },
        { name: "M2", email: "m2@a.test", passwordHash: "x", role: "AGENT" },
      ],
    });
    await expect(dbA.user.count()).resolves.toBe(3);
    await expect(dbB.user.count()).resolves.toBe(1);

    await expect(
      dbA.user.createMany({
        data: [
          {
            tenantId: fixture.tenantB.id,
            name: "S",
            email: "s@a.test",
            passwordHash: "x",
            role: "AGENT",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("update cannot touch a foreign row", async () => {
    await expect(
      dbA.user.update({
        where: { id: fixture.userB.id },
        data: { name: "Hacked" },
      }),
    ).rejects.toThrow(); // record not found within tenant scope

    const untouched = await db.user.findUnique({
      where: { id: fixture.userB.id },
    });
    expect(untouched!.name).toBe("User B");
  });

  it("update cannot reassign a row to another tenant", async () => {
    await expect(
      dbA.user.update({
        where: { id: fixture.userA.id },
        data: { tenantId: fixture.tenantB.id },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("updateMany only affects the tenant's own rows", async () => {
    const result = await dbA.user.updateMany({
      where: {},
      data: { name: "Renamed" },
    });
    expect(result.count).toBe(1);

    const b = await db.user.findUnique({ where: { id: fixture.userB.id } });
    expect(b!.name).toBe("User B");
  });

  it("delete cannot remove a foreign row", async () => {
    await expect(
      dbA.user.delete({ where: { id: fixture.userB.id } }),
    ).rejects.toThrow();
    await expect(db.user.count()).resolves.toBe(2);
  });

  it("deleteMany only removes the tenant's own rows", async () => {
    const result = await dbA.user.deleteMany({});
    expect(result.count).toBe(1);
    const remaining = await db.user.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(fixture.userB.id);
  });

  it("upsert stamps the tenantId on the create path", async () => {
    const upserted = await dbA.user.upsert({
      where: { email: "fresh@a.test" },
      create: {
        name: "Fresh",
        email: "fresh@a.test",
        passwordHash: "x",
        role: "AGENT",
      },
      update: { name: "Fresh 2" },
    });
    expect(upserted.tenantId).toBe(fixture.tenantA.id);
  });

  it("upsert cannot update a foreign row (creates within scope instead of touching it)", async () => {
    // userB's email exists globally, but within tenant A's scope it does not.
    // Prisma's native upsert (INSERT ... ON CONFLICT DO UPDATE WHERE tenantId)
    // then affects zero rows; the isolation layer surfaces that as an error —
    // never an update of B's row, never a silent null.
    await expect(
      dbA.user.upsert({
        where: { email: "b@b.test" },
        create: {
          name: "Clone",
          email: "b@b.test",
          passwordHash: "x",
          role: "AGENT",
        },
        update: { name: "Hacked" },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    const b = await db.user.findUnique({ where: { id: fixture.userB.id } });
    expect(b!.name).toBe("User B");
    const rows = await db.user.findMany({ where: { email: "b@b.test" } });
    expect(rows).toHaveLength(1);
  });
});

describe("model coverage", () => {
  it("platform models are not reachable through the scoped client", async () => {
    await expect(dbA.tenant.findMany()).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
    await expect(dbA.plan.findMany()).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
  });

  it("audit log rows are tenant-scoped and append-only", async () => {
    await dbA.auditLog.create({
      data: { action: "LOGIN", actorUserId: fixture.userA.id },
    });
    await dbB.auditLog.create({
      data: { action: "LOGIN", actorUserId: fixture.userB.id },
    });

    const aRows = await dbA.auditLog.findMany();
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.tenantId).toBe(fixture.tenantA.id);

    await expect(
      dbA.auditLog.updateMany({ where: {}, data: { action: "TAMPERED" } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(dbA.auditLog.deleteMany({})).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
    await expect(
      dbA.auditLog.delete({ where: { id: aRows[0]!.id } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("requires a tenantId to construct a scoped client", () => {
    expect(() => createTenantDb(db, "")).toThrow(TenantIsolationError);
  });
});
