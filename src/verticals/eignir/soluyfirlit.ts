// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Söluyfirlit generation (SPEC §9): assembles data from the listing record,
 * renders the PDF, uploads it, and creates the next SoluyfirlitVersion row.
 * Shared by the server action and the seed script.
 */
import React from "react";
import type { TenantDb } from "@/core/tenancy/isolation";
import { unscopedDb } from "@/lib/db";
import { getObjectBuffer, putObject } from "@/lib/storage";
import { describeSchemeIs } from "@/core/commission/describe";
import { parseScheme } from "@/core/commission/scheme";
import { formatArea, formatDate, formatISK } from "@/lib/format";
import { renderPdf } from "@/lib/pdf/render";
import { propertyAddressLine } from "@/verticals/eignir/display";
import { SoluyfirlitDocument, type SoluyfirlitData } from "./soluyfirlit-pdf";

export function soluyfirlitObjectKey(
  tenantId: string,
  listingId: string,
  version: number,
): string {
  return `tenants/${tenantId}/listings/${listingId}/soluyfirlit/v${version}.pdf`;
}

const PROPERTY_TYPE_IS: Record<string, string> = {
  FJOLBYLI: "Fjölbýli",
  EINBYLI: "Einbýli",
  RADHUS: "Raðhús",
  PARHUS: "Parhús",
  HAED: "Hæð/sérhæð",
  ATVINNUHUSNAEDI: "Atvinnuhúsnæði",
  SUMARHUS: "Sumarhús",
  LOD: "Lóð",
  ANNAD: "Annað",
};

const PARKING_IS: Record<string, string> = {
  NONE: "Ekkert",
  BILSKUR: "Bílskúr",
  BILSKYLI: "Bílskýli",
  STAEDI: "Bílastæði",
  STAEDI_I_BILAHUSI: "Stæði í bílahúsi",
};

async function tryGetBuffer(key: string | null | undefined): Promise<Buffer | null> {
  if (!key) return null;
  try {
    return await getObjectBuffer(key);
  } catch {
    return null;
  }
}

export type GenerateSoluyfirlitResult =
  | { ok: true; versionId: string; version: number; storageKey: string }
  | { ok: false; error: "notFound" | "renderFailed" };

