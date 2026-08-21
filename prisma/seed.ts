/**
 * Seed script. Idempotent — safe to re-run (upserts on unique keys; listing
 * demo data is skipped when the tenant already has listings).
 *
 * M1: plans, superadmin, demo Eignir tenant + admin/agent, demo Bílar tenant.
 * M2: postal codes, contacts, 12 properties across all pipeline stages with
 *     áhvílandi lán, seller links and generated placeholder photos (uploaded
 *     to MinIO through the real derivative pipeline when storage is up).
 * Later milestones extend the marked sections below (SPEC §13).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ListingContactRole,
  MediaCategory,
  PropertyType,
} from "../src/generated/prisma/enums";
import { kennitalaCheckDigit } from "../src/core/contacts/kennitala";
import { buildAcceptedSnapshot } from "../src/core/offers/state";
import { EIGNIR_STAGES, WITHDRAWN_STAGE } from "../src/verticals/eignir/pipeline";
import { mediaObjectKey } from "../src/core/media/constants";
import { createImageDerivatives } from "../src/core/media/derivatives";
import { ensureBucket, putObject } from "../src/lib/storage";
import { POSTAL_CODES } from "./seed-data/postal-codes";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "handsal-demo1";
const passwordHash = hashSync(DEMO_PASSWORD, 12);

/** Build a checksum-valid kennitala from date digits + serial + century. */
function makeKt(ddmmyy: string, serial: string, century: "8" | "9" | "0"): string {
  let s = Number(serial);
  for (;;) {
    const first8 = `${ddmmyy}${String(s).padStart(2, "0")}`;
    const check = kennitalaCheckDigit(first8);
    if (check !== null) return `${first8}${check}${century}`;
    s = (s + 1) % 100;
  }
}

async function main() {
  // ── Plans (SPEC §12) ──────────────────────────────────────────────────────
  const plans = [
    { name: "Byrjun", maxActiveListings: 10, monthlyPriceISK: 14900 },
    { name: "Vöxtur", maxActiveListings: 50, monthlyPriceISK: 34900 },
    { name: "Atvinnumaður", maxActiveListings: null, monthlyPriceISK: 59900 },
  ];
  for (const plan of plans) {
    await db.plan.upsert({
      where: { name: plan.name },
      create: plan,
      update: plan,
    });
  }
  const voxtur = await db.plan.findUniqueOrThrow({ where: { name: "Vöxtur" } });
  const byrjun = await db.plan.findUniqueOrThrow({ where: { name: "Byrjun" } });

  // ── Superadmin (platform level, no tenant) ────────────────────────────────
  await db.user.upsert({
    where: { email: "superadmin@handsal.is" },
    create: {
      name: "Handsal kerfisstjóri",
      email: "superadmin@handsal.is",
      passwordHash,
      role: "SUPERADMIN",
    },
    update: {},
  });

  // ── Demo fasteignasala (Eignir) ───────────────────────────────────────────
  const demoEignir = await db.tenant.upsert({
    where: { slug: "demo-fasteignasala" },
    create: {
      name: "Demo fasteignasala",
      slug: "demo-fasteignasala",
      vertical: "EIGNIR",
      planId: voxtur.id,
      email: "demo@fasteignasala.is",
      phone: "555 1234",
      address: "Borgartún 1, 105 Reykjavík",
    },
    update: {},
  });
  const anna = await db.user.upsert({
    where: { email: "anna@demo.is" },
    create: {
      tenantId: demoEignir.id,
      name: "Anna Jónsdóttir",
      email: "anna@demo.is",
      passwordHash,
      role: "ADMIN",
      phone: "555 1111",
    },
    update: {},
  });
  const jon = await db.user.upsert({
    where: { email: "jon@demo.is" },
    create: {
      tenantId: demoEignir.id,
      name: "Jón Gunnarsson",
      email: "jon@demo.is",
      passwordHash,
      role: "AGENT",
      phone: "555 2222",
    },
    update: {},
  });

  // ── Demo bílasala (Bílar scaffold) ────────────────────────────────────────
  const demoBilar = await db.tenant.upsert({
    where: { slug: "demo-bilasala" },
    create: {
      name: "Demo bílasala",
      slug: "demo-bilasala",
      vertical: "BILAR",
      planId: byrjun.id,
      email: "demo@bilasala.is",
    },
    update: {},
  });
  await db.user.upsert({
    where: { email: "bjarni@bilar.is" },
    create: {
      tenantId: demoBilar.id,
      name: "Bjarni Sigurðsson",
      email: "bjarni@bilar.is",
      passwordHash,
      role: "ADMIN",
    },
    update: {},
  });

  // ── M2: postal codes / municipalities (global reference data) ─────────────
  for (const pc of POSTAL_CODES) {
    await db.postalCode.upsert({
      where: { code: pc.code },
      create: pc,
      update: { locality: pc.locality, municipality: pc.municipality },
    });
  }
  console.log("Postal codes: %d upserted", POSTAL_CODES.length);

  // ── M2: contacts + 12 demo properties ─────────────────────────────────────
  const contactIds = await seedEignirDemoData(demoEignir.id, anna.id, jon.id);

  // ── M3: pipeline stage history, offers + counter-offer chain, accepted ────
  // offer with mixed-status fyrirvarar, viewings/opið hús, notes, tasks
  await seedM3Data(demoEignir.id, anna.id, jon.id, contactIds);

  // ── M4: portal publications in various states, söluyfirlit history, ───────
  // signing requests
  // (extended in milestone M4)

  // ── M5: completed sale with commission record ─────────────────────────────
  // (extended in milestone M5)

  // ── M6: 2 scaffolded vehicles for the Bílar tenant ────────────────────────
  // (extended in milestone M6)

  console.log("Seed complete. Demo logins (password for all: %s)", DEMO_PASSWORD);
  console.log("  SUPERADMIN  superadmin@handsal.is");
  console.log("  ADMIN       anna@demo.is        (Demo fasteignasala, Eignir)");
  console.log("  AGENT       jon@demo.is         (Demo fasteignasala, Eignir)");
  console.log("  ADMIN       bjarni@bilar.is     (Demo bílasala, Bílar)");
}

