"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/core/audit/log";
import {
  documentObjectKey,
  isAllowedDocumentType,
  MAX_DOCUMENT_BYTES,
} from "@/core/media/constants";
import { deleteObjects, getObjectBuffer, presignUpload } from "@/lib/storage";
import { ListingAccessError, requireManageableListing } from "./listing-access";
import type { MediaActionError, MediaActionResult } from "./media-actions";

const DOCUMENT_TYPE = z.enum([
  "EIGNASKIPTAYFIRLYSING",
  "SKILALYSING",
  "VEDBANDAYFIRLIT",
  "ANNAD",
]);

export type RequestDocumentUploadResult =
  | { ok: true; documentId: string; uploadUrl: string }
  | { ok: false; error: MediaActionError };

function mapError(error: unknown): { ok: false; error: MediaActionError } {
  if (error instanceof ListingAccessError) return { ok: false, error: error.reason };
  return { ok: false, error: "unknown" };
}

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

export async function requestDocumentUploadAction(
  listingId: string,
  file: z.infer<typeof requestSchema>,
): Promise<RequestDocumentUploadResult> {
  try {
    const { session, listing } = await requireManageableListing(listingId);
    const parsed = requestSchema.safeParse(file);
    if (!parsed.success) return { ok: false, error: "invalid" };
    if (!isAllowedDocumentType(parsed.data.contentType)) {
      return { ok: false, error: "unsupportedType" };
    }
    if (parsed.data.sizeBytes > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: "tooLarge" };
    }
    const documentId = randomUUID();
    const key = documentObjectKey(
      session.user.tenantId,
      listing.id,
      documentId,
      parsed.data.contentType,
    );
    const uploadUrl = await presignUpload(key, parsed.data.contentType);
    return { ok: true, documentId, uploadUrl };
  } catch (error) {
    return mapError(error);
  }
}

const confirmSchema = z.object({
  documentId: z.string().uuid(),
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().min(1).max(100),
  type: DOCUMENT_TYPE,
  title: z.string().trim().min(1).max(300),
  /** ISO date (yyyy-mm-dd) or empty */
  documentDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])),
});

export async function confirmDocumentUploadAction(
  listingId: string,
  input: z.infer<typeof confirmSchema>,
): Promise<MediaActionResult> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    if (!isAllowedDocumentType(parsed.data.contentType)) {
      return { ok: false, error: "unsupportedType" };
    }
    const { documentId, filename, contentType, type, title, documentDate } = parsed.data;
    const key = documentObjectKey(
      session.user.tenantId,
      listing.id,
      documentId,
      contentType,
    );

    const uploaded = await getObjectBuffer(key);
    if (uploaded.byteLength > MAX_DOCUMENT_BYTES) {
      await deleteObjects([key]);
      return { ok: false, error: "tooLarge" };
    }

    const document = await db.listingDocument.create({
      data: {
        tenantId: session.user.tenantId,
        listingId: listing.id,
        type,
        title,
        documentDate: documentDate ? new Date(`${documentDate}T00:00:00.000Z`) : null,
        storageKey: key,
        filename,
        contentType,
        sizeBytes: uploaded.byteLength,
        uploadedById: session.user.id,
      },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "DOCUMENT_UPLOADED",
      targetType: "ListingDocument",
      targetId: document.id,
      metadata: { listingId: listing.id, type, title },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteDocumentAction(
  listingId: string,
  documentId: string,
): Promise<MediaActionResult> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const document = await db.listingDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.listingId !== listing.id) {
      return { ok: false, error: "notFound" };
    }
    await db.listingDocument.delete({ where: { id: document.id } });
    await deleteObjects([document.storageKey]);
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "DOCUMENT_DELETED",
      targetType: "ListingDocument",
      targetId: document.id,
      metadata: { listingId: listing.id, title: document.title },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
