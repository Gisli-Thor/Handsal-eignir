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
import { formatArea, formatDate, formatDateTime, formatISK } from "@/lib/format";
import { canManageListing } from "@/core/listings/permissions";
import { offerKind } from "@/core/offers/state";
import { propertyAddressLine } from "@/verticals/eignir/display";
import { EIGNIR_STAGES, WITHDRAWN_STAGE } from "@/verticals/eignir/pipeline";
import { MediaManager, type MediaItem } from "./media-manager";
import { DocumentsPanel, type DocumentItem } from "./documents-panel";
import { ContactsPanel } from "./contacts-panel";
import { AgentsPanel } from "./agents-panel";
import { LoansPanel } from "./loans-panel";
import { DeleteListingButton } from "./delete-listing-button";
import { getPortalAdapters } from "@/lib/services";
import {
  CommissionSchemeForm,
  type SchemeJson,
} from "@/components/commission-scheme-form";
import { updateListingCommissionSchemeAction } from "../commission-actions";
import { StageTimeline } from "./stage-timeline";
import { OffersPanel, type OfferView } from "./offers-panel";
import { FyrirvararPanel, type FyrirvariView } from "./fyrirvarar-panel";
import { PortalsPanel, type PortalRow, type SyncLogRow } from "./portals-panel";
import {
  SoluyfirlitPanel,
  type ProspectOption,
  type SoluyfirlitSendItem,
  type SoluyfirlitVersionItem,
} from "./soluyfirlit-panel";
import {
  SigningPanel,
  type PdfDocumentOption,
  type SignerCandidate,
  type SigningRequestItem,
} from "./signing-panel";
import {
  NotesPanel,
  TasksPanel,
  ViewingsPanel,
  type NoteItem,
  type TaskItem,
  type ViewingItem,
} from "./activity-panels";
import { Timeline, type TimelineEntry } from "./timeline";

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
        include: {
          contact: {
            select: { id: true, name: true, email: true, phone: true, kennitala: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      agents: { include: { user: { select: { id: true, name: true } } } },
      loans: { orderBy: { createdAt: "asc" } },
      commissionRecord: true,
      portalPublications: {
        include: { syncEvents: { orderBy: { createdAt: "desc" }, take: 5 } },
      },
      soluyfirlitVersions: {
        orderBy: { version: "desc" },
        include: {
          sends: {
            orderBy: { createdAt: "desc" },
            include: {
              contact: { select: { name: true } },
              receiptSigningRequest: { select: { status: true } },
            },
          },
        },
      },
      signingRequests: {
        orderBy: { createdAt: "desc" },
        include: { signers: true },
      },
      stageTransitions: { orderBy: { createdAt: "desc" } },
      offers: {
        orderBy: { createdAt: "asc" },
        include: {
          buyers: { include: { contact: { select: { name: true } } } },
          paymentItems: { orderBy: { sortOrder: "asc" } },
          fyrirvarar: { orderBy: { deadline: "asc" } },
        },
      },
      viewings: {
        orderBy: { startsAt: "desc" },
        include: { attendees: { include: { contact: { select: { name: true } } } } },
      },
      notes: { orderBy: { createdAt: "desc" } },
      tasks: {
        orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }],
        include: { assignee: { select: { name: true } } },
      },
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

  // Name lookup for history actors (includes deactivated users).
  const allUsers = await db.user.findMany({ select: { id: true, name: true } });
  const userName = (userId: string | null) =>
    userId ? (allUsers.find((user) => user.id === userId)?.name ?? null) : null;

  const tOffers = await getTranslations("offers");
  const tTimeline = await getTranslations("timeline");
  const tCommission = await getTranslations("commission");
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ── Offer chains (root-first, depth for thread indentation) ────────────────
  type OfferRow = (typeof listing.offers)[number];
  const offerIds = new Set(listing.offers.map((offer) => offer.id));
  const childrenOf = new Map<string, OfferRow[]>();
  const roots: OfferRow[] = [];
  for (const offer of listing.offers) {
    if (offer.parentId && offerIds.has(offer.parentId)) {
      const siblings = childrenOf.get(offer.parentId) ?? [];
      siblings.push(offer);
      childrenOf.set(offer.parentId, siblings);
    } else {
      roots.push(offer);
    }
  }
  const toOfferView = (offer: OfferRow, depth: number): OfferView => ({
    id: offer.id,
    parentId: offer.parentId,
    depth,
    kind: offerKind(offer.parentId),
    status: offer.status,
    amountFormatted: formatISK(Number(offer.amountISK)),
    gildistimiFormatted: formatDateTime(offer.gildistimi),
    msToExpiry: offer.gildistimi.getTime() - now,
    afhendingFormatted: offer.afhendingDate ? formatDate(offer.afhendingDate) : null,
    terms: offer.terms,
    buyers: offer.buyers.map((buyer) => ({
      name: buyer.contact.name,
      sharePct: buyer.sharePct === null ? null : String(Number(buyer.sharePct)),
    })),
    paymentItems: offer.paymentItems.map((item) => ({
      description: item.description,
      amountFormatted: formatISK(Number(item.amountISK)),
      dueDateFormatted: item.dueDate ? formatDate(item.dueDate) : null,
    })),
    createdAtFormatted: formatDateTime(offer.createdAt),
  });
  const offerChains: OfferView[][] = roots.map((root) => {
    const chain: OfferView[] = [];
    const walk = (offer: OfferRow, depth: number) => {
      chain.push(toOfferView(offer, depth));
      for (const child of childrenOf.get(offer.id) ?? []) walk(child, depth + 1);
    };
    walk(root, 0);
    return chain;
  });

  // ── Fyrirvarar of the active offer (accepted first, else open) ────────────
  const acceptedOffer = [...listing.offers].reverse().find((o) => o.status === "ACCEPTED");
  const pendingOffer = [...listing.offers].reverse().find((o) => o.status === "PENDING");
  const activeOffer = acceptedOffer ?? pendingOffer ?? null;
  const endOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  };
  const fyrirvariItems: FyrirvariView[] = (activeOffer?.fyrirvarar ?? []).map(
    (fyrirvari) => ({
      id: fyrirvari.id,
      type: fyrirvari.type,
      description: fyrirvari.description,
      deadlineFormatted: formatDate(fyrirvari.deadline),
      daysLeft: Math.floor((endOfDay(fyrirvari.deadline) - now) / DAY_MS),
      responsible: fyrirvari.responsible,
      status: fyrirvari.status,
      resolvedAtFormatted: fyrirvari.resolvedAt ? formatDate(fyrirvari.resolvedAt) : null,
      resolvedByName: userName(fyrirvari.resolvedById),
    }),
  );

  // ── Activity view models ───────────────────────────────────────────────────
  const viewingItems: ViewingItem[] = listing.viewings.map((viewing) => ({
    id: viewing.id,
    kind: viewing.kind,
    startsAtFormatted: formatDateTime(viewing.startsAt),
    endsAtFormatted: viewing.endsAt ? formatDateTime(viewing.endsAt) : null,
    note: viewing.note,
    attendees: viewing.attendees.map((attendee) => attendee.contact.name),
    upcoming: viewing.startsAt.getTime() > now,
  }));
  const taskItems: TaskItem[] = listing.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    dueDateFormatted: task.dueDate ? formatDate(task.dueDate) : null,
    overdue: task.dueDate !== null && endOfDay(task.dueDate) < now,
    assigneeName: task.assignee?.name ?? null,
    done: task.completedAt !== null,
  }));
  const noteItems: NoteItem[] = listing.notes.map((note) => ({
    id: note.id,
    body: note.body,
    createdAtFormatted: formatDateTime(note.createdAt),
    authorName: userName(note.createdById),
  }));

  // ── Unified timeline (SPEC §5) ─────────────────────────────────────────────
  const stageName = (stage: string | null) => (stage ? t(`stage.${stage}`) : "—");
  const withActor = (text: string, actorId: string | null) => {
    const name = userName(actorId);
    return name ? `${text} — ${name}` : text;
  };
  const timelineEntries: TimelineEntry[] = [
    ...listing.stageTransitions.map((transition) => ({
      id: `stage-${transition.id}`,
      icon: "stage" as const,
      at: transition.createdAt,
      text: withActor(
        `${transition.fromStage ? `${stageName(transition.fromStage)} → ` : ""}${stageName(transition.toStage)}${transition.overridden ? ` (${tTimeline("overridden")})` : ""}`,
        transition.actorUserId,
      ),
      detail: transition.reason,
    })),
    ...listing.offers.flatMap((offer) => {
      const entries = [
        {
          id: `offer-${offer.id}`,
          icon: "offer" as const,
          at: offer.createdAt,
          text: withActor(
            tTimeline("offerCreated", {
              kind: tOffers(`kind.${offerKind(offer.parentId)}`),
              amount: formatISK(Number(offer.amountISK)),
            }),
            offer.createdById,
          ),
          detail: offer.buyers.map((buyer) => buyer.contact.name).join(", ") as
            | string
            | null,
        },
      ];
      if (offer.decidedAt) {
        entries.push({
          id: `offer-decided-${offer.id}`,
          icon: "offer" as const,
          at: offer.decidedAt,
          text: withActor(
            tTimeline("offerDecided", {
              status: tOffers(`status.${offer.status}`),
              amount: formatISK(Number(offer.amountISK)),
            }),
            offer.decidedById,
          ),
          detail: null as string | null,
        });
      }
      return entries;
    }),
    ...listing.viewings.map((viewing) => ({
      id: `viewing-${viewing.id}`,
      icon: "viewing" as const,
      at: viewing.startsAt,
      text: tTimeline("viewing", {
        kind: tTimeline(`viewingKind.${viewing.kind}`),
      }),
      detail: viewing.attendees.map((attendee) => attendee.contact.name).join(", ") || null,
    })),
    ...listing.notes.map((note) => ({
      id: `note-${note.id}`,
      icon: "note" as const,
      at: note.createdAt,
      text: withActor(tTimeline("noteAdded"), note.createdById),
      detail: note.body,
    })),
    ...listing.tasks.map((task) => ({
      id: `task-${task.id}`,
      icon: "task" as const,
      at: task.createdAt,
      text: withActor(tTimeline("taskAdded", { title: task.title }), task.createdById),
      detail: null as string | null,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 40)
    .map(({ at, ...entry }) => ({ ...entry, whenFormatted: formatDateTime(at) }));

  const isWithdrawn = listing.stage === WITHDRAWN_STAGE;
  const withdrawnReason = isWithdrawn
    ? (listing.stageTransitions.find((tr) => tr.toStage === WITHDRAWN_STAGE)?.reason ?? null)
    : null;

  // ── M4: portal publications (registry keys left-joined with rows) ─────────
  const publicationByKey = new Map(
    listing.portalPublications.map((publication) => [publication.portalKey, publication]),
  );
  const portalRows: PortalRow[] = getPortalAdapters(listing.vertical).map((adapter) => {
    const publication = publicationByKey.get(adapter.key);
    return {
      key: adapter.key,
      displayName: adapter.displayName,
      enabled: publication?.enabled ?? true,
      status: publication?.status ?? "NOT_PUBLISHED",
      lastSyncedFormatted: publication?.lastSyncedAt
        ? formatDateTime(publication.lastSyncedAt)
        : null,
      lastError: publication?.lastError ?? null,
    };
  });
  const adapterNameByKey = new Map(
    getPortalAdapters(listing.vertical).map((adapter) => [adapter.key, adapter.displayName]),
  );
  const syncLogRows: SyncLogRow[] = listing.portalPublications
    .flatMap((publication) =>
      publication.syncEvents.map((event) => ({
        id: event.id,
        portalName: adapterNameByKey.get(publication.portalKey) ?? publication.portalKey,
        action: event.action,
        ok: event.ok,
        message: event.message,
        at: event.createdAt,
      })),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10)
    .map(({ at, ...row }) => ({ ...row, whenFormatted: formatDateTime(at) }));

  // ── M4: söluyfirlit versions + send history ───────────────────────────────
  const soluyfirlitVersions: SoluyfirlitVersionItem[] = await Promise.all(
    listing.soluyfirlitVersions.map(async (version) => ({
      id: version.id,
      version: version.version,
      createdAtFormatted: formatDateTime(version.createdAt),
      generatedByName: userName(version.generatedById),
      downloadUrl: await presignDownload(
        version.storageKey,
        `soluyfirlit-v${version.version}.pdf`,
      ),
    })),
  );
  const tSigning = await getTranslations("signing");
  const soluyfirlitSends: SoluyfirlitSendItem[] = listing.soluyfirlitVersions
    .flatMap((version) =>
      version.sends.map((send) => ({
        id: send.id,
        contactName: send.contact.name,
        version: version.version,
        sentByName: userName(send.sentById),
        at: send.createdAt,
        receiptStatus: send.receiptSigningRequest
          ? tSigning(`status.${send.receiptSigningRequest.status}`)
          : null,
      })),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 20)
    .map(({ at, ...row }) => ({ ...row, whenFormatted: formatDateTime(at) }));
  const prospects: ProspectOption[] = listing.contacts
    .filter((link) => link.role === "PROSPECTIVE_BUYER" || link.role === "BUYER")
    .map((link) => ({
      id: link.contactId,
      name: link.contact.name,
      hasEmail: link.contact.email !== null,
      hasKennitala: link.contact.kennitala !== null,
    }));

  // ── M4: signing requests ───────────────────────────────────────────────────
  const signingRequests: SigningRequestItem[] = await Promise.all(
    listing.signingRequests.map(async (request) => ({
      id: request.id,
      title: request.title,
      docType: request.docType,
      status: request.status,
      createdAtFormatted: formatDateTime(request.createdAt),
      signers: request.signers.map((signer) => ({
        name: signer.name,
        kennitala: signer.kennitala,
        status: signer.status,
      })),
      signedDownloadUrl: request.signedKey
        ? await presignDownload(request.signedKey, `undirritad.pdf`)
        : null,
    })),
  );
  const tContactRoles = await getTranslations("contacts.role");
  const roleLabel = (role: string) => tContactRoles(role);
  const signerCandidates: SignerCandidate[] = listing.contacts.map((link) => ({
    key: link.id,
    name: link.contact.name,
    kennitala: link.contact.kennitala,
    email: link.contact.email,
    phone: link.contact.phone,
    roleLabel: roleLabel(link.role),
  }));
  const pdfDocuments: PdfDocumentOption[] = listing.documents
    .filter((document) => document.contentType === "application/pdf" && document.type !== "UNDIRRITAD")
    .map((document) => ({ id: document.id, title: document.title }));
  const hasAcceptedOffer = listing.offers.some((offer) => offer.status === "ACCEPTED");

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
    <div className="mx-auto grid max-w-[1400px] gap-6">
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

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.pipeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StageTimeline
            listingId={listing.id}
            stages={[...EIGNIR_STAGES]}
            currentStage={listing.stage}
            withdrawnStage={WITHDRAWN_STAGE}
            isWithdrawn={isWithdrawn}
            withdrawnReason={withdrawnReason}
            canManage={canManage}
            isAdmin={session.user.role === "ADMIN"}
          />
        </CardContent>
      </Card>

      {/* Wide screens: main column + sidebar (M4 layout pass) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
      <div className="grid min-w-0 gap-6">
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
          <CardTitle>{t("sections.offers")}</CardTitle>
        </CardHeader>
        <CardContent>
          <OffersPanel
            listingId={listing.id}
            chains={offerChains}
            availableContacts={availableContacts}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      {activeOffer || fyrirvariItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.fyrirvarar")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FyrirvararPanel
              listingId={listing.id}
              offerId={activeOffer?.id ?? null}
              items={fyrirvariItems}
              canManage={canManage}
              showStageFallback={listing.stage === "TILBOD_SAMTHYKKT"}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.soluyfirlit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SoluyfirlitPanel
            listingId={listing.id}
            versions={soluyfirlitVersions}
            sends={soluyfirlitSends}
            prospects={prospects}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.signing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SigningPanel
            listingId={listing.id}
            requests={signingRequests}
            hasAcceptedOffer={hasAcceptedOffer}
            pdfDocuments={pdfDocuments}
            signerCandidates={signerCandidates}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.portals")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalsPanel
            listingId={listing.id}
            portals={portalRows}
            syncLog={syncLogRows}
            canManage={canManage}
          />
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline entries={timelineEntries} empty={tTimeline("empty")} />
        </CardContent>
      </Card>
      </div>

      {/* Sidebar */}
      <div className="grid min-w-0 gap-6">
      <div className="grid gap-6">
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
                splitPct: link.splitPct === null ? null : Number(link.splitPct),
              }))}
              availableUsers={availableUsers}
              canManage={canManage}
              isAdmin={session.user.role === "ADMIN"}
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

      {listing.commissionRecord || session.user.role === "ADMIN" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.commission")}</CardTitle>
          </CardHeader>
          <CardContent>
            {listing.commissionRecord ? (
              <div className="grid gap-3">
                <Badge variant="secondary" className="w-fit">
                  {tCommission("frozen", {
                    date: formatDate(listing.commissionRecord.createdAt),
                  })}
                </Badge>
                <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{tCommission("salePrice")}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {formatISK(Number(listing.commissionRecord.salePriceISK))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{tCommission("gross")}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {formatISK(Number(listing.commissionRecord.grossISK))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{tCommission("vsk")}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {formatISK(Number(listing.commissionRecord.vskISK))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{tCommission("total")}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {formatISK(Number(listing.commissionRecord.totalISK))}
                    </dd>
                  </div>
                </dl>
                {Array.isArray(listing.commissionRecord.agentSplits) &&
                (listing.commissionRecord.agentSplits as unknown[]).length > 0 ? (
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">
                      {tCommission("splits")}
                    </p>
                    <ul className="grid gap-0.5 text-sm">
                      {(
                        listing.commissionRecord.agentSplits as Array<{
                          name: string;
                          percent: number;
                          amountISK: string;
                        }>
                      ).map((split, index) => (
                        <li key={index} className="flex justify-between gap-4">
                          <span>
                            {split.name}{" "}
                            <span className="text-muted-foreground">
                              ({String(split.percent).replace(".", ",")}%)
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {formatISK(Number(split.amountISK))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <p className="text-muted-foreground mb-4 text-sm">
                  {tCommission("overrideHint")}
                </p>
                <CommissionSchemeForm
                  initialScheme={
                    (listing.commissionSchemeOverride as SchemeJson | null) ?? null
                  }
                  allowUseDefault
                  onSave={updateListingCommissionSchemeAction.bind(null, listing.id)}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.viewings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ViewingsPanel
              listingId={listing.id}
              viewings={viewingItems}
              availableContacts={availableContacts}
              canManage={canManage}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sections.tasks")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TasksPanel
              listingId={listing.id}
              tasks={taskItems}
              availableUsers={availableUsers}
              canManage={canManage}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotesPanel listingId={listing.id} notes={noteItems} canManage={canManage} />
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
}
