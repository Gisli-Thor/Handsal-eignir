/**
 * Portal publishing port (SPEC §8). Implementations live in
 * src/adapters/portals and are selected via src/lib/services.ts
 * (ADAPTER_PORTALS). Eignir portals: fasteignir.is, mbl.is/fasteignir,
 * fasteignaleitin.is; Bílar (M6): bilasolur.is.
 */

/** Plain DTO handed to adapters — assembled by app code, never a Prisma row. */
export interface ListingSnapshot {
  listingId: string;
  tenantId: string;
  tenantName: string;
  addressLine: string;
  postnumer: string | null;
  locality: string | null;
  tegund: string | null;
  askingPriceISK: string | null;
  birtStaerd: number | null;
  herbergi: number | null;
  descriptionIs: string | null;
  /** Signed URLs or keys of web-size photos, cover first. */
  photoKeys: string[];
}

/** Inbound lead fetched on pull (SPEC §8) — lands as a flagged contact. */
export interface PortalLead {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
}

/** Transient upstream failure (network, rate limit). Callers retry once. */
export class TransientPortalError extends Error {
  constructor(message = "Portal temporarily unavailable") {
    super(message);
    this.name = "TransientPortalError";
  }
}

export type PortalRemoteStatus = "LIVE" | "NOT_FOUND" | "UNKNOWN";

export interface PortalAdapter {
  /** Registry key, e.g. "fasteignir" — stored on PortalPublication rows. */
  readonly key: string;
  /** Human-readable portal name, e.g. "fasteignir.is". */
  readonly displayName: string;

  publish(snapshot: ListingSnapshot): Promise<{ remoteId: string }>;
  update(snapshot: ListingSnapshot, remoteId: string): Promise<void>;
  unpublish(remoteId: string): Promise<void>;
  /** Fetch current remote state / new leads. */
  pull(remoteId: string): Promise<{ leads: PortalLead[] }>;
  status(remoteId: string): Promise<PortalRemoteStatus>;
}
