import { describe, expect, it } from "vitest";
import {
  markPublicationsNeedUpdate,
  syncPublish,
  syncPull,
  syncUnpublish,
  type PortalSyncInput,
} from "@/core/portals/sync";
import {
  TransientPortalError,
  type ListingSnapshot,
  type PortalAdapter,
  type PortalLead,
} from "@/core/ports/portals";
import type { TenantDb } from "@/core/tenancy/isolation";

const SNAPSHOT: ListingSnapshot = {
  listingId: "l1",
  tenantId: "t1",
  tenantName: "Demo",
  addressLine: "Njálsgata 42",
  postnumer: "101",
  locality: "Reykjavík",
  tegund: "FJOLBYLI",
  askingPriceISK: "54900000",
  birtStaerd: 79.5,
  herbergi: 3,
  descriptionIs: null,
  photoKeys: [],
};

interface PubRow {
  id: string;
  tenantId: string;
  listingId: string;
  portalKey: string;
  enabled: boolean;
  status: string;
  remoteId: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

/** In-memory fake of the slices of TenantDb the sync module touches. */
function fakeDb(seedPubs: Partial<PubRow>[] = []) {
  let nextId = 1;
  const pubs: PubRow[] = seedPubs.map((partial, index) => ({
    id: `pub-${index}`,
    tenantId: "t1",
    listingId: "l1",
    portalKey: "p",
    enabled: true,
    status: "NOT_PUBLISHED",
    remoteId: null,
    lastSyncedAt: null,
    lastError: null,
    ...partial,
  }));
  const events: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const contacts: Array<Record<string, unknown> & { id: string; email: string | null }> = [];
  const links: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];

  const db = {
    portalPublication: {
      upsert: async (args: {
        where: { listingId_portalKey: { listingId: string; portalKey: string } };
        create: Record<string, unknown>;
      }) => {
        const { listingId, portalKey } = args.where.listingId_portalKey;
        let row = pubs.find((p) => p.listingId === listingId && p.portalKey === portalKey);
        if (!row) {
          row = {
            id: `pub-n${nextId++}`,
            tenantId: "t1",
            listingId,
            portalKey,
            enabled: true,
            status: "NOT_PUBLISHED",
            remoteId: null,
            lastSyncedAt: null,
            lastError: null,
            ...args.create,
          } as PubRow;
          pubs.push(row);
        }
        return row;
      },
      findUnique: async (args: {
        where: { listingId_portalKey: { listingId: string; portalKey: string } };
      }) => {
        const { listingId, portalKey } = args.where.listingId_portalKey;
        return pubs.find((p) => p.listingId === listingId && p.portalKey === portalKey) ?? null;
      },
      update: async (args: { where: { id: string }; data: Partial<PubRow> }) => {
        const row = pubs.find((p) => p.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
      updateMany: async (args: {
        where: { listingId: string; status: string };
        data: Partial<PubRow>;
      }) => {
        const matched = pubs.filter(
          (p) => p.listingId === args.where.listingId && p.status === args.where.status,
        );
        for (const row of matched) Object.assign(row, args.data);
        return { count: matched.length };
      },
    },
    portalSyncEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        events.push(args.data);
        return args.data;
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        audits.push(args.data);
        return args.data;
      },
    },
    contact: {
      findFirst: async (args: { where: { email: string } }) =>
        contacts.find((c) => c.email === args.where.email) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: `c-${nextId++}`, ...args.data } as (typeof contacts)[number];
        contacts.push(row);
        return row;
      },
    },
    listingContact: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        links.push(args.create);
        return args.create;
      },
    },
    listingNote: {
      create: async (args: { data: Record<string, unknown> }) => {
        notes.push(args.data);
        return args.data;
      },
    },
  };
  return { db: db as unknown as TenantDb, pubs, events, audits, contacts, links, notes };
}

/** Scripted adapter: behaviors consumed call-by-call. */
function scriptedAdapter(
  key: string,
  script: Array<"ok" | "transient" | "hard">,
  leads: PortalLead[] = [],
): PortalAdapter {
  let call = 0;
  const step = () => {
    const behavior = script[Math.min(call, script.length - 1)];
    call += 1;
    if (behavior === "transient") throw new TransientPortalError("mock transient");
    if (behavior === "hard") throw new Error("mock hard failure");
  };
  return {
    key,
    displayName: key,
    publish: async () => {
      step();
      return { remoteId: `${key}-r1` };
    },
    update: async () => {
      step();
    },
    unpublish: async () => {
      step();
    },
    pull: async () => {
      step();
      return { leads };
    },
    status: async () => "LIVE" as const,
  };
}

function input(
  fake: ReturnType<typeof fakeDb>,
  adapters: PortalAdapter[],
  portalKeys?: string[],
): PortalSyncInput {
  return {
    db: fake.db,
    tenantId: "t1",
    listingId: "l1",
    adapters,
    actorUserId: "u1",
    portalKeys,
  };
}

