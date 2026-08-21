// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Signing webhook processor (SPEC §11). Providers (and the /dev/signing
 * simulator) POST status callbacks to /api/webhooks/signing; the route
 * validates and delegates here.
 *
 * The payload has NO tenant context: the request is resolved globally by
 * providerRequestId (unique) via the unscoped client, and tenantId is derived
 * from the row for every subsequent write — the only way a webhook can be
 * tenant-safe.
 *
 * On full signature the source PDF is stamped with a signature page
 * (react-pdf renders it, pdf-lib merges) and stored back on the listing as an
 * UNDIRRITAD document with full status history (SPEC §11).
 */
import React from "react";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { logAudit } from "@/core/audit/log";
import { deriveRequestStatus, isOpenRequestStatus } from "@/core/signing/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { renderPdf } from "@/lib/pdf/render";
import { getObjectBuffer, putObject } from "@/lib/storage";
import { SignaturePageDocument } from "@/lib/pdf/signature-page";

export const signingWebhookPayload = z.object({
  providerRequestId: z.string().min(1).max(200),
  providerSignerId: z.string().min(1).max(200),
  event: z.enum(["signed", "rejected"]),
});

export type SigningWebhookPayload = z.infer<typeof signingWebhookPayload>;

export type WebhookResult =
  | { ok: true; requestStatus: string }
  | { ok: false; error: "unknownRequest" | "unknownSigner" | "requestClosed" | "alreadyActed" };

export async function processSigningEvent(
  db: PrismaClient,
  payload: SigningWebhookPayload,
): Promise<WebhookResult> {
  const request = await db.signingRequest.findUnique({
    where: { providerRequestId: payload.providerRequestId },
    include: { signers: true },
  });
  if (!request) return { ok: false, error: "unknownRequest" };
  if (!isOpenRequestStatus(request.status)) return { ok: false, error: "requestClosed" };

  const signer = request.signers.find(
    (row) => row.providerSignerId === payload.providerSignerId,
  );
  if (!signer) return { ok: false, error: "unknownSigner" };
  if (signer.status !== "PENDING") return { ok: false, error: "alreadyActed" };

  const now = new Date();
  await db.signingSigner.update({
    where: { id: signer.id },
    data: {
      status: payload.event === "signed" ? "SIGNED" : "REJECTED",
      signedAt: payload.event === "signed" ? now : null,
    },
  });

  const signerStatuses = request.signers.map((row) =>
    row.id === signer.id ? (payload.event === "signed" ? "SIGNED" : "REJECTED") : row.status,
  );
  const requestStatus = deriveRequestStatus(signerStatuses);

  let stamped: { signedKey: string; sizeBytes: number } | null = null;
  if (requestStatus === "SIGNED") {
    stamped = await stampSignedDocument({
      tenantId: request.tenantId,
      listingId: request.listingId,
      requestId: request.id,
      title: request.title,
      sourceKey: request.sourceKey,
      signers: request.signers.map((row) => ({
        name: row.name,
        kennitala: row.kennitala,
        signedAt: row.id === signer.id ? now : (row.signedAt ?? now),
      })),
    });
  }

  await db.signingRequest.update({
    where: { id: request.id },
    data: { status: requestStatus, ...(stamped ? { signedKey: stamped.signedKey } : {}) },
  });
  await db.signingEvent.create({
    data: {
      tenantId: request.tenantId,
      requestId: request.id,
      event: payload.event,
      metadata: { signer: signer.name, providerSignerId: signer.providerSignerId },
    },
  });
  await logAudit(db, {
    tenantId: request.tenantId,
    action: "SIGNING_EVENT_RECEIVED",
    targetType: "SigningRequest",
    targetId: request.id,
    metadata: {
      event: payload.event,
      signer: signer.name,
      requestStatus,
      listingId: request.listingId,
    },
  });

  // Fully signed → the document lands back on the listing (SPEC §11).
  if (requestStatus === "SIGNED" && stamped) {
    await db.listingDocument.create({
      data: {
        tenantId: request.tenantId,
        listingId: request.listingId,
        type: "UNDIRRITAD",
        title: `${request.title} — undirritað`,
        documentDate: now,
        storageKey: stamped.signedKey,
        filename: `undirritad-${request.id}.pdf`,
        contentType: "application/pdf",
        sizeBytes: stamped.sizeBytes,
      },
    });
  }

  return { ok: true, requestStatus };
}

/** Render a signature page (react-pdf) and merge it onto the source PDF
 * (pdf-lib). If merging fails (e.g. encrypted upload), the signature page is
 * stored alone rather than failing the SIGNED transition. */
async function stampSignedDocument(
  input: {
    tenantId: string;
    listingId: string;
    requestId: string;
    title: string;
    sourceKey: string;
    signers: Array<{ name: string; kennitala: string; signedAt: Date }>;
  },
): Promise<{ signedKey: string; sizeBytes: number }> {
  const signaturePage = await renderPdf(
    React.createElement(SignaturePageDocument, {
      data: {
        title: input.title,
        signedDate: formatDate(new Date()),
        signers: input.signers.map((signer) => ({
          name: signer.name,
          kennitala: signer.kennitala,
          signedAtFormatted: formatDateTime(signer.signedAt),
        })),
      },
    }),
  );

  let merged: Buffer = signaturePage;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(await getObjectBuffer(input.sourceKey), {
      ignoreEncryption: true,
    });
    const stamp = await PDFDocument.load(signaturePage);
    const pages = await source.copyPages(stamp, stamp.getPageIndices());
    for (const page of pages) source.addPage(page);
    merged = Buffer.from(await source.save());
  } catch (error) {
    console.error("signature-page merge failed, storing signature page alone:", error);
  }

  const signedKey = `tenants/${input.tenantId}/listings/${input.listingId}/signed/${input.requestId}.pdf`;
  await putObject(signedKey, merged, "application/pdf");
  return { signedKey, sizeBytes: merged.byteLength };
}