// ═══ M2 demo data ═════════════════════════════════════════════════════════

interface ContactSeed {
  name: string;
  type: "PERSON" | "COMPANY";
  kennitala?: string;
  email?: string;
  phone?: string;
  address?: string;
  tags: string[];
}

const CONTACTS: ContactSeed[] = [
  {
    name: "Sigríður Halldórsdóttir",
    type: "PERSON",
    kennitala: makeKt("120765", "23", "9"),
    email: "sigridur@example.is",
    phone: "690 1234",
    address: "Njálsgata 42, 101 Reykjavík",
    tags: ["seljandi"],
  },
  {
    name: "Þorsteinn Bjarnason",
    type: "PERSON",
    kennitala: makeKt("030858", "45", "9"),
    email: "thorsteinn@example.is",
    phone: "861 5678",
    address: "Álfheimar 24, 104 Reykjavík",
    tags: ["seljandi"],
  },
  {
    // Documented mock-Þjóðskrá test person (see thjodskra.mock.ts)
    name: "Gervimaður Ameríka",
    type: "PERSON",
    kennitala: "0101302989",
    email: "gervi@example.is",
    address: "Vesturgata 3, 101 Reykjavík",
    tags: ["áhugasamur"],
  },
  {
    name: "Hildur Einarsdóttir",
    type: "PERSON",
    kennitala: makeKt("220990", "31", "9"),
    email: "hildur@example.is",
    phone: "770 2468",
    tags: ["kaupandi"],
  },
  {
    name: "Byggingafélagið Klettur ehf.",
    type: "COMPANY",
    kennitala: makeKt("450901", "57", "0"),
    email: "klettur@example.is",
    phone: "588 9000",
    address: "Smiðjuvegur 11, 200 Kópavogur",
    tags: ["verktaki", "seljandi"],
  },
  {
    name: "Kristján Þórsson",
    type: "PERSON",
    kennitala: makeKt("150478", "12", "9"),
    phone: "899 1357",
    tags: ["seljandi"],
  },
  {
    name: "Anna María Guðjónsdóttir",
    type: "PERSON",
    email: "annamaria@example.is",
    phone: "662 8642",
    tags: ["áhugasamur"],
  },
  {
    name: "Leigufélagið Höfði hf.",
    type: "COMPANY",
    kennitala: makeKt("410399", "76", "9"),
    email: "hofdi@example.is",
    tags: ["fjárfestir", "kaupandi"],
  },
];

interface PropertySeed {
  gotuheiti: string;
  husnumer: string;
  ibud?: string;
  postnumer: string;
  tegund: PropertyType;
  stage: string;
  fastanumer: string;
  birtStaerd: number;
  tharAfGeymsla?: number;
  herbergi: number;
  svefnherbergi: number;
  badherbergi: number;
  haed?: number;
  lyfta?: boolean;
  parkingType?: "NONE" | "BILSKUR" | "BILSKYLI" | "STAEDI" | "STAEDI_I_BILAHUSI";
  parkingCount?: number;
  byggingarar: number;
  priceMISK: number;
  agents: ("anna" | "jon")[];
  sellers: number[]; // indexes into CONTACTS
  prospects?: number[];
  loans?: Array<{
    lender: string;
    balanceMISK: number;
    verdtryggt: boolean;
    rate: number;
    yfirtakanlegt?: boolean;
  }>;
  photos: number;
  floorPlan?: boolean;
  descriptionIs: string;
  descriptionEn: string;
}

