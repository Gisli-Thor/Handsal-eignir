import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { presignDownload } from "@/lib/storage";
import { formatArea, formatDate, formatISK } from "@/lib/format";
import { canManageListing } from "@/core/listings/permissions";
import { propertyAddressLine } from "@/verticals/eignir/display";
import { MediaManager, type MediaItem } from "./media-manager";
import { DocumentsPanel, type DocumentItem } from "./documents-panel";
import { ContactsPanel } from "./contacts-panel";
import { AgentsPanel } from "./agents-panel";
import { LoansPanel } from "./loans-panel";
import { DeleteListingButton } from "./delete-listing-button";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantUser();
  const t = await getTranslations("listings");
  const tCommon = await getTranslations("common");
  const { id } = await params;
  const db = getTenantDb(session.user.tenantId);

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      property: { include: { postalCode: true } },
      media: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      contacts: {
        include: { contact: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      agents: { include: { user: { select: { id: true, name: true } } } },
      loans: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!listing) notFound();

  const canManage = canManageListing(
    session.user.role,
    session.user.id,
    listing.agents.map((agent) => agent.userId),
  );

  const [mediaItems, documentItems, availableContacts, availableUsers] =
    await Promise.all([
      Promise.all(
        listing.media.map(
          async (asset): Promise<MediaItem> => ({
            id: asset.id,
            thumbUrl: asset.thumbKey ? await presignDownload(asset.thumbKey) : null,
            filename: asset.filename,
            category: asset.category,
            isCover: asset.isCover,
          }),
        ),
      ),
      Promise.all(
        listing.documents.map(
          async (doc): Promise<DocumentItem> => ({
            id: doc.id,
            type: doc.type,
            title: doc.title,
            documentDateFormatted: doc.documentDate
              ? formatDate(doc.documentDate)
              : null,
            filename: doc.filename,
            sizeBytes: doc.sizeBytes,
            downloadUrl: await presignDownload(doc.storageKey, doc.filename),
          }),
        ),
      ),
      db.contact.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        take: 500,
      }),
      db.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  const property = listing.property;
  const addressLine = property ? propertyAddressLine(property) : t("untitled");
  const yesNo = (value: boolean) => (value ? tCommon("yes") : tCommon("no"));

  const facts: Array<{ label: string; value: string }> = property
    ? [
        { label: t("fields.fastanumer"), value: property.fastanumer },
        ...(property.landeignarnumer
          ? [{ label: t("fields.landeignarnumer"), value: property.landeignarnumer }]
          : []),
        {
          label: t("fields.sveitarfelag"),
          value: property.postalCode.municipality,
        },
        { label: t("fields.tegund"), value: t(`propertyType.${property.tegund}`) },
        {
          label: t("fields.birtStaerd"),
          value:
            property.birtStaerd !== null
              ? formatArea(Number(property.birtStaerd))
              : "–",
        },
        {
          label: t("fields.tharAfGeymsla"),
          value:
            property.tharAfGeymsla !== null
              ? formatArea(Number(property.tharAfGeymsla))
              : "–",
        },
        {
          label: t("fields.herbergi"),
          value: property.herbergi?.toString() ?? "–",
        },
        {
          label: t("fields.svefnherbergi"),
          value: property.svefnherbergi?.toString() ?? "–",
        },
        {
          label: t("fields.badherbergi"),
          value: property.badherbergi?.toString() ?? "–",
        },
        { label: t("fields.haed"), value: property.haed?.toString() ?? "–" },
        { label: t("fields.lyfta"), value: yesNo(property.lyfta) },
        {
          label: t("fields.parkingType"),
          value:
            property.parkingType === "NONE"
              ? t("parkingType.NONE")
              : `${t(`parkingType.${property.parkingType}`)}${property.parkingCount ? ` (${property.parkingCount})` : ""}`,
        },
        {
          label: t("fields.byggingarar"),
          value: property.byggingarar?.toString() ?? "–",
        },
        {
          label: t("fields.fasteignamatISK"),
          value:
            property.fasteignamatISK !== null
              ? formatISK(Number(property.fasteignamatISK))
              : "–",
        },
        {
          label: t("fields.brunabotamatISK"),
          value:
            property.brunabotamatISK !== null
              ? formatISK(Number(property.brunabotamatISK))
              : "–",
        },
      ]
    : [];

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/listings">
            <ArrowLeft aria-hidden className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
        {canManage ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/listings/${listing.id}/edit`}>
                <Pencil aria-hidden className="size-4" />
                {tCommon("edit")}
              </Link>
            </Button>
            <DeleteListingButton listingId={listing.id} addressLine={addressLine} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{addressLine}</h1>
          <Badge variant="secondary">{t(`stage.${listing.stage}`)}</Badge>
        </div>
        <p className="text-muted-foreground">
          {property
            ? `${property.postnumer} ${property.postalCode.locality}`
            : null}
        </p>
        <p className="text-xl font-semibold tabular-nums">
          {listing.askingPriceISK !== null
            ? formatISK(Number(listing.askingPriceISK))
            : t("noPrice")}
        </p>
      </div>

      {property ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.facts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-0.5 font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {listing.descriptionIs ? (
              <div className="mt-6 grid gap-1">
                <h3 className="text-sm font-semibold">{t("fields.descriptionIs")}</h3>
                <p className="text-sm whitespace-pre-wrap">{listing.descriptionIs}</p>
              </div>
            ) : null}
            {listing.descriptionEn ? (
              <div className="mt-4 grid gap-1">
                <h3 className="text-sm font-semibold">{t("fields.descriptionEn")}</h3>
                <p className="text-sm whitespace-pre-wrap">{listing.descriptionEn}</p>
              </div>
            ) : null}
            {property.athugasemdir ? (
              <div className="mt-4 grid gap-1">
                <h3 className="text-sm font-semibold">{t("fields.athugasemdir")}</h3>
                <p className="text-sm whitespace-pre-wrap">{property.athugasemdir}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.media")}</CardTitle>
        </CardHeader>
        <CardContent>
          <MediaManager
            listingId={listing.id}
            items={mediaItems}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.documents")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsPanel
            listingId={listing.id}
            documents={documentItems}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.parties")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactsPanel
              listingId={listing.id}
              links={listing.contacts.map((link) => ({
                id: link.id,
                contactId: link.contactId,
                name: link.contact.name,
                role: link.role,
              }))}
              availableContacts={availableContacts}
              canManage={canManage}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sections.agents")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentsPanel
              listingId={listing.id}
              links={listing.agents.map((link) => ({
                id: link.id,
                userId: link.userId,
                name: link.user.name,
                isPrimary: link.isPrimary,
              }))}
              availableUsers={availableUsers}
              canManage={canManage}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.loans")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LoansPanel
            listingId={listing.id}
            loans={listing.loans.map((loan) => ({
              id: loan.id,
              lender: loan.lender,
              remainingBalanceFormatted: formatISK(Number(loan.remainingBalanceISK)),
              verdtryggt: loan.verdtryggt,
              interestRatePct:
                loan.interestRatePct !== null ? Number(loan.interestRatePct) : null,
              yfirtakanlegt: loan.yfirtakanlegt,
            }))}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
