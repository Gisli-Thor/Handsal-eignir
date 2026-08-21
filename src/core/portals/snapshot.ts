/**
 * Builds the plain ListingSnapshot DTO handed to portal adapters (SPEC §8).
 * Adapters never see Prisma rows.
 */
import type { ListingSnapshot } from "@/core/ports/portals";
import type { TenantDb } from "@/core/tenancy/isolation";

export async function buildListingSnapshot(
  db: TenantDb,
  tenantId: string,
  tenantName: string,
  listingId: string,
): Promise<ListingSnapshot | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      property: { include: { postalCode: true } },
      media: {
        where: { category: "PHOTO" },
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        select: { webKey: true },
      },
    },
  });
  if (!listing) return null;
  const property = listing.property;
  return {
    listingId: listing.id,
    tenantId,
    tenantName,
    addressLine: property
      ? `${property.gotuheiti} ${property.husnumer}${property.ibud ? `, ${property.ibud}` : ""}`
      : listing.id,
    postnumer: property?.postnumer ?? null,
    locality: property?.postalCode.locality ?? null,
    tegund: property?.tegund ?? null,
    askingPriceISK: listing.askingPriceISK?.toString() ?? null,
    birtStaerd: property?.birtStaerd === null || property?.birtStaerd === undefined
      ? null
      : Number(property.birtStaerd),
    herbergi: property?.herbergi ?? null,
    descriptionIs: listing.descriptionIs,
    photoKeys: listing.media
      .map((asset) => asset.webKey)
      .filter((key): key is string => key !== null),
  };
}
