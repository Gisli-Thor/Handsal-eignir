/**
 * Portal publication lifecycle orchestration (SPEC §8).
 *
 * Design (decisions in PROGRESS.md M4):
 *  - publication rows are lazily upserted; a missing row means
 *    "enabled, not published yet" — entering Í sölu publishes everywhere
 *    with zero setup, and portals added to the registry later are not
 *    stranded;
 *  - per-portal error isolation: these functions NEVER throw — a failing
 *    portal lands as status ERROR + lastError + a failed sync event, so the
 *    pipeline hooks are genuinely fire-and-forget;
 *  - one retry on TransientPortalError (the mocks fail ~5% of calls);
 *  - every attempt is recorded as a PortalSyncEvent and audited.
 */
import { logAudit } from "@/core/audit/log";
import {
  TransientPortalError,
  type ListingSnapshot,
  type PortalAdapter,
  type PortalLead,
} from "@/core/ports/portals";
import type { TenantDb } from "@/core/tenancy/isolation";

export interface PortalSyncInput {
  db: TenantDb;
  tenantId: string;
  listingId: string;
  adapters: PortalAdapter[];
  actorUserId: string | null;
  /** Restrict to specific portal keys (manual per-portal buttons). */
  portalKeys?: string[];
}

export interface PortalResult {
  portalKey: string;
  ok: boolean;
  message?: string;
}

function selectAdapters(input: PortalSyncInput): PortalAdapter[] {
  if (!input.portalKeys) return input.adapters;
  const wanted = new Set(input.portalKeys);
  return input.adapters.filter((adapter) => wanted.has(adapter.key));
}

async function upsertPublication(
  input: PortalSyncInput,
  portalKey: string,
) {
  return input.db.portalPublication.upsert({
    where: { listingId_portalKey: { listingId: input.listingId, portalKey } },
    create: { tenantId: input.tenantId, listingId: input.listingId, portalKey },
    update: {},
  });
}

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TransientPortalError) return fn();
    throw error;
  }
}

