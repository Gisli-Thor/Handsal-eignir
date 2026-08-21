"use server";

import { revalidatePath } from "next/cache";
import { runPortalSync, type PortalSyncKind } from "@/lib/portal-sync";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type PortalActionState = {
  ok?: boolean;
  error?: "invalid" | "notFound" | "forbidden" | "unknown";
  /** Per-portal outcome of a sync run (for toasts). */
  results?: Array<{ portalKey: string; ok: boolean; message?: string }>;
} | null;

function mapError(error: unknown): PortalActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

export async function setPortalEnabledAction(
  listingId: string,
  portalKey: string,
  enabled: boolean,
): Promise<PortalActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    if (!portalKey || portalKey.length > 60) return { error: "invalid" };
    await db.portalPublication.upsert({
      where: { listingId_portalKey: { listingId: listing.id, portalKey } },
      create: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        portalKey,
        enabled,
      },
      update: { enabled },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

/** Manual push (publish/update), unpublish, or pull — per portal or all
 * (SPEC §8 "manual, on demand ... available at any stage"). */
export async function portalSyncAction(
  listingId: string,
  kind: PortalSyncKind,
  portalKey?: string,
): Promise<PortalActionState> {
  try {
    const { session, listing } = await requireManageableListing(listingId);
    if (!["publish", "unpublish", "pull"].includes(kind)) return { error: "invalid" };
    const results = await runPortalSync(kind, {
      tenantId: session.user.tenantId,
      listingId: listing.id,
      actorUserId: session.user.id,
      portalKeys: portalKey ? [portalKey] : undefined,
    });
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/contacts");
    return { ok: true, results };
  } catch (error) {
    return mapError(error);
  }
}