const PROPERTIES: PropertySeed[] = [
  {
    gotuheiti: "Njálsgata", husnumer: "42", ibud: "0201", postnumer: "101",
    tegund: "FJOLBYLI", stage: "I_SOLU", fastanumer: "F2044231",
    birtStaerd: 79.5, tharAfGeymsla: 4.2, herbergi: 3, svefnherbergi: 2,
    badherbergi: 1, haed: 2, byggingarar: 1932, priceMISK: 54.9,
    agents: ["anna"], sellers: [0], prospects: [2],
    loans: [{ lender: "Íslandsbanki", balanceMISK: 21.4, verdtryggt: true, rate: 4.2, yfirtakanlegt: true }],
    photos: 3, floorPlan: true,
    descriptionIs: "Falleg og björt 3ja herbergja íbúð á 2. hæð í steinhúsi frá 1932. Upprunalegir gólflistar og mikil lofthæð.",
    descriptionEn: "Bright three-room apartment on the 2nd floor of a 1932 concrete building. Original mouldings and high ceilings.",
  },
  {
    gotuheiti: "Álfheimar", husnumer: "24", ibud: "0303", postnumer: "104",
    tegund: "FJOLBYLI", stage: "I_SOLU", fastanumer: "F2098412",
    birtStaerd: 112.3, tharAfGeymsla: 6.8, herbergi: 4, svefnherbergi: 3,
    badherbergi: 1, haed: 3, lyfta: true, parkingType: "STAEDI_I_BILAHUSI",
    parkingCount: 1, byggingarar: 1968, priceMISK: 74.9,
    agents: ["jon"], sellers: [1],
    loans: [{ lender: "Landsbankinn", balanceMISK: 32.0, verdtryggt: false, rate: 8.5 }],
    photos: 3,
    descriptionIs: "Rúmgóð 4ra herbergja íbúð með stæði í bílahúsi. Endurnýjað eldhús og baðherbergi.",
    descriptionEn: "Spacious four-room apartment with a space in a parking garage. Renovated kitchen and bathroom.",
  },
  {
    gotuheiti: "Kársnesbraut", husnumer: "71", postnumer: "200",
    tegund: "EINBYLI", stage: "I_SOLU", fastanumer: "F2015877",
    birtStaerd: 214.8, tharAfGeymsla: 12.5, herbergi: 6, svefnherbergi: 4,
    badherbergi: 2, parkingType: "BILSKUR", parkingCount: 1,
    byggingarar: 1979, priceMISK: 129.0,
    agents: ["anna", "jon"], sellers: [5],
    photos: 3, floorPlan: true,
    descriptionIs: "Vandað einbýlishús á sjávarlóð á Kársnesi með bílskúr og fallegu útsýni yfir Fossvoginn.",
    descriptionEn: "Well-kept detached house on a seaside plot in Kársnes with a garage and a fine view over Fossvogur.",
  },
  {
    gotuheiti: "Strandgata", husnumer: "11", ibud: "0101", postnumer: "220",
    tegund: "HAED", stage: "I_SOLU", fastanumer: "F2071233",
    birtStaerd: 98.6, herbergi: 4, svefnherbergi: 2, badherbergi: 1,
    haed: 1, byggingarar: 1948, priceMISK: 63.5,
    agents: ["jon"], sellers: [3],
    photos: 3,
    descriptionIs: "Sjarmerandi neðri sérhæð í hjarta Hafnarfjarðar, sérinngangur og gróinn garður.",
    descriptionEn: "Charming lower floor unit in central Hafnarfjörður, private entrance and mature garden.",
  },
  {
    gotuheiti: "Laugavegur", husnumer: "96", postnumer: "101",
    tegund: "ATVINNUHUSNAEDI", stage: "UNDIRBUNINGUR", fastanumer: "F2033145",
    birtStaerd: 186.0, herbergi: 5, svefnherbergi: 0, badherbergi: 2,
    haed: 1, byggingarar: 1955, priceMISK: 98.0,
    agents: ["anna"], sellers: [7],
    photos: 1,
    descriptionIs: "Verslunarrými á besta stað við Laugaveg. Gott auglýsingagildi og mikil umferð gangandi vegfarenda.",
    descriptionEn: "Retail space in a prime Laugavegur location with strong footfall.",
  },
  {
    gotuheiti: "Sólvallagata", husnumer: "8", postnumer: "101",
    tegund: "HAED", stage: "UNDIRBUNINGUR", fastanumer: "F2081920",
    birtStaerd: 134.2, tharAfGeymsla: 8.0, herbergi: 5, svefnherbergi: 3,
    badherbergi: 1, haed: 2, byggingarar: 1928, priceMISK: 89.5,
    agents: ["anna"], sellers: [2],
    photos: 1,
    descriptionIs: "Glæsileg hæð í virðulegu steinhúsi í Vesturbænum. Beðið eftir söluyfirliti og myndatöku.",
    descriptionEn: "Elegant floor unit in a stately Vesturbær building. Awaiting söluyfirlit and photography.",
  },
  {
    gotuheiti: "Grettisgata", husnumer: "17", ibud: "0302", postnumer: "101",
    tegund: "FJOLBYLI", stage: "TILBOD_MOTTEKID", fastanumer: "F2052366",
    birtStaerd: 68.4, herbergi: 2, svefnherbergi: 1, badherbergi: 1,
    haed: 3, byggingarar: 1996, priceMISK: 49.9,
    agents: ["jon"], sellers: [0], prospects: [3, 6],
    photos: 2,
    descriptionIs: "Snotur 2ja herbergja íbúð með suðursvölum. Tilboð borist og er til skoðunar hjá seljanda.",
    descriptionEn: "Neat two-room apartment with a south-facing balcony. An offer has been received and is under review.",
  },
  {
    gotuheiti: "Langholtsvegur", husnumer: "130", postnumer: "104",
    tegund: "RADHUS", stage: "TILBOD_SAMTHYKKT", fastanumer: "F2027781",
    birtStaerd: 142.7, tharAfGeymsla: 9.3, herbergi: 5, svefnherbergi: 3,
    badherbergi: 2, parkingType: "STAEDI", parkingCount: 2,
    byggingarar: 1962, priceMISK: 84.9,
    agents: ["anna"], sellers: [1], prospects: [7],
    loans: [
      { lender: "HMS", balanceMISK: 18.9, verdtryggt: true, rate: 3.9, yfirtakanlegt: true },
      { lender: "Arion banki", balanceMISK: 9.2, verdtryggt: false, rate: 9.1 },
    ],
    photos: 2, floorPlan: true,
    descriptionIs: "Fjölskylduvænt raðhús með sólpalli. Tilboð samþykkt með fyrirvara um fjármögnun.",
    descriptionEn: "Family-friendly terraced house with a deck. Offer accepted subject to financing.",
  },
  {
    gotuheiti: "Hafnargata", husnumer: "28", postnumer: "230",
    tegund: "PARHUS", stage: "KAUPSAMNINGUR", fastanumer: "F2063490",
    birtStaerd: 156.3, herbergi: 5, svefnherbergi: 4, badherbergi: 2,
    parkingType: "BILSKUR", parkingCount: 1, byggingarar: 1987, priceMISK: 62.5,
    agents: ["jon"], sellers: [5],
    photos: 2,
    descriptionIs: "Gott parhús með bílskúr í göngufæri við höfnina. Kaupsamningur undirritaður.",
    descriptionEn: "Solid semi-detached house with a garage near the harbour. Purchase agreement signed.",
  },
  {
    gotuheiti: "Þórunnarstræti", husnumer: "99", ibud: "0102", postnumer: "600",
    tegund: "FJOLBYLI", stage: "AFHENDING", fastanumer: "F2090055",
    birtStaerd: 91.2, tharAfGeymsla: 5.1, herbergi: 3, svefnherbergi: 2,
    badherbergi: 1, haed: 1, byggingarar: 2004, priceMISK: 46.5,
    agents: ["anna"], sellers: [3],
    photos: 2,
    descriptionIs: "Björt íbúð á jarðhæð með verönd. Afhending í næstu viku.",
    descriptionEn: "Bright ground-floor apartment with a patio. Handover next week.",
  },
  {
    gotuheiti: "Heiðarvegur", husnumer: "5", postnumer: "900",
    tegund: "EINBYLI", stage: "AFSAL_LOKID", fastanumer: "F2012348",
    birtStaerd: 168.9, herbergi: 6, svefnherbergi: 4, badherbergi: 2,
    parkingType: "BILSKUR", parkingCount: 1, byggingarar: 1971, priceMISK: 58.0,
    agents: ["jon", "anna"], sellers: [6],
    photos: 2,
    descriptionIs: "Sölu lokið — afsal gefið út. Gott einbýli í Eyjum.",
    descriptionEn: "Sale completed — deed issued. Good detached house in Vestmannaeyjar.",
  },
  {
    gotuheiti: "Bakkastaðir", husnumer: "77", postnumer: "112",
    tegund: "RADHUS", stage: "FALLID_FRA", fastanumer: "F2077612",
    birtStaerd: 148.1, herbergi: 5, svefnherbergi: 3, badherbergi: 2,
    parkingType: "BILSKYLI", parkingCount: 1, byggingarar: 1999, priceMISK: 92.0,
    agents: ["anna"], sellers: [4],
    photos: 0,
    descriptionIs: "Seljandi dró eignina úr sölu — flutningar erlendis frestuðust.",
    descriptionEn: "Withdrawn from sale — the seller postponed relocating abroad.",
  },
];

