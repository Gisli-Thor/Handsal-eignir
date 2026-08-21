"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { logAudit } from "@/core/audit/log";
import { getEmail } from "@/lib/services";
import { createSigningRequestRecord } from "@/lib/signing";
import {
  EMAIL_LINK_TTL_SECONDS,
  getObjectBuffer,
  presignDownload,
} from "@/lib/storage";
import { generateSoluyfirlit } from "@/verticals/eignir/soluyfirlit";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type SoluyfirlitActionState = {
  ok?: boolean;
  error?:
    | "invalid"
    | "notFound"
    | "forbidden"
    | "unknown"
    | "renderFailed"
    | "noRecipients"
    | "noEmail";
} | null;

function mapError(error: unknown): SoluyfirlitActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

export async function generateSoluyfirlitAction(
  listingId: string,
): Promise<SoluyfirlitActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const result = await generateSoluyfirlit(
      db,
      session.user.tenantId,
      listing.id,
      session.user.id,
    );
    if (!result.ok) return { error: result.error };
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "SOLUYFIRLIT_GENERATED",
      targetType: "Listing",
      targetId: listing.id,
      metadata: { version: result.version },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

const sendSchema = z.object({
  versionId: z.string().min(1),
  contactIds: z.array(z.string().min(1)).min(1).max(50),
  requestReceipt: z.boolean().optional(),
});

/** Send a söluyfirlit version to prospective buyers (SPEC §9): bilingual
 * email, PDF attached + 7-day signed link, send-log row per recipient,
 * optional receipt-confirmation signature request. */
export async function sendSoluyfirlitAction(
  listingId: string,
  input: z.infer<typeof sendSchema>,
): Promise<SoluyfirlitActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = sendSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid" };

    const version = await db.soluyfirlitVersion.findUnique({
      where: { id: parsed.data.versionId },
      include: { listing: { include: { property: true } } },
    });
    if (!version || version.listingId !== listing.id) return { error: "notFound" };

    const contacts = await db.contact.findMany({
      where: { id: { in: parsed.data.contactIds } },
    });
    if (contacts.length === 0) return { error: "noRecipients" };
    if (contacts.some((contact) => !contact.email)) return { error: "noEmail" };

    const property = version.listing.property;
    const addressLine = property
      ? `${property.gotuheiti} ${property.husnumer}${property.ibud ? `, ${property.ibud}` : ""}`
      : listing.id;
    const filename = `Soluyfirlit-${addressLine.replace(/[^\wÀ-ÿ-]+/g, "_")}-v${version.version}.pdf`;

    const [pdf, downloadUrl, tIs, tEn] = await Promise.all([
      getObjectBuffer(version.storageKey),
      presignDownload(version.storageKey, filename, EMAIL_LINK_TTL_SECONDS),
      getTranslations({ locale: "is", namespace: "soluyfirlit.email" }),
      getTranslations({ locale: "en", namespace: "soluyfirlit.email" }),
    ]);

    const email = getEmail();
    for (const contact of contacts) {
      const values = {
        name: contact.name,
        address: addressLine,
        version: version.version,
        link: downloadUrl,
      };
      const { messageId } = await email.send({
        to: contact.email!,
        subject: tIs("subject", values),
        text: [
          tIs("body", values),
          "",
          "— — —",
          "",
          tEn("body", values),
        ].join("\n"),
        attachments: [
          { filename, content: pdf, contentType: "application/pdf" },
        ],
      });

      let receiptSigningRequestId: string | null = null;
      if (parsed.data.requestReceipt && contact.kennitala) {
        const receipt = await createSigningRequestRecord(db, {
          tenantId: session.user.tenantId,
          listingId: listing.id,
          title: `Staðfesting móttöku — Söluyfirlit ${addressLine} (v${version.version})`,
          docType: "SOLUYFIRLIT_RECEIPT",
          sourceKey: version.storageKey,
          createdById: session.user.id,
          signers: [
            {
              name: contact.name,
              kennitala: contact.kennitala,
              email: contact.email,
              phone: contact.phone,
            },
          ],
        });
        if (receipt.ok) receiptSigningRequestId = receipt.requestId;
      }

      await db.soluyfirlitSend.create({
        data: {
          tenantId: session.user.tenantId,
          versionId: version.id,
          contactId: contact.id,
          sentById: session.user.id,
          emailMessageId: messageId || null,
          receiptSigningRequestId,
        },
      });
      await logAudit(db, {
        actorUserId: session.user.id,
        action: "DOCUMENT_SENT",
        targetType: "SoluyfirlitVersion",
        targetId: version.id,
        metadata: {
          listingId: listing.id,
          version: version.version,
          contactId: contact.id,
          receipt: receiptSigningRequestId !== null,
        },
      });
    }

    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
