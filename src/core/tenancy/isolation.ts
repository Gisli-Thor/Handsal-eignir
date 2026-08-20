import type { PrismaClient } from "@/generated/prisma/client";
import {
  isAppendOnlyModel,
  isTenantScopedModel,
} from "@/core/tenancy/scoped-models";

/**
 * Thrown whenever a query would cross a tenant boundary or touch a model the
 * scoped client does not cover. Tests assert on this class.
 */
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

/** Read/write operations whose `where` is a plain (non-unique) filter. */
const FILTER_WHERE_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/** Operations whose `where` is a unique selector (extended where unique lets
 * us merge the tenantId filter straight into it, atomically). */
const UNIQUE_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

const MUTATION_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

function guardData(model: string, tenantId: string, data: unknown): void {
  if (data === null || data === undefined) return;
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    const r = row as AnyArgs;
    if (r.tenantId !== undefined && r.tenantId !== tenantId) {
      throw new TenantIsolationError(
        `Refusing to write ${model}.tenantId="${r.tenantId}" from a client scoped to tenant "${tenantId}".`,
      );
    }
    if (r.tenant !== undefined) {
      throw new TenantIsolationError(
        `Nested writes on ${model}.tenant are not allowed through the tenant-scoped client; the tenant is set automatically.`,
      );
    }
  }
}

function stampData(model: string, tenantId: string, data: unknown): unknown {
  guardData(model, tenantId, data);
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as AnyArgs), tenantId }));
  }
  return { ...((data ?? {}) as AnyArgs), tenantId };
}

function mergeUniqueWhere(
  model: string,
  tenantId: string,
  where: AnyArgs | undefined,
): AnyArgs {
  const w = where ?? {};
  if (w.tenantId !== undefined && w.tenantId !== tenantId) {
    throw new TenantIsolationError(
      `Refusing to filter ${model} by tenantId="${w.tenantId}" from a client scoped to tenant "${tenantId}".`,
    );
  }
  return { ...w, tenantId };
}

function andTenantWhere(tenantId: string, where: AnyArgs | undefined): AnyArgs {
  // AND-composition keeps any caller-supplied filter (including a hostile
  // `tenantId` or `OR` clause) from widening the result set.
  return where ? { AND: [{ tenantId }, where] } : { tenantId };
}

/**
 * Wraps a Prisma client so that every operation on a registered tenant-scoped
 * model is transparently constrained to `tenantId`:
 *
 * - reads/batch writes get `tenantId` AND-ed into `where`
 * - unique-where operations get `tenantId` merged into the unique selector
 * - creates get `tenantId` stamped onto `data`
 * - any attempt to pass a foreign tenantId (in where or data), to write the
 *   `tenant` relation directly, or to touch an unregistered model throws
 *   {@link TenantIsolationError}
 * - append-only models reject all update/delete operations
 */
export function createTenantDb(base: PrismaClient, tenantId: string) {
  if (!tenantId) {
    throw new TenantIsolationError("createTenantDb requires a tenantId.");
  }
  return base.$extends({
    name: `tenant-scoped:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) {
            throw new TenantIsolationError(
              `Model ${model} is not tenant-scoped. Platform-level models must be accessed through unscopedDb (superadmin/auth code paths only).`,
            );
          }
          if (isAppendOnlyModel(model) && MUTATION_OPS.has(operation) && !CREATE_OPS.has(operation)) {
            throw new TenantIsolationError(
              `${model} is append-only; ${operation} is not permitted.`,
            );
          }

          const a = { ...((args ?? {}) as AnyArgs) };

          if (FILTER_WHERE_OPS.has(operation)) {
            guardData(model, tenantId, a.data);
            a.where = andTenantWhere(tenantId, a.where);
          } else if (UNIQUE_WHERE_OPS.has(operation)) {
            guardData(model, tenantId, a.data);
            a.where = mergeUniqueWhere(model, tenantId, a.where);
          } else if (CREATE_OPS.has(operation)) {
            a.data = stampData(model, tenantId, a.data);
          } else if (operation === "upsert") {
            a.where = mergeUniqueWhere(model, tenantId, a.where);
            a.create = stampData(model, tenantId, a.create);
            guardData(model, tenantId, a.update);
          } else {
            throw new TenantIsolationError(
              `Operation ${operation} is not supported on the tenant-scoped client.`,
            );
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantDb>;
