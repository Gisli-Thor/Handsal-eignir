/**
 * Registry of tenant-scoped Prisma models.
 *
 * Every domain model that carries a `tenantId` column MUST be registered here
 * (PascalCase, as Prisma reports it in client extensions). The tenant-scoped
 * client in src/core/tenancy/isolation.ts refuses to touch any model that is
 * not on this list, so forgetting to register a new model fails loudly
 * instead of silently leaking across tenants.
 *
 * `appendOnly` models additionally reject every update/delete operation.
 */
export const TENANT_SCOPED_MODELS = {
  User: {},
  AuditLog: { appendOnly: true },
  // M2 — contacts & properties. (PostalCode is deliberately absent: it is
  // global reference data with no tenantId, read through unscopedDb.)
  Contact: {},
  Listing: {},
  ListingAgent: {},
  ListingContact: {},
  Property: {},
  EncumbranceLoan: {},
  MediaAsset: {},
  ListingDocument: {},
  // M3 — pipeline, offers, fyrirvarar, activity
  StageTransition: { appendOnly: true },
  Offer: {},
  OfferBuyer: {},
  OfferPaymentItem: {},
  Fyrirvari: {},
  Viewing: {},
  ViewingAttendee: {},
  ListingNote: {},
  ListingTask: {},
  // M4 — portal publishing, söluyfirlit, e-signing
  PortalPublication: {},
  PortalSyncEvent: { appendOnly: true },
  SoluyfirlitVersion: { appendOnly: true },
  SoluyfirlitSend: { appendOnly: true },
  SigningRequest: {},
  SigningSigner: {},
  SigningEvent: { appendOnly: true },
} as const satisfies Record<string, { appendOnly?: boolean }>;

export type TenantScopedModel = keyof typeof TENANT_SCOPED_MODELS;

export function isTenantScopedModel(model: string): model is TenantScopedModel {
  return Object.prototype.hasOwnProperty.call(TENANT_SCOPED_MODELS, model);
}

export function isAppendOnlyModel(model: string): boolean {
  return (
    isTenantScopedModel(model) &&
    (TENANT_SCOPED_MODELS[model] as { appendOnly?: boolean }).appendOnly === true
  );
}
