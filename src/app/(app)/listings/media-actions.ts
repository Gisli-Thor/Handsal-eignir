"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/core/audit/log";
import {
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  mediaObjectKey,
} from "@/core/media/constants";
import { createImageDerivatives } from "@/core/media/derivatives";
import {
  deleteObjects,
  getObjectBuffer,
  presignUpload,
  putObject,
} from "@/lib/storage";
import { markPublicationsNeedUpdate } from "@/core/portals/sync";
import { ListingAccessError, requireManageableListing } from "./listing-access";

const CATEGORY = z.enum(["PHOTO", "FLOOR_PLAN", "DOCUMENT_SCAN"]);
const UUID = z.string().uuid();

export type MediaActionError =
  | "notFound"
  | "forbidden"
  | "invalid"
  | "unsupportedType"
  | "tooLarge"
  | "unknown";

export type RequestUploadResult =
  | { ok: true; assetId: string; uploadUrl: string }
  | { ok: false; error: MediaActionError };

export type MediaActionResult = { ok: true } | { ok: false; error: MediaActionError };

function mapError(error: unknown): { ok: false; error: MediaActionError } {
  if (error instanceof ListingAccessError) return { ok: false, error: error.reason };
  return { ok: false, error: "unknown" };
}

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

/** Step 1 of an upload: validate and hand out a presigned PUT URL. */
export async function requestMediaUploadAction(
  listingId: string,
  file: z.infer<typeof requestSchema>,
): Promise<RequestUploadResult> {
  try {
    const { session, listing } = await requireManageableListing(listingId);
    const parsed = requestSchema.safeParse(file);
    if (!parsed.success) return { ok: false, error: "invalid" };
    if (!isAllowedImageType(parsed.data.contentType)) {
      return { ok: false, error: "unsupportedType" };
    }
    if (parsed.data.sizeBytes > MAX_IMAGE_BYTES) {
      return { ok: false, error: "tooLarge" };
    }

    const assetId = randomUUID();
    const key = mediaObjectKey(
      session.user.tenantId,
      listing.id,
      assetId,
      "original",
      parsed.data.contentType,
    );
    const uploadUrl = await presignUpload(key, parsed.data.contentType);
    return { ok: true, assetId, uploadUrl };
  } catch (error) {
    return mapError(error);
  }
}

const confirmSchema = z.object({
  assetId: UUID,
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().min(1).max(100),
  category: CATEGORY,
});

/**
 * Step 2: after the browser PUT succeeds, generate derivatives server-side
 * and create the MediaAsset row. Keys are always derived server-side from
 * (tenant, listing, assetId) — the client never controls storage paths.
 */
export async function confirmMediaUploadAction(
  listingId: string,
  input: z.infer<typeof confirmSchema>,
): Promise<MediaActionResult> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    if (!isAllowedImageType(parsed.data.contentType)) {
      return { ok: false, error: "unsupportedType" };
    }
    const { assetId, filename, contentType, category } = parsed.data;
    const tenantId = session.user.tenantId;

    const originalKey = mediaObjectKey(tenantId, listing.id, assetId, "original", contentType);
    const webKey = mediaObjectKey(tenantId, listing.id, assetId, "web", contentType);
    const thumbKey = mediaObjectKey(tenantId, listing.id, assetId, "thumb", contentType);

    const original = await getObjectBuffer(originalKey);
    if (original.byteLength > MAX_IMAGE_BYTES) {
      await deleteObjects([originalKey]);
      return { ok: false, error: "tooLarge" };
    }
    const derivatives = await createImageDerivatives(original);
    await putObject(webKey, derivatives.web, "image/jpeg");
    await putObject(thumbKey, derivatives.thumb, "image/jpeg");

    const [aggregate, coverCount] = await Promise.all([
      db.mediaAsset.aggregate({
        where: { listingId: listing.id },
        _max: { sortOrder: true },
      }),
      db.mediaAsset.count({ where: { listingId: listing.id, isCover: true } }),
    ]);

    const asset = await db.mediaAsset.create({
      data: {
        tenantId,
        listingId: listing.id,
        category,
        storageKey: originalKey,
        webKey,
        thumbKey,
        filename,
        contentType,
        sizeBytes: original.byteLength,
        width: derivatives.width,
        height: derivatives.height,
        sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
        isCover: category === "PHOTO" && coverCount === 0,
        uploadedById: session.user.id,
      },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "MEDIA_UPLOADED",
      targetType: "MediaAsset",
      targetId: asset.id,
      metadata: { listingId: listing.id, filename, category },
    });

    await markPublicationsNeedUpdate(db, listing.id);
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteMediaAction(
  listingId: string,
  mediaId: string,
): Promise<MediaActionResult> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const asset = await db.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.listingId !== listing.id) {
      return { ok: false, error: "notFound" };
    }

    await db.mediaAsset.delete({ where: { id: asset.id } });
    await deleteObjects([asset.storageKey, asset.webKey, asset.thumbKey]);

    // Keep exactly one cover while photos remain.
    if (asset.isCover) {
      const next = await db.mediaAsset.findFirst({
        where: { listingId: listing.id, category: "PHOTO" },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await db.mediaAsset.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    await logAudit(db, {
      actorUserId: session.user.id,
      action: "MEDIA_DELETED",
      targetType: "MediaAsset",
      targetId: asset.id,
      metadata: { listingId: listing.id, filename: asset.filename },
    });
    await markPublicationsNeedUpdate(db, listing.id);
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function setCoverAction(
  listingId: string,
  mediaId: string,
): Promise<MediaActionResult> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    const asset = await db.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.listingId !== listing.id) {
      return { ok: false, error: "notFound" };
    }
    await db.mediaAsset.updateMany({
      where: { listingId: listing.id, isCover: true },
      data: { isCover: false },
    });
    await db.mediaAsset.update({ where: { id: mediaId }, data: { isCover: true } });
    await markPublicationsNeedUpdate(db, listing.id);
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function setMediaCategoryAction(
  listingId: string,
  mediaId: string,
  category: z.infer<typeof CATEGORY>,
): Promise<MediaActionResult> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    const parsed = CATEGORY.safeParse(category);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const asset = await db.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.listingId !== listing.id) {
      return { ok: false, error: "notFound" };
    }
    await db.mediaAsset.update({
      where: { id: mediaId },
      data: {
        category: parsed.data,
        // A cover must stay a photo.
        isCover: parsed.data === "PHOTO" ? asset.isCover : false,
      },
    });
    await markPublicationsNeedUpdate(db, listing.id);
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

/** Persist a drag-to-reorder result: `orderedIds` is the full new order. */
export async function reorderMediaAction(
  listingId: string,
  orderedIds: string[],
): Promise<MediaActionResult> {
  try {
    const { db, listing } = await requireManageableListing(listingId);
    const parsed = z.array(z.string().min(1)).max(500).safeParse(orderedIds);
    if (!parsed.success) return { ok: false, error: "invalid" };

    const existing = await db.mediaAsset.findMany({
      where: { listingId: listing.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((asset) => asset.id));
    const ids = parsed.data.filter((id) => existingIds.has(id));
    if (ids.length !== existingIds.size) return { ok: false, error: "invalid" };

    await db.$transaction(
      ids.map((id, index) =>
        db.mediaAsset.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    await markPublicationsNeedUpdate(db, listing.id);
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
