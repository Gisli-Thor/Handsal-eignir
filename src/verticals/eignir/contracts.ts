// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Draft contract PDF generation for e-signing (SPEC §11): kauptilboð from the
 * accepted offer, kaupsamningur/afsal skeletons. Uploads the rendered PDF and
 * returns its storage key — signing requests reference it as sourceKey.
 */
import React from "react";
import { randomUUID } from "node:crypto";
import type { TenantDb } from "@/core/tenancy/isolation";
import { iskInWords } from "@/core/format/isk-words";
import { unscopedDb } from "@/lib/db";
import { formatDate, formatDateTime, formatISK } from "@/lib/format";
import { renderPdf } from "@/lib/pdf/render";
import { putObject } from "@/lib/storage";
import { propertyAddressLine } from "@/verticals/eignir/display";
import {
  AfsalDocument,
  KaupsamningurDocument,
  KauptilbodDocument,
  type ContractBaseData,
  type ContractParty,
} from "./contracts-pdf";

export type ContractDocType = "KAUPTILBOD" | "KAUPSAMNINGUR" | "AFSAL";

const FYRIRVARI_IS: Record<string, string> = {
  FJARMOGNUN: "Fjármögnun",
  SALA_EIGIN_EIGNAR: "Sala eigin eignar",
  ASTANDSSKODUN: "Ástandsskoðun",
  SAMTHYKKI_STJORNAR: "Samþykki stjórnar",
  ANNAD: "Annað",
};

const TITLES: Record<ContractDocType, string> = {
  KAUPTILBOD: "Kauptilboð",
  KAUPSAMNINGUR: "Kaupsamningur",
  AFSAL: "Afsal",
};

export type GenerateContractResult =
  | { ok: true; storageKey: string; title: string }
  | { ok: false; error: "notFound" | "noAcceptedOffer" | "renderFailed" };

export async function generateContractPdf(
  db: TenantDb,
  tenantId: string,
  listingId: string,
  docType: ContractDocType,
): Promise<GenerateContractResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      property: { include: { postalCode: true } },
      contacts: {
        include: { contact: { select: { name: true, kennitala: true } } },
      },
      offers: {
        where: { status: "ACCEPTED" },
        orderBy: { decidedAt: "desc" },
        take: 1,
        include: {
          buyers: { include: { contact: { select: { name: true, kennitala: true } } } },
          paymentItems: { orderBy: { sortOrder: "asc" } },
          fyrirvarar: { orderBy: { deadline: "asc" } },
        },
      },
      soluyfirlitVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!listing) return { ok: false, error: "notFound" };
  const property = listing.property;
  const acceptedOffer = listing.offers[0] ?? null;
  if (docType === "KAUPTILBOD" && !acceptedOffer) {
    return { ok: false, error: "noAcceptedOffer" };
  }

  const tenant = await unscopedDb.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  const sellers: ContractParty[] = listing.contacts
    .filter((link) => link.role === "SELLER" || link.role === "CO_OWNER")
    .map((link) => ({ name: link.contact.name, kennitala: link.contact.kennitala }));
  const buyers: ContractParty[] = acceptedOffer
    ? acceptedOffer.buyers.map((buyer) => ({
        name: buyer.contact.name,
        kennitala: buyer.contact.kennitala,
        sharePct: buyer.sharePct === null ? null : String(Number(buyer.sharePct)),
      }))
    : listing.contacts
        .filter((link) => link.role === "BUYER")
        .map((link) => ({ name: link.contact.name, kennitala: link.contact.kennitala }));

  const base: ContractBaseData = {
    tenantName: tenant.name,
    addressLine: property ? propertyAddressLine(property) : listing.id,
    locality: property ? `${property.postnumer} ${property.postalCode.locality}` : "",
    fastanumer: property?.fastanumer ?? null,
    printedDate: formatDate(new Date()),
    sellers,
    buyers,
  };

  const amountISK = acceptedOffer?.amountISK ?? listing.askingPriceISK;
  const amount = amountISK === null ? null : formatISK(Number(amountISK));
  const amountWords = amountISK === null ? null : iskInWords(amountISK);

  let element: React.ReactElement;
  if (docType === "KAUPTILBOD") {
    const soluyfirlit = listing.soluyfirlitVersions[0];
    element = React.createElement(KauptilbodDocument, {
      data: {
        ...base,
        amount: amount!,
        amountWords: amountWords!,
        gildistimi: formatDateTime(acceptedOffer!.gildistimi),
        afhending: acceptedOffer!.afhendingDate
          ? formatDate(acceptedOffer!.afhendingDate)
          : null,
        paymentItems: acceptedOffer!.paymentItems.map((item) => ({
          description: item.description,
          amount: formatISK(Number(item.amountISK)),
          dueDate: item.dueDate ? formatDate(item.dueDate) : null,
        })),
        fyrirvarar: acceptedOffer!.fyrirvarar.map((fyrirvari) => ({
          type: FYRIRVARI_IS[fyrirvari.type] ?? fyrirvari.type,
          description: fyrirvari.description,
          deadline: formatDate(fyrirvari.deadline),
        })),
        terms: acceptedOffer!.terms,
        soluyfirlitLine: soluyfirlit
          ? `Aðilar hafa kynnt sér söluyfirlit fasteignasölunnar (útgáfa ${soluyfirlit.version}, dags. ${formatDate(soluyfirlit.createdAt)}) og skoðast það sem hluti af kauptilboði þessu.`
          : null,
      },
    });
  } else if (docType === "KAUPSAMNINGUR") {
    element = React.createElement(KaupsamningurDocument, {
      data: { ...base, amount, amountWords },
    });
  } else {
    element = React.createElement(AfsalDocument, {
      data: { ...base, amount, amountWords },
    });
  }

  let pdf: Buffer;
  try {
    pdf = await renderPdf(element);
  } catch (error) {
    console.error("contract render failed:", error);
    return { ok: false, error: "renderFailed" };
  }

  const storageKey = `tenants/${tenantId}/listings/${listingId}/contracts/${docType.toLowerCase()}-${randomUUID().slice(0, 8)}.pdf`;
  await putObject(storageKey, pdf, "application/pdf");
  return {
    ok: true,
    storageKey,
    title: `${TITLES[docType]} — ${base.addressLine} (DRÖG)`,
  };
}
