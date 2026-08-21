"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/core/audit/log";
import { isValidKennitala, normalizeKennitala } from "@/core/contacts/kennitala";
import { isOpenRequestStatus } from "@/core/signing/status";
import { getSigning } from "@/lib/services";
import { createSigningRequestRecord } from "@/lib/signing";
import { generateContractPdf } from "@/verticals/eignir/contracts";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type SigningActionState = {
  ok?: boolean;
  error?:
    | "invalid"
    | "notFound"
    | "forbidden"
    | "unknown"
    | "noAcceptedOffer"
    | "renderFailed"
    | "invalidKennitala"
    | "adapterFailed"
    | "notOpen";
} | null;

function mapError(error: unknown): SigningActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

const createSchema = z.object({
  source: z.union([
    z.object({ kind: z.enum(["KAUPTILBOD", "KAUPSAMNINGUR", "AFSAL"]) }),
    z.object({ kind: z.literal("DOCUMENT"), documentId: z.string().min(1) }),
  ]),
  signers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        kennitala: z.string().trim().min(1).max(20),
        email: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(50).optional(),
      }),
    )
    .min(1)
    .max(10),
});

export async function createSigningRequestAction(
  listingId: string,
  input: z.infer<typeof createSchema>,
): Promise<SigningActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid" };

    // Signers are identified by kennitala + name + email/phone (SPEC §11).
    const signers = [];
    for (const signer of parsed.data.signers) {
      const kennitala = normalizeKennitala(signer.kennitala);
      if (!isValidKennitala(kennitala)) return { error: "invalidKennitala" };
      signers.push({
        name: signer.name,
        kennitala,
        email: signer.email || null,
        phone: signer.phone || null,
      });
    }

    let sourceKey: string;
    let title: string;
    let docType: "KAUPTILBOD" | "KAUPSAMNINGUR" | "AFSAL" | "UPLOADED_PDF";
    if (parsed.data.source.kind === "DOCUMENT") {
      const document = await db.listingDocument.findUnique({
        where: { id: parsed.data.source.documentId },
      });
      if (!document || document.listingId !== listing.id) return { error: "notFound" };
      if (document.contentType !== "application/pdf") return { error: "invalid" };
      sourceKey = document.storageKey;
      title = document.title;
      docType = "UPLOADED_PDF";
    } else {
      const generated = await generateContractPdf(
        db,
        session.user.tenantId,
        listing.id,
        parsed.data.source.kind,
      );
      if (!generated.ok) return { error: generated.error };
      sourceKey = generated.storageKey;
      title = generated.title;
      docType = parsed.data.source.kind;
    }

    const result = await createSigningRequestRecord(db, {
      tenantId: session.user.tenantId,
      listingId: listing.id,
      title,
      docType,
      sourceKey,
      createdById: session.user.id,
      signers,
    });
    if (!result.ok) return { error: result.error };

    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelSigningRequestAction(
  listingId: string,
  requestId: string,
): Promise<SigningActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const request = await db.signingRequest.findUnique({ where: { id: requestId } });
    if (!request || request.listingId !== listing.id) return { error: "notFound" };
    if (!isOpenRequestStatus(request.status)) return { error: "notOpen" };

    if (request.providerRequestId) {
      await getSigning()
        .cancel(request.providerRequestId)
        .catch(() => {});
    }
    await db.signingRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });
    await db.signingEvent.create({
      data: {
        tenantId: session.user.tenantId,
        requestId: request.id,
        event: "cancelled",
        metadata: { by: session.user.id },
      },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "SIGNING_REQUEST_CANCELLED",
      targetType: "SigningRequest",
      targetId: request.id,
      metadata: { listingId: listing.id },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