/** Simple SVG gradient placeholder rendered to JPEG via sharp. */
async function placeholderJpeg(label: string, hueSeed: number): Promise<Buffer> {
  const h1 = (hueSeed * 47) % 360;
  const h2 = (h1 + 40) % 360;
  const svg = `<svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1}, 35%, 42%)"/>
      <stop offset="1" stop-color="hsl(${h2}, 40%, 26%)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="52%" font-family="sans-serif" font-size="88" fill="rgba(255,255,255,0.85)" text-anchor="middle">${label}</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function seedEignirDemoData(
  tenantId: string,
  annaId: string,
  jonId: string,
): Promise<string[]> {
  // Contacts — idempotent: upsert by (tenantId, kennitala), name-match otherwise.
  const contactIds: string[] = [];
  for (const contact of CONTACTS) {
    const data = {
      tenantId,
      type: contact.type,
      kennitala: contact.kennitala ?? null,
      name: contact.name,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      address: contact.address ?? null,
      tags: contact.tags,
    };
    let row;
    if (contact.kennitala) {
      row = await db.contact.upsert({
        where: { tenantId_kennitala: { tenantId, kennitala: contact.kennitala } },
        create: data,
        update: {},
      });
    } else {
      row =
        (await db.contact.findFirst({ where: { tenantId, name: contact.name } })) ??
        (await db.contact.create({ data }));
    }
    contactIds.push(row.id);
  }
  console.log("Contacts: %d ensured", contactIds.length);

  // Listings — seeded once; re-runs skip so manual demo edits survive.
  const existing = await db.listing.count({ where: { tenantId } });
  if (existing > 0) {
    console.log("Listings already present (%d) — skipping listing seed", existing);
    return contactIds;
  }

  let storageUp = true;
  try {
    await ensureBucket();
  } catch {
    storageUp = false;
    console.warn("MinIO/S3 unreachable — seeding listings WITHOUT photos.");
  }

  const agentId = (key: "anna" | "jon") => (key === "anna" ? annaId : jonId);
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  for (const [index, p] of PROPERTIES.entries()) {
    const published = !["UNDIRBUNINGUR", "FALLID_FRA"].includes(p.stage);
    const listing = await db.listing.create({
      data: {
        tenantId,
        vertical: "EIGNIR",
        stage: p.stage,
        askingPriceISK: BigInt(Math.round(p.priceMISK * 1_000_000)),
        descriptionIs: p.descriptionIs,
        descriptionEn: p.descriptionEn,
        publishedAt: published ? new Date(now - (60 - index * 4) * DAY) : null,
        soldAt: p.stage === "AFSAL_LOKID" ? new Date(now - 5 * DAY) : null,
      },
    });
    await db.property.create({
      data: {
        tenantId,
        listingId: listing.id,
        fastanumer: p.fastanumer,
        gotuheiti: p.gotuheiti,
        husnumer: p.husnumer,
        ibud: p.ibud ?? null,
        postnumer: p.postnumer,
        tegund: p.tegund,
        birtStaerd: p.birtStaerd,
        tharAfGeymsla: p.tharAfGeymsla ?? null,
        herbergi: p.herbergi,
        svefnherbergi: p.svefnherbergi,
        badherbergi: p.badherbergi,
        haed: p.haed ?? null,
        lyfta: p.lyfta ?? false,
        parkingType: p.parkingType ?? "NONE",
        parkingCount: p.parkingCount ?? null,
        byggingarar: p.byggingarar,
        fasteignamatISK: BigInt(Math.round(p.priceMISK * 0.85 * 1_000_000)),
        brunabotamatISK: BigInt(Math.round(p.priceMISK * 0.7 * 1_000_000)),
      },
    });
    for (const [agentIndex, key] of p.agents.entries()) {
      await db.listingAgent.create({
        data: {
          tenantId,
          listingId: listing.id,
          userId: agentId(key),
          isPrimary: agentIndex === 0,
        },
      });
    }
    const links: Array<{ contactIndex: number; role: ListingContactRole }> = [
      ...p.sellers.map((contactIndex) => ({ contactIndex, role: "SELLER" as const })),
      ...(p.prospects ?? []).map((contactIndex) => ({
        contactIndex,
        role: "PROSPECTIVE_BUYER" as const,
      })),
    ];
    for (const link of links) {
      await db.listingContact.create({
        data: {
          tenantId,
          listingId: listing.id,
          contactId: contactIds[link.contactIndex],
          role: link.role,
        },
      });
    }
    for (const loan of p.loans ?? []) {
      await db.encumbranceLoan.create({
        data: {
          tenantId,
          listingId: listing.id,
          lender: loan.lender,
          remainingBalanceISK: BigInt(Math.round(loan.balanceMISK * 1_000_000)),
          verdtryggt: loan.verdtryggt,
          interestRatePct: loan.rate,
          yfirtakanlegt: loan.yfirtakanlegt ?? false,
        },
      });
    }

    if (!storageUp) continue;
    const mediaPlan: Array<{ category: MediaCategory; label: string }> = [
      ...Array.from({ length: p.photos }, (_, i) => ({
        category: "PHOTO" as const,
        label: `${p.gotuheiti} ${p.husnumer} — mynd ${i + 1}`,
      })),
      ...(p.floorPlan
        ? [{ category: "FLOOR_PLAN" as const, label: "Grunnmynd" }]
        : []),
    ];
    for (const [mediaIndex, media] of mediaPlan.entries()) {
      const assetId = randomUUID();
      const original = await placeholderJpeg(media.label, index * 7 + mediaIndex);
      const originalKey = mediaObjectKey(tenantId, listing.id, assetId, "original", "image/jpeg");
      const webKey = mediaObjectKey(tenantId, listing.id, assetId, "web", "image/jpeg");
      const thumbKey = mediaObjectKey(tenantId, listing.id, assetId, "thumb", "image/jpeg");
      const derivatives = await createImageDerivatives(original);
      await putObject(originalKey, original, "image/jpeg");
      await putObject(webKey, derivatives.web, "image/jpeg");
      await putObject(thumbKey, derivatives.thumb, "image/jpeg");
      await db.mediaAsset.create({
        data: {
          tenantId,
          listingId: listing.id,
          category: media.category,
          storageKey: originalKey,
          webKey,
          thumbKey,
          filename: `${media.label}.jpg`,
          contentType: "image/jpeg",
          sizeBytes: original.byteLength,
          width: derivatives.width,
          height: derivatives.height,
          sortOrder: mediaIndex,
          isCover: media.category === "PHOTO" && mediaIndex === 0,
          uploadedById: agentId(p.agents[0]),
        },
      });
    }
  }
  console.log(
    "Listings: %d created across all pipeline stages%s",
    PROPERTIES.length,
    storageUp ? " (with placeholder photos)" : "",
  );
  return contactIds;
}

// ═══ M3 demo data ═════════════════════════════════════════════════════════

const DAY = 24 * 60 * 60 * 1000;

async function seedM3Data(
  tenantId: string,
  annaId: string,
  jonId: string,
  contactIds: string[],
): Promise<void> {
  // Idempotent: skip when offers already exist for the tenant.
  const existing = await db.offer.count({ where: { tenantId } });
  if (existing > 0) {
    console.log("M3 data already present (%d offers) — skipping M3 seed", existing);
    return;
  }
  const now = Date.now();

  // Listings by fastanúmer (created by the M2 seed).
  const properties = await db.property.findMany({
    where: { tenantId },
    select: { fastanumer: true, listingId: true },
  });
  const listingByFnr = new Map(properties.map((p) => [p.fastanumer, p.listingId]));
  const listings = await db.listing.findMany({
    where: { tenantId },
    select: { id: true, stage: true, createdAt: true },
  });

  // ── Stage history: synthesize the walk from Undirbúningur to each ─────────
  // listing's current stage (SPEC §6 full history with timestamps + actor).
  for (const listing of listings) {
    const agent = await db.listingAgent.findFirst({
      where: { listingId: listing.id, isPrimary: true },
      select: { userId: true },
    });
    const actorUserId = agent?.userId ?? annaId;
    const path =
      listing.stage === WITHDRAWN_STAGE
        ? [EIGNIR_STAGES[0], WITHDRAWN_STAGE]
        : EIGNIR_STAGES.slice(
            0,
            Math.max(1, EIGNIR_STAGES.indexOf(listing.stage as never) + 1),
          );
    const start = Math.min(listing.createdAt.getTime(), now - path.length * 6 * DAY);
    for (let step = 0; step < path.length; step += 1) {
      await db.stageTransition.create({
        data: {
          tenantId,
          listingId: listing.id,
          fromStage: step === 0 ? null : path[step - 1],
          toStage: path[step],
          actorUserId,
          reason:
            path[step] === WITHDRAWN_STAGE
              ? "Seljandi frestaði flutningum erlendis"
              : null,
          createdAt: new Date(start + step * 6 * DAY),
        },
      });
    }
  }

  // ── Offers ─────────────────────────────────────────────────────────────────
  const isk = (millions: number) => BigInt(Math.round(millions * 1_000_000));

  async function createOffer(input: {
    listingId: string;
    parentId?: string;
    amountMISK: number;
    gildistimi: Date;
    afhendingDate?: Date;
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "EXPIRED" | "WITHDRAWN";
    createdById: string;
    decidedById?: string;
    createdAt: Date;
    decidedAt?: Date;
    terms?: string;
    buyers: Array<{ contactId: string; name: string; sharePct?: number }>;
    payments: Array<{ description: string; amountMISK: number; dueDate?: Date }>;
  }): Promise<string> {
    const amountISK = isk(input.amountMISK);
    const paymentItems = input.payments.map((payment, index) => ({
      description: payment.description,
      amountISK: isk(payment.amountMISK),
      dueDate: payment.dueDate ?? null,
      sortOrder: index,
    }));
    const snapshot =
      input.status === "ACCEPTED"
        ? (buildAcceptedSnapshot({
            amountISK,
            afhendingDate: input.afhendingDate ?? null,
            gildistimi: input.gildistimi,
            terms: input.terms ?? null,
            buyers: input.buyers.map((buyer) => ({
              contactId: buyer.contactId,
              name: buyer.name,
              sharePct: buyer.sharePct ?? null,
            })),
            paymentItems,
          }) as object)
        : undefined;
    const offer = await db.offer.create({
      data: {
        tenantId,
        listingId: input.listingId,
        parentId: input.parentId ?? null,
        amountISK,
        gildistimi: input.gildistimi,
        afhendingDate: input.afhendingDate ?? null,
        terms: input.terms ?? null,
        status: input.status,
        createdById: input.createdById,
        decidedById: input.decidedAt ? (input.decidedById ?? input.createdById) : null,
        decidedAt: input.decidedAt ?? null,
        acceptedSnapshot: snapshot,
        createdAt: input.createdAt,
      },
    });
    for (const buyer of input.buyers) {
      await db.offerBuyer.create({
        data: {
          tenantId,
          offerId: offer.id,
          contactId: buyer.contactId,
          sharePct: buyer.sharePct ?? null,
        },
      });
    }
    for (const item of paymentItems) {
      await db.offerPaymentItem.create({ data: { tenantId, offerId: offer.id, ...item } });
    }
    return offer.id;
  }

  const contact = (index: number, name: string, sharePct?: number) => ({
    contactId: contactIds[index],
    name,
    sharePct,
  });

  // Grettisgata 17 (Tilboð móttekið): live negotiation — kauptilboð countered
  // by a gagntilboð that is still open and expires soon (dashboard demo).
  const grettisgata = listingByFnr.get("F2052366")!;
  const grettisgataRoot = await createOffer({
    listingId: grettisgata,
    amountMISK: 47.5,
    gildistimi: new Date(now - 1 * DAY),
    afhendingDate: new Date(now + 60 * DAY),
    status: "COUNTERED",
    createdById: jonId,
    decidedAt: new Date(now - 2 * DAY),
    createdAt: new Date(now - 4 * DAY),
    buyers: [contact(3, "Hildur Einarsdóttir")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 5.0 },
      { description: "Greitt með veðláni frá lánastofnun", amountMISK: 38.0 },
      { description: "Greitt við afsal", amountMISK: 4.5 },
    ],
    terms: "Kaupandi gerir fyrirvara um greiðslumat.",
  });
  await createOffer({
    listingId: grettisgata,
    parentId: grettisgataRoot,
    amountMISK: 49.4,
    gildistimi: new Date(now + 1.5 * DAY),
    afhendingDate: new Date(now + 60 * DAY),
    status: "PENDING",
    createdById: jonId,
    createdAt: new Date(now - 2 * DAY),
    buyers: [contact(3, "Hildur Einarsdóttir")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 6.0 },
      { description: "Greitt með veðláni frá lánastofnun", amountMISK: 38.0 },
      { description: "Greitt við afsal", amountMISK: 5.4 },
    ],
    terms: "Gagntilboð seljanda — aðrir skilmálar óbreyttir.",
  });

  // Langholtsvegur 130 (Tilboð samþykkt): full chain ending in an accepted
  // offer with mixed-status fyrirvarar (SPEC §13 seed requirement).
  const langholtsvegur = listingByFnr.get("F2027781")!;
  const lhRoot = await createOffer({
    listingId: langholtsvegur,
    amountMISK: 82.0,
    gildistimi: new Date(now - 9 * DAY),
    status: "COUNTERED",
    createdById: annaId,
    decidedAt: new Date(now - 10 * DAY),
    createdAt: new Date(now - 11 * DAY),
    buyers: [contact(7, "Leigufélagið Höfði hf.")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 20.0 },
      { description: "Greitt við afhendingu", amountMISK: 62.0 },
    ],
  });
  const lhCounter = await createOffer({
    listingId: langholtsvegur,
    parentId: lhRoot,
    amountMISK: 84.5,
    gildistimi: new Date(now - 8 * DAY),
    status: "COUNTERED",
    createdById: annaId,
    decidedAt: new Date(now - 8.5 * DAY),
    createdAt: new Date(now - 10 * DAY),
    buyers: [contact(7, "Leigufélagið Höfði hf.")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 25.0 },
      { description: "Greitt við afhendingu", amountMISK: 59.5 },
    ],
  });
  const lhAccepted = await createOffer({
    listingId: langholtsvegur,
    parentId: lhCounter,
    amountMISK: 83.5,
    gildistimi: new Date(now - 7 * DAY),
    afhendingDate: new Date(now + 45 * DAY),
    status: "ACCEPTED",
    createdById: annaId,
    decidedById: annaId,
    decidedAt: new Date(now - 7.5 * DAY),
    createdAt: new Date(now - 8 * DAY),
    buyers: [contact(7, "Leigufélagið Höfði hf.")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 22.0 },
      {
        description: "Greitt með veðláni frá lánastofnun",
        amountMISK: 55.0,
        dueDate: new Date(now + 45 * DAY),
      },
      {
        description: "Greitt við afsal og lokauppgjör",
        amountMISK: 6.5,
        dueDate: new Date(now + 90 * DAY),
      },
    ],
    terms: "Samþykkt með fyrirvörum um fjármögnun og ástandsskoðun.",
  });

  const fyrirvarar: Array<{
    type: "FJARMOGNUN" | "SALA_EIGIN_EIGNAR" | "ASTANDSSKODUN" | "SAMTHYKKI_STJORNAR" | "ANNAD";
    description: string;
    deadline: Date;
    responsible: "BUYER" | "SELLER";
    status: "PENDING" | "FULFILLED" | "WAIVED" | "FAILED";
    resolved?: boolean;
  }> = [
    {
      type: "FJARMOGNUN",
      description: "Kaupandi skili greiðslumati frá viðurkenndri lánastofnun.",
      deadline: new Date(now + 5 * DAY),
      responsible: "BUYER",
      status: "PENDING",
    },
    {
      type: "ASTANDSSKODUN",
      description: "Ástandsskoðun óháðs matsmanns án athugasemda.",
      deadline: new Date(now - 2 * DAY),
      responsible: "BUYER",
      status: "FULFILLED",
      resolved: true,
    },
    {
      type: "SAMTHYKKI_STJORNAR",
      description: "Samþykki stjórnar Leigufélagsins Höfða fyrir kaupunum.",
      deadline: new Date(now + 12 * DAY),
      responsible: "BUYER",
      status: "PENDING",
    },
    {
      type: "ANNAD",
      description: "Seljandi fjarlægi geymsluskúr af lóð fyrir afhendingu.",
      deadline: new Date(now - 4 * DAY),
      responsible: "SELLER",
      status: "WAIVED",
      resolved: true,
    },
  ];
  for (const fyrirvari of fyrirvarar) {
    await db.fyrirvari.create({
      data: {
        tenantId,
        offerId: lhAccepted,
        type: fyrirvari.type,
        description: fyrirvari.description,
        deadline: fyrirvari.deadline,
        responsible: fyrirvari.responsible,
        status: fyrirvari.status,
        resolvedById: fyrirvari.resolved ? annaId : null,
        resolvedAt: fyrirvari.resolved ? new Date(now - 1 * DAY) : null,
      },
    });
  }

  // Hafnargata 28 (Kaupsamningur): accepted offer, conditions all closed.
  const hafnargata = listingByFnr.get("F2063490")!;
  const hgAccepted = await createOffer({
    listingId: hafnargata,
    amountMISK: 61.8,
    gildistimi: new Date(now - 20 * DAY),
    afhendingDate: new Date(now + 10 * DAY),
    status: "ACCEPTED",
    createdById: jonId,
    decidedById: jonId,
    decidedAt: new Date(now - 19 * DAY),
    createdAt: new Date(now - 21 * DAY),
    buyers: [
      contact(3, "Hildur Einarsdóttir", 50),
      contact(6, "Anna María Guðjónsdóttir", 50),
    ],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 10.0 },
      { description: "Greitt með veðláni frá lánastofnun", amountMISK: 47.0 },
      { description: "Greitt við afsal", amountMISK: 4.8 },
    ],
  });
  await db.fyrirvari.create({
    data: {
      tenantId,
      offerId: hgAccepted,
      type: "FJARMOGNUN",
      description: "Greiðslumat kaupenda.",
      deadline: new Date(now - 15 * DAY),
      responsible: "BUYER",
      status: "FULFILLED",
      resolvedById: jonId,
      resolvedAt: new Date(now - 16 * DAY),
    },
  });

  // Heiðarvegur 5 (Afsal/Lokið): the completed sale.
  await createOffer({
    listingId: listingByFnr.get("F2012348")!,
    amountMISK: 57.5,
    gildistimi: new Date(now - 40 * DAY),
    afhendingDate: new Date(now - 12 * DAY),
    status: "ACCEPTED",
    createdById: jonId,
    decidedById: annaId,
    decidedAt: new Date(now - 39 * DAY),
    createdAt: new Date(now - 41 * DAY),
    buyers: [contact(1, "Þorsteinn Bjarnason")],
    payments: [
      { description: "Greitt við undirritun kaupsamnings", amountMISK: 8.0 },
      { description: "Greitt með veðláni frá lánastofnun", amountMISK: 45.0 },
      { description: "Greitt við afsal", amountMISK: 4.5 },
    ],
  });

  // ── Viewings, notes, tasks ─────────────────────────────────────────────────
  const njalsgata = listingByFnr.get("F2044231")!;
  const karsnesbraut = listingByFnr.get("F2015877")!;
  const viewings: Array<{
    listingId: string;
    kind: "SKODUN" | "OPID_HUS";
    startsAt: Date;
    endsAt?: Date;
    note?: string;
    attendees: number[];
    createdById: string;
  }> = [
    {
      listingId: njalsgata,
      kind: "OPID_HUS",
      startsAt: new Date(now + 2 * DAY),
      endsAt: new Date(now + 2 * DAY + 45 * 60 * 1000),
      note: "Auglýst á samfélagsmiðlum.",
      attendees: [],
      createdById: annaId,
    },
    {
      listingId: karsnesbraut,
      kind: "SKODUN",
      startsAt: new Date(now + 4 * DAY),
      attendees: [2],
      createdById: annaId,
    },
    {
      listingId: grettisgata,
      kind: "SKODUN",
      startsAt: new Date(now - 6 * DAY),
      note: "Kaupandi mjög áhugasamur, spurði um lagnir.",
      attendees: [3, 6],
      createdById: jonId,
    },
  ];
  for (const viewing of viewings) {
    const row = await db.viewing.create({
      data: {
        tenantId,
        listingId: viewing.listingId,
        kind: viewing.kind,
        startsAt: viewing.startsAt,
        endsAt: viewing.endsAt ?? null,
        note: viewing.note ?? null,
        createdById: viewing.createdById,
      },
    });
    for (const index of viewing.attendees) {
      await db.viewingAttendee.create({
        data: { tenantId, viewingId: row.id, contactId: contactIds[index] },
      });
    }
  }

  await db.listingNote.create({
    data: {
      tenantId,
      listingId: langholtsvegur,
      body: "Stjórnarfundur Höfða er 15. hvers mánaðar — samþykki ætti að liggja fyrir þá.",
      createdById: annaId,
      createdAt: new Date(now - 5 * DAY),
    },
  });
  await db.listingNote.create({
    data: {
      tenantId,
      listingId: njalsgata,
      body: "Seljandi vill helst afhenda eftir 1. desember.",
      createdById: annaId,
      createdAt: new Date(now - 20 * DAY),
    },
  });

  const tasks: Array<{
    listingId: string;
    title: string;
    dueDate?: Date;
    assigneeUserId?: string;
    completedAt?: Date;
    createdById: string;
  }> = [
    {
      listingId: langholtsvegur,
      title: "Minna kaupanda á greiðslumat",
      dueDate: new Date(now + 3 * DAY),
      assigneeUserId: annaId,
      createdById: annaId,
    },
    {
      listingId: grettisgata,
      title: "Fylgja gagntilboði eftir við kaupanda",
      dueDate: new Date(now + 1 * DAY),
      assigneeUserId: jonId,
      createdById: jonId,
    },
    {
      listingId: listingByFnr.get("F2081920")!,
      title: "Panta ljósmyndara",
      dueDate: new Date(now - 2 * DAY),
      assigneeUserId: annaId,
      createdById: annaId,
    },
    {
      listingId: hafnargata,
      title: "Bóka afhendingu og lyklaskil",
      dueDate: new Date(now + 9 * DAY),
      assigneeUserId: jonId,
      createdById: jonId,
    },
    {
      listingId: njalsgata,
      title: "Setja upp opið hús skilti",
      completedAt: new Date(now - 1 * DAY),
      createdById: annaId,
    },
  ];
  for (const task of tasks) {
    await db.listingTask.create({
      data: {
        tenantId,
        listingId: task.listingId,
        title: task.title,
        dueDate: task.dueDate ?? null,
        assigneeUserId: task.assigneeUserId ?? null,
        completedAt: task.completedAt ?? null,
        createdById: task.createdById,
      },
    });
  }

  console.log(
    "M3: stage history, %d offer chains (1 accepted with mixed fyrirvarar), %d viewings, %d tasks",
    4,
    viewings.length,
    tasks.length,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
