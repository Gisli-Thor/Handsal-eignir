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
  // Registry lookups (SPEC §4 — compliance requirement, always awaited)
  "THJODSKRA_LOOKUP",
  // Contacts
  "CONTACT_CREATED",
  "CONTACT_UPDATED",
  "CONTACT_DELETED",
  // Listings & properties
  "LISTING_CREATED",
  "LISTING_UPDATED",
  "LISTING_DELETED",
  // Media & documents
  "MEDIA_UPLOADED",
  "MEDIA_DELETED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DELETED",
  // M3 — pipeline (SPEC §13: stage transitions + fyrirvarar overrides audited)
  "STAGE_CHANGED",
  "STAGE_GUARD_OVERRIDDEN",
  // M3 — offers
  "OFFER_CREATED",
  "OFFER_ACCEPTED",
  "OFFER_REJECTED",
  "OFFER_WITHDRAWN",
  "OFFER_EXPIRED",
  // M3 — fyrirvarar
  "FYRIRVARI_CREATED",
  "FYRIRVARI_RESOLVED",
  "FYRIRVARI_DELETED",
  // M4 — portal publishing (SPEC §8)
  "PORTAL_PUBLISHED",
  "PORTAL_UPDATED",
  "PORTAL_UNPUBLISHED",
  "PORTAL_SYNC_FAILED",
  "PORTAL_LEAD_RECEIVED",
  // M4 — söluyfirlit (SPEC §9, §13: document sends audited)
  "SOLUYFIRLIT_GENERATED",
  "DOCUMENT_SENT",
  // M4 — e-signing (SPEC §11, §13: signing events audited)
  "SIGNING_REQUEST_CREATED",
  "SIGNING_REQUEST_CANCELLED",
  "SIGNING_EVENT_RECEIVED",
  // M5 — commission (SPEC §10)
  "COMMISSION_RECORD_CREATED",
  "COMMISSION_SCHEME_UPDATED",
  "AGENT_SPLIT_UPDATED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