export async function generateSoluyfirlit(
  db: TenantDb,
  tenantId: string,
  listingId: string,
  generatedById: string | null,
): Promise<GenerateSoluyfirlitResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      property: { include: { postalCode: true } },
      loans: { orderBy: { createdAt: "asc" } },
      contacts: {
        where: { role: { in: ["SELLER", "CO_OWNER"] } },
        include: { contact: { select: { name: true, kennitala: true } } },
      },
      agents: {
        where: { isPrimary: true },
        include: { user: { select: { name: true, email: true, phone: true } } },
      },
      media: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        select: { category: true, webKey: true, isCover: true },
      },
    },
  });
  if (!listing || !listing.property) return { ok: false, error: "notFound" };
  const property = listing.property;

  const tenant = await unscopedDb.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      brandColor: true,
      commissionScheme: true,
    },
  });

  // Söluþóknun disclosure (SPEC §9/§10): explicit text overrides the
  // scheme-derived line; the effective scheme = listing override ?? tenant
  // default (M5).
  const effectiveScheme = parseScheme(
    listing.commissionSchemeOverride ?? tenant.commissionScheme,
  );
  const soluthoknun =
    listing.soluthoknunText ??
    (effectiveScheme ? describeSchemeIs(effectiveScheme) : null);

  const coverKey = listing.media.find((m) => m.category === "PHOTO" && m.isCover)?.webKey
    ?? listing.media.find((m) => m.category === "PHOTO")?.webKey;
  const floorPlanKey = listing.media.find((m) => m.category === "FLOOR_PLAN")?.webKey;
  const [coverJpeg, floorPlanJpeg] = await Promise.all([
    tryGetBuffer(coverKey),
    tryGetBuffer(floorPlanKey),
  ]);

  const isk = (value: bigint | null) => (value === null ? "–" : formatISK(Number(value)));
  const num = (value: number | null | undefined) => (value == null ? "–" : String(value));
  const area = (value: unknown) => (value == null ? "–" : formatArea(Number(value)));

  const facts: SoluyfirlitData["facts"] = [
    { label: "Tegund eignar", value: PROPERTY_TYPE_IS[property.tegund] ?? property.tegund },
    { label: "Sveitarfélag", value: property.postalCode.municipality },
    { label: "Birt stærð", value: area(property.birtStaerd) },
    { label: "Þar af geymsla", value: area(property.tharAfGeymsla) },
    { label: "Herbergi", value: num(property.herbergi) },
    { label: "Svefnherbergi", value: num(property.svefnherbergi) },
    { label: "Baðherbergi", value: num(property.badherbergi) },
    { label: "Hæð", value: num(property.haed) },
    { label: "Lyfta", value: property.lyfta ? "Já" : "Nei" },
    {
      label: "Bílskúr/bílastæði",
      value:
        property.parkingType === "NONE"
          ? "Ekkert"
          : `${PARKING_IS[property.parkingType]}${property.parkingCount ? ` (${property.parkingCount})` : ""}`,
    },
    { label: "Byggingarár", value: num(property.byggingarar) },
    { label: "Fasteignamat", value: isk(property.fasteignamatISK) },
    { label: "Brunabótamat", value: isk(property.brunabotamatISK) },
  ];

  const data: SoluyfirlitData = {
    version: 0, // filled below once the number is claimed
    printedDate: formatDate(new Date()),
    brandColor: tenant.brandColor ?? "#b0703c",
    tenant: {
      name: tenant.name,
      address: tenant.address,
      phone: tenant.phone,
      email: tenant.email,
    },
    agent: listing.agents[0]
      ? {
          name: listing.agents[0].user.name,
          phone: listing.agents[0].user.phone,
          email: listing.agents[0].user.email,
        }
      : null,
    addressLine: propertyAddressLine(property),
    locality: `${property.postnumer} ${property.postalCode.locality}`,
    askingPrice: isk(listing.askingPriceISK),
    facts,
    unitRow: {
      fastanumer: property.fastanumer,
      byggingarar: num(property.byggingarar),
      birtStaerd: area(property.birtStaerd),
      brunabotamat: isk(property.brunabotamatISK),
      fasteignamat: isk(property.fasteignamatISK),
    },
    owners: listing.contacts.map((link) => ({
      name: link.contact.name,
      kennitala: link.contact.kennitala,
    })),
    description: listing.descriptionIs,
    loans: listing.loans.map((loan) => ({
      lender: loan.lender,
      balance: formatISK(Number(loan.remainingBalanceISK)),
      terms: [
        loan.verdtryggt ? "Verðtryggt" : "Óverðtryggt",
        loan.interestRatePct !== null
          ? `${String(Number(loan.interestRatePct)).replace(".", ",")}%`
          : null,
        loan.yfirtakanlegt ? "Yfirtakanlegt" : null,
      ]
        .filter(Boolean)
        .join(", "),
    })),
    soluthoknun,
    coverJpeg,
    floorPlanJpeg,
  };

  const latest = await db.soluyfirlitVersion.aggregate({
    where: { listingId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  data.version = version;

  let pdf: Buffer;
  try {
    pdf = await renderPdf(React.createElement(SoluyfirlitDocument, { data }));
  } catch (error) {
    console.error("söluyfirlit render failed:", error);
    return { ok: false, error: "renderFailed" };
  }

  const storageKey = soluyfirlitObjectKey(tenantId, listingId, version);
  await putObject(storageKey, pdf, "application/pdf");
  const row = await db.soluyfirlitVersion.create({
    data: { tenantId, listingId, version, storageKey, generatedById },
  });
  return { ok: true, versionId: row.id, version, storageKey };
}