async function recordEvent(
  input: PortalSyncInput,
  publicationId: string,
  action: "PUBLISH" | "UPDATE" | "UNPUBLISH" | "PULL",
  ok: boolean,
  message?: string,
): Promise<void> {
  await input.db.portalSyncEvent.create({
    data: { tenantId: input.tenantId, publicationId, action, ok, message: message ?? null },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Publish (or update, when already live) on the given portals. */
export async function syncPublish(
  input: PortalSyncInput,
  snapshot: ListingSnapshot,
): Promise<PortalResult[]> {
  const results: PortalResult[] = [];
  for (const adapter of selectAdapters(input)) {
    const publication = await upsertPublication(input, adapter.key);
    if (!publication.enabled) {
      results.push({ portalKey: adapter.key, ok: true, message: "disabled" });
      continue;
    }
    const isUpdate = publication.remoteId !== null;
    const action = isUpdate ? ("UPDATE" as const) : ("PUBLISH" as const);
    try {
      let remoteId = publication.remoteId;
      if (isUpdate) {
        await retryOnce(() => adapter.update(snapshot, publication.remoteId!));
      } else {
        remoteId = (await retryOnce(() => adapter.publish(snapshot))).remoteId;
      }
      await input.db.portalPublication.update({
        where: { id: publication.id },
        data: {
          status: "PUBLISHED",
          remoteId,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      await recordEvent(input, publication.id, action, true);
      await logAudit(input.db, {
        actorUserId: input.actorUserId ?? undefined,
        action: isUpdate ? "PORTAL_UPDATED" : "PORTAL_PUBLISHED",
        targetType: "Listing",
        targetId: input.listingId,
        metadata: { portal: adapter.key },
      });
      results.push({ portalKey: adapter.key, ok: true });
    } catch (error) {
      const message = errorMessage(error);
      await input.db.portalPublication.update({
        where: { id: publication.id },
        data: { status: "ERROR", lastError: message },
      });
      await recordEvent(input, publication.id, action, false, message);
      await logAudit(input.db, {
        actorUserId: input.actorUserId ?? undefined,
        action: "PORTAL_SYNC_FAILED",
        targetType: "Listing",
        targetId: input.listingId,
        metadata: { portal: adapter.key, action, message },
      });
      results.push({ portalKey: adapter.key, ok: false, message });
    }
  }
  return results;
}

/** Take the listing off the given portals (all enabled+live ones by default). */
export async function syncUnpublish(input: PortalSyncInput): Promise<PortalResult[]> {
  const results: PortalResult[] = [];
  for (const adapter of selectAdapters(input)) {
    const publication = await input.db.portalPublication.findUnique({
      where: { listingId_portalKey: { listingId: input.listingId, portalKey: adapter.key } },
    });
    if (!publication || publication.remoteId === null) {
      results.push({ portalKey: adapter.key, ok: true, message: "not published" });
      continue;
    }
    try {
      await retryOnce(() => adapter.unpublish(publication.remoteId!));
      await input.db.portalPublication.update({
        where: { id: publication.id },
        data: {
          status: "UNPUBLISHED",
          remoteId: null,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      await recordEvent(input, publication.id, "UNPUBLISH", true);
      await logAudit(input.db, {
        actorUserId: input.actorUserId ?? undefined,
        action: "PORTAL_UNPUBLISHED",
        targetType: "Listing",
        targetId: input.listingId,
        metadata: { portal: adapter.key },
      });
      results.push({ portalKey: adapter.key, ok: true });
    } catch (error) {
      const message = errorMessage(error);
      await input.db.portalPublication.update({
        where: { id: publication.id },
        data: { status: "ERROR", lastError: message },
      });
      await recordEvent(input, publication.id, "UNPUBLISH", false, message);
      await logAudit(input.db, {
        actorUserId: input.actorUserId ?? undefined,
        action: "PORTAL_SYNC_FAILED",
        targetType: "Listing",
        targetId: input.listingId,
        metadata: { portal: adapter.key, action: "UNPUBLISH", message },
      });
      results.push({ portalKey: adapter.key, ok: false, message });
    }
  }
  return results;
}

/** Pull remote state / inbound leads (SPEC §8). Leads land as flagged
 * prospective-buyer contacts; repeat leads append a listing note instead of
 * being silently dropped. Pull failures never change publication status. */
export async function syncPull(input: PortalSyncInput): Promise<PortalResult[]> {
  const results: PortalResult[] = [];
  for (const adapter of selectAdapters(input)) {
    const publication = await input.db.portalPublication.findUnique({
      where: { listingId_portalKey: { listingId: input.listingId, portalKey: adapter.key } },
    });
    if (!publication || publication.remoteId === null) {
      results.push({ portalKey: adapter.key, ok: true, message: "not published" });
      continue;
    }
    try {
      const { leads } = await retryOnce(() => adapter.pull(publication.remoteId!));
      for (const lead of leads) {
        await ingestLead(input, adapter.key, lead);
      }
      await input.db.portalPublication.update({
        where: { id: publication.id },
        data: { lastSyncedAt: new Date() },
      });
      await recordEvent(input, publication.id, "PULL", true, `${leads.length} leads`);
      results.push({ portalKey: adapter.key, ok: true, message: `${leads.length}` });
    } catch (error) {
      const message = errorMessage(error);
      await recordEvent(input, publication.id, "PULL", false, message);
      results.push({ portalKey: adapter.key, ok: false, message });
    }
  }
  return results;
}

async function ingestLead(
  input: PortalSyncInput,
  portalKey: string,
  lead: PortalLead,
): Promise<void> {
  const existing = lead.email
    ? await input.db.contact.findFirst({ where: { email: lead.email } })
    : null;
  let contactId: string;
  if (existing) {
    contactId = existing.id;
    if (lead.message) {
      await input.db.listingNote.create({
        data: {
          tenantId: input.tenantId,
          listingId: input.listingId,
          body: `Fyrirspurn frá ${portalKey}: ${lead.message}`,
        },
      });
    }
  } else {
    const contact = await input.db.contact.create({
      data: {
        tenantId: input.tenantId,
        type: "PERSON",
        name: lead.name,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        notes: lead.message ?? null,
        tags: ["lead"],
        source: portalKey,
        needsReview: true,
      },
    });
    contactId = contact.id;
  }
  await input.db.listingContact.upsert({
    where: {
      listingId_contactId_role: {
        listingId: input.listingId,
        contactId,
        role: "PROSPECTIVE_BUYER",
      },
    },
    create: {
      tenantId: input.tenantId,
      listingId: input.listingId,
      contactId,
      role: "PROSPECTIVE_BUYER",
    },
    update: {},
  });
  await logAudit(input.db, {
    action: "PORTAL_LEAD_RECEIVED",
    targetType: "Contact",
    targetId: contactId,
    metadata: { portal: portalKey, listingId: input.listingId, name: lead.name },
  });
}

/** Content changed on a published listing → prompt a re-sync (SPEC §8).
 * Cheap no-op when nothing is published. */
export async function markPublicationsNeedUpdate(
  db: TenantDb,
  listingId: string,
): Promise<void> {
  await db.portalPublication.updateMany({
    where: { listingId, status: "PUBLISHED" },
    data: { status: "NEEDS_UPDATE" },
  });
}
