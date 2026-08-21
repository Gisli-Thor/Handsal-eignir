// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Composition layer for e-signing (SPEC §11): binds the SigningAdapter to the
 * domain rows. Used by the signing panel actions and the söluyfirlit
 * receipt-confirmation option.
 */
import { logAudit } from "@/core/audit/log";
import type { SigningDocType } from "@/generated/prisma/enums";
import type { TenantDb } from "@/core/tenancy/isolation";
import { getSigning } from "@/lib/services";
import { getObjectBuffer } from "@/lib/storage";

export interface SignerSpec {
  name: string;
  kennitala: string;
  email?: string | null;
  phone?: string | null;
}

export async function createSigningRequestRecord(
  db: TenantDb,
  input: {
    tenantId: string;
    listingId: string;
    title: string;
    docType: SigningDocType;
    /** Storage key of the PDF being sent for signature. */
    sourceKey: string;
    createdById: string | null;
    signers: SignerSpec[];
  },
): Promise<{ ok: true; requestId: string } | { ok: false; error: "adapterFailed" }> {
  let providerResult;
  try {
    const pdf = await getObjectBuffer(input.sourceKey);
    providerResult = await getSigning().createSigningRequest(
      { title: input.title, pdf },
      input.signers.map((signer) => ({
        name: signer.name,
        kennitala: signer.kennitala,
        email: signer.email ?? undefined,
        phone: signer.phone ?? undefined,
      })),
    );
  } catch (error) {
    console.error("signing adapter failed:", error);
    return { ok: false, error: "adapterFailed" };
  }

  const request = await db.$transaction(async (tx) => {
    const row = await tx.signingRequest.create({
      data: {
        tenantId: input.tenantId,
        listingId: input.listingId,
        title: input.title,
        docType: input.docType,
        sourceKey: input.sourceKey,
        status: "SENT",
        providerRequestId: providerResult.providerRequestId,
        createdById: input.createdById,
      },
    });
    for (const [index, signer] of input.signers.entries()) {
      await tx.signingSigner.create({
        data: {
          tenantId: input.tenantId,
          requestId: row.id,
          name: signer.name,
          kennitala: signer.kennitala,
          email: signer.email ?? null,
          phone: signer.phone ?? null,
          providerSignerId: providerResult.signers[index].providerSignerId,
          signerLink: providerResult.signers[index].signerLink,
        },
      });
    }
    await tx.signingEvent.create({
      data: {
        tenantId: input.tenantId,
        requestId: row.id,
        event: "sent",
        metadata: { signers: input.signers.length },
      },
    });
    return row;
  });

  await logAudit(db, {
    actorUserId: input.createdById ?? undefined,
    action: "SIGNING_REQUEST_CREATED",
    targetType: "SigningRequest",
    targetId: request.id,
    metadata: {
      listingId: input.listingId,
      docType: input.docType,
      signers: input.signers.length,
    },
  });
  return { ok: true, requestId: request.id };
}
