/** Media/document upload rules and storage key layout (SPEC §5). */

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  ...ALLOWED_IMAGE_CONTENT_TYPES,
] as const;

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/** Web-size derivative bound (longest edge, px). */
export const WEB_MAX_EDGE = 1600;
/** Thumbnail derivative bound (longest edge, px). */
export const THUMB_MAX_EDGE = 480;

export function isAllowedImageType(contentType: string): boolean {
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function isAllowedDocumentType(contentType: string): boolean {
  return (ALLOWED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

/** Keys embed the tenant so storage is auditable and exportable per tenant. */
export function mediaObjectKey(
  tenantId: string,
  listingId: string,
  assetId: string,
  variant: "original" | "web" | "thumb",
  contentType: string,
): string {
  const ext = variant === "original" ? extensionFor(contentType) : "jpg";
  return `tenants/${tenantId}/listings/${listingId}/media/${assetId}/${variant}.${ext}`;
}

export function documentObjectKey(
  tenantId: string,
  listingId: string,
  documentId: string,
  contentType: string,
): string {
  return `tenants/${tenantId}/listings/${listingId}/documents/${documentId}.${extensionFor(contentType)}`;
}
