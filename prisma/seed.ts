/**
 * Seed script. Idempotent — safe to re-run (upserts on unique keys).
 *
 * M1: plans, superadmin, demo Eignir tenant + admin/agent, demo Bílar tenant.
 * Later milestones extend the marked sections below so every screen demos
 * well immediately (SPEC §13).
 */
import "dotenv/config";
import { hashSync } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "handsal-demo1";
const passwordHash = hashSync(DEMO_PASSWORD, 12);

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
  await db.user.upsert({
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
  await db.user.upsert({
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

  // ── M2: postal codes/municipalities, contacts, ~12 properties, media ─────
  // (extended in milestone M2)

  // ── M3: pipeline stages spread, offers + counter-offer chain, accepted ────
  // offer with mixed-status fyrirvarar, viewings/opið hús, tasks
  // (extended in milestone M3)

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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