describe("syncPublish", () => {
  it("publishes to every enabled portal, lazily creating rows", async () => {
    const fake = fakeDb();
    const results = await syncPublish(
      input(fake, [scriptedAdapter("a", ["ok"]), scriptedAdapter("b", ["ok"])]),
      SNAPSHOT,
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(fake.pubs.map((p) => [p.portalKey, p.status, p.remoteId])).toEqual([
      ["a", "PUBLISHED", "a-r1"],
      ["b", "PUBLISHED", "b-r1"],
    ]);
    expect(fake.events).toHaveLength(2);
    expect(fake.audits.map((a) => a.action)).toEqual([
      "PORTAL_PUBLISHED",
      "PORTAL_PUBLISHED",
    ]);
  });

  it("retries once on a transient failure and succeeds", async () => {
    const fake = fakeDb();
    const results = await syncPublish(
      input(fake, [scriptedAdapter("a", ["transient", "ok"])]),
      SNAPSHOT,
    );
    expect(results).toEqual([{ portalKey: "a", ok: true }]);
    expect(fake.pubs[0].status).toBe("PUBLISHED");
  });

  it("marks ERROR + lastError after repeated failures, never throws", async () => {
    const fake = fakeDb();
    const results = await syncPublish(
      input(fake, [
        scriptedAdapter("a", ["transient", "transient"]),
        scriptedAdapter("b", ["ok"]),
      ]),
      SNAPSHOT,
    );
    expect(results[0].ok).toBe(false);
    expect(fake.pubs[0]).toMatchObject({ status: "ERROR", lastError: "mock transient" });
    // Per-portal isolation: b still published.
    expect(fake.pubs[1].status).toBe("PUBLISHED");
    expect(fake.audits.map((a) => a.action)).toContain("PORTAL_SYNC_FAILED");
  });

  it("skips disabled publications", async () => {
    const fake = fakeDb([{ portalKey: "a", enabled: false }]);
    const results = await syncPublish(input(fake, [scriptedAdapter("a", ["ok"])]), SNAPSHOT);
    expect(results).toEqual([{ portalKey: "a", ok: true, message: "disabled" }]);
    expect(fake.pubs[0].status).toBe("NOT_PUBLISHED");
  });

  it("uses update (not publish) when already live and audits PORTAL_UPDATED", async () => {
    const fake = fakeDb([{ portalKey: "a", status: "NEEDS_UPDATE", remoteId: "a-r1" }]);
    await syncPublish(input(fake, [scriptedAdapter("a", ["ok"])]), SNAPSHOT);
    expect(fake.pubs[0]).toMatchObject({ status: "PUBLISHED", remoteId: "a-r1" });
    expect(fake.audits.map((a) => a.action)).toEqual(["PORTAL_UPDATED"]);
  });

  it("respects the portalKeys filter", async () => {
    const fake = fakeDb();
    const results = await syncPublish(
      input(fake, [scriptedAdapter("a", ["ok"]), scriptedAdapter("b", ["ok"])], ["b"]),
      SNAPSHOT,
    );
    expect(results).toHaveLength(1);
    expect(fake.pubs.map((p) => p.portalKey)).toEqual(["b"]);
  });
});

describe("syncUnpublish", () => {
  it("unpublishes live portals and clears remoteId", async () => {
    const fake = fakeDb([
      { portalKey: "a", status: "PUBLISHED", remoteId: "a-r1" },
      { portalKey: "b", status: "NOT_PUBLISHED", remoteId: null },
    ]);
    const results = await syncUnpublish(
      input(fake, [scriptedAdapter("a", ["ok"]), scriptedAdapter("b", ["ok"])]),
    );
    expect(results).toEqual([
      { portalKey: "a", ok: true },
      { portalKey: "b", ok: true, message: "not published" },
    ]);
    expect(fake.pubs[0]).toMatchObject({ status: "UNPUBLISHED", remoteId: null });
  });
});

describe("syncPull + lead ingestion", () => {
  const lead: PortalLead = {
    name: "Guðrún Jónsdóttir",
    email: "gudrun@example.is",
    phone: "6912345",
    message: "Er hægt að skoða?",
  };

  it("creates a flagged prospect contact + link from a new lead", async () => {
    const fake = fakeDb([{ portalKey: "a", status: "PUBLISHED", remoteId: "a-r1" }]);
    const results = await syncPull(input(fake, [scriptedAdapter("a", ["ok"], [lead])]));
    expect(results).toEqual([{ portalKey: "a", ok: true, message: "1" }]);
    expect(fake.contacts).toHaveLength(1);
    expect(fake.contacts[0]).toMatchObject({
      name: lead.name,
      needsReview: true,
      source: "a",
      tags: ["lead"],
    });
    expect(fake.links).toHaveLength(1);
    expect(fake.links[0]).toMatchObject({ role: "PROSPECTIVE_BUYER" });
    expect(fake.audits.map((a) => a.action)).toContain("PORTAL_LEAD_RECEIVED");
  });

  it("dedupes by email: repeat lead appends a note instead of a contact", async () => {
    const fake = fakeDb([{ portalKey: "a", status: "PUBLISHED", remoteId: "a-r1" }]);
    await syncPull(input(fake, [scriptedAdapter("a", ["ok"], [lead])]));
    await syncPull(input(fake, [scriptedAdapter("a", ["ok"], [lead])]));
    expect(fake.contacts).toHaveLength(1);
    expect(fake.notes).toHaveLength(1);
    expect(String(fake.notes[0].body)).toContain(lead.message);
  });

  it("a pull failure records a failed event without touching status", async () => {
    const fake = fakeDb([{ portalKey: "a", status: "PUBLISHED", remoteId: "a-r1" }]);
    const results = await syncPull(
      input(fake, [scriptedAdapter("a", ["transient", "transient"])]),
    );
    expect(results[0].ok).toBe(false);
    expect(fake.pubs[0].status).toBe("PUBLISHED");
    expect(fake.events).toMatchObject([{ action: "PULL", ok: false }]);
  });
});

describe("markPublicationsNeedUpdate", () => {
  it("flips only PUBLISHED rows", async () => {
    const fake = fakeDb([
      { portalKey: "a", status: "PUBLISHED" },
      { portalKey: "b", status: "UNPUBLISHED" },
      { portalKey: "c", status: "ERROR" },
    ]);
    await markPublicationsNeedUpdate(fake.db, "l1");
    expect(fake.pubs.map((p) => p.status)).toEqual(["NEEDS_UPDATE", "UNPUBLISHED", "ERROR"]);
  });
});
