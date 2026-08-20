import type { AuditAction } from "@/core/audit/actions";

export interface AuditEntry {
  /** null/undefined = platform-level event (superadmin actions, failed logins) */
  tenantId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/** Minimal shape of a client that can write audit rows — satisfied by both
 * the unscoped Prisma client and the tenant-scoped client (which stamps
 * tenantId itself). */
export interface AuditWriter {
  auditLog: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: { data: any }): Promise<unknown>;
  };
}

/**
 * Append an audit row. Audit writes must never break the business action
 * they describe *except* for compliance-critical lookups (registry lookups),
 * where the caller should await and propagate failures.
 */
export async function logAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: entry.tenantId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
}
