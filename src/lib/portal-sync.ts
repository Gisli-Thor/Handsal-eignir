/**
 * Composition layer for portal sync: binds the adapter registry, the
 * tenant-scoped client, and the snapshot builder to the core orchestration
 * (src/core/portals/sync.ts). Used by pipeline hooks and server actions.
 */
import { getTenantDb, unscopedDb } from "@/lib/db";
import { getPortalAdapters } from "@/lib/services";
import { buildListingSnapshot } from "@/core/portals/snapshot";
import {
  syncPublish,
  syncPull,
  syncUnpublish,
  type PortalResult,
  type PortalSyncInput,
} from "@/core/portals/sync";

export type PortalSyncKind = "publish" | "unpublish" | "pull";

export async function runPortalSync(
  kind: PortalSyncKind,
  options: {
    tenantId: string;
    listingId: string;
    actorUserId: string | null;
    portalKeys?: string[];
  },
): Promise<PortalResult[]> {
  const db = getTenantDb(options.tenantId);
  const listing = await db.listing.findUnique({
    where: { id: options.listingId },
    select: { id: true, vertical: true },
  });
  if (!listing) return [];
  // Tenant name for the snapshot — platform model, read via unscopedDb.
  const tenant = await unscopedDb.tenant.findUnique({
    where: { id: options.tenantId },
    select: { name: true },
  });

  const input: PortalSyncInput = {
    db,
    tenantId: options.tenantId,
    listingId: options.listingId,
    adapters: getPortalAdapters(listing.vertical),
    actorUserId: options.actorUserId,
    portalKeys: options.portalKeys,
  };

  if (kind === "unpublish") return syncUnpublish(input);
  if (kind === "pull") return syncPull(input);

  const snapshot = await buildListingSnapshot(
    db,
    options.tenantId,
    tenant?.name ?? "",
    options.listingId,
  );
  if (!snapshot) return [];
  return syncPublish(input, snapshot);
}
