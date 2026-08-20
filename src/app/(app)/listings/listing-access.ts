import "server-only";
import { requireTenantUser, type TenantSession } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import type { TenantDb } from "@/core/tenancy/isolation";
import { canManageListing } from "@/core/listings/permissions";

export class ListingAccessError extends Error {
  constructor(public readonly reason: "notFound" | "forbidden") {
    super(`Listing access denied: ${reason}`);
    this.name = "ListingAccessError";
  }
}

export interface ListingAccess {
  session: TenantSession;
  db: TenantDb;
  listing: { id: string; stage: string; vertical: "EIGNIR" | "BILAR" };
  agentUserIds: string[];
}

/**
 * Load a listing in the caller's tenant and verify the caller may modify it
 * (ADMIN, or AGENT assigned to the listing). Throws ListingAccessError —
 * mutation actions catch it and map to their error state.
 */
export async function requireManageableListing(
  listingId: string,
): Promise<ListingAccess> {
  const session = await requireTenantUser();
  const db = getTenantDb(session.user.tenantId);
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      stage: true,
      vertical: true,
      agents: { select: { userId: true } },
    },
  });
  if (!listing) throw new ListingAccessError("notFound");
  const agentUserIds = listing.agents.map((agent) => agent.userId);
  if (!canManageListing(session.user.role, session.user.id, agentUserIds)) {
    throw new ListingAccessError("forbidden");
  }
  return {
    session,
    db,
    listing: { id: listing.id, stage: listing.stage, vertical: listing.vertical },
    agentUserIds,
  };
}
