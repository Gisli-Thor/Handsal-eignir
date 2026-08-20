/**
 * Audit log action names. Kept as a TS union over a string column (instead of
 * a Postgres enum) so each milestone can add actions without a migration.
 * Append new actions here; never rename or remove existing ones — the audit
 * log is append-only history.
 */
export const AUDIT_ACTIONS = [
  // Auth
  "LOGIN",
  "LOGIN_FAILED",
  // Platform administration (tenantId = null)
  "TENANT_CREATED",
  "TENANT_UPDATED",
  "PLAN_CREATED",
  "PLAN_UPDATED",
  "PLAN_ASSIGNED",
  // Users
  "USER_CREATED",
  "USER_UPDATED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
