# Handsal — Progress

Milestones per SPEC §14. Decisions recorded per milestone.

## M1 — Foundation ✅ (2026-08-20)

Completed:

- [x] Repo, Next.js 15 (App Router, TS, Tailwind v4, shadcn/ui), folder structure per SPEC §2 with lint-enforced core boundaries
- [x] Docker Compose: postgres 16, MinIO, Mailpit; `.env.example` documenting all env vars; production `Dockerfile` (standalone) + `.dockerignore`
- [x] Prisma 7 core schema: `Plan`, `Tenant`, `User`, `AuditLog` + enums; initial migration generated offline (`prisma/migrations/20260820000000_init`)
- [x] Tenant isolation layer: `getTenantDb(tenantId)` Prisma client extension (`src/core/tenancy/isolation.ts`) + scoped-model registry; `unscopedDb` restricted to auth//admin/seed paths
- [x] Auth.js v5: credentials + bcryptjs, JWT sessions, RBAC (SUPERADMIN/ADMIN/AGENT), edge-safe middleware split, login rate limiting (per-IP + per-email), login/failed-login audit events
- [x] i18n scaffolding: next-intl, cookie locale (`is` default), full `is`/`en` catalogs for M1 screens, locale switcher; Icelandic formatting utils (`formatISK`, `formatDate`, `formatArea`) + tests
- [x] Base layout + vertical theming: Handsal design tokens (charcoal-navy + copper), `[data-vertical]` accent switch (Eignir copper / Bílar steel blue), tenant `brandColor` override, responsive app shell (sidebar/topbar/mobile drawer), login page
- [x] `/admin` superadmin area: tenants CRUD (+ initial ADMIN user creation), plans CRUD, platform audit log view; all mutations audited
- [x] Tests: 13 unit tests (formatting, rate limiter, locale) + 22 integration tests proving cross-tenant isolation for every operation type (`tests/integration/tenant-isolation.test.ts`)
- [x] Seed script skeleton: 3 plans (Byrjun/Vöxtur/Atvinnumaður), superadmin, Demo fasteignasala (admin + agent), Demo bílasala; sections marked for M2–M6 data
- [x] `README.md`, `ARCHITECTURE.md`, this file

Decisions:

1. **M1 schema scope**: only tenancy/auth/plan/audit models; domain models land in their milestones.
2. **bcryptjs** (pure JS) for hashing — no native build friction on Windows.
3. **JWT sessions** (required for the credentials provider); token carries `userId/tenantId/role/vertical`. Electronic ID later = extra provider, same session shape.
4. **Cookie-based locale**, no URL locale prefixes — simplest consistent with spec.
5. **Isolation via Prisma client extension** with a mandatory scoped-model registry; unregistered models throw. `AuditLog` additionally append-only at the client layer.
6. **SUPERADMIN = `User` with `tenantId = null`** — one auth path, no separate table.
7. **Audit `action` is a string column + TS union** (not a Postgres enum) so new actions don't require migrations; the union in `src/core/audit/actions.ts` is the source of truth.
8. **Adapter interfaces will live in `src/core/ports`** (hexagonal); `src/adapters/*` holds implementations. Keeps the "core never imports adapters" rule mechanical (lint).
9. **Production builds use webpack** (`next build` without `--turbopack`): Turbopack standalone tracing hits an NTFS `EINVAL` on Windows for `node:*` chunk filenames. Dev still uses Turbopack.
10. **Prisma 7** (installed by default): `prisma-client` generator → `src/generated/prisma` (gitignored), datasource URL in `prisma.config.ts`, runtime via `@prisma/adapter-pg`.

Open questions / follow-ups:

- Warning email at 90% plan usage (SPEC §12) needs the EmailAdapter — lands with M4/M5.
- Tenant-scoped audit view for tenant ADMINs (SPEC §13) — planned with M2+ when tenants have business events worth showing.

### ✅ DB verification (resolved 2026-08-21)

Docker chain resolved (BIOS SVM → WSL component → reboot; Docker Desktop engine 29.7.2 running). `db:up`, `db:migrate` (both offline-generated migrations applied cleanly first try), `seed`, and both integration suites verified — see the M2 verification note below for the two runtime bugs the first live run surfaced and their fixes.

## M2 — Contacts & properties ✅ (2026-08-21)

Completed:

- [x] Kennitala validation (checksum, day/month/century, person vs company) + 22 unit tests (`src/core/contacts/kennitala.ts`)
- [x] `ThjodskraAdapter` port (`src/core/ports/registry.ts`) + mock (`src/adapters/registry/thjodskra.mock.ts`): documented test kennitölur, deterministic generated fakes for unknown valid kt, simulated latency + outage kt; service registry `src/lib/services.ts` selects impl via `ADAPTER_THJODSKRA`
- [x] Prisma schema M2: `Contact`, `Listing` (core base), `ListingAgent`, `ListingContact`, `Property`, `EncumbranceLoan`, `MediaAsset`, `ListingDocument`, `PostalCode` + enums; offline migration `20260820120000_m2_contacts_properties_media`; scoped-model registry extended
- [x] Composite tenant-safe FKs: child rows reference `(tenantId, id)` of Listing/Contact/User, so cross-tenant links are impossible at the DB level; new integration suite `tests/integration/m2-domain-isolation.test.ts`
- [x] Contacts CRUD: list/search, create/edit/delete (delete blocked while linked), Þjóðskrá autofill with every lookup audited (kennitala + purpose + result), per-tenant kennitala uniqueness, is/en catalogs, nav unlocked

- [x] Storage lib (`src/lib/storage.ts`): presigned PUT/GET (10/5 min TTL), MinIO/S3 via env, server-derived keys `tenants/{tenantId}/listings/{listingId}/…`
- [x] Media pipeline: sharp derivatives (web 1600px / thumb 480px JPEG, EXIF rotation), upload request/confirm/delete/reorder/cover/category server actions; media manager UI (multi-upload, drag-to-reorder, cover star, categories)
- [x] Documents: typed (eignaskiptayfirlýsing/skilalýsing/veðbandayfirlit/annað) + dated uploads, signed download links, delete
- [x] Listing/property CRUD: full SPEC §5 field set form (Icelandic input formats — decimal comma, dot-grouped ISK), list page with cover thumbs + stage badges + search, detail page (facts, media, documents, parties, agents, loans), edit, delete (cleans storage objects); creator = primary agent; RBAC via `requireManageableListing`
- [x] Parties/agents/loans panels: link contacts by role, assign agents (primary auto-managed), áhvílandi lán add/remove
- [x] Listings + contacts i18n complete in `is`/`en` (domain terms Icelandic in both, glossed in English)
- [x] Postal code/municipality reference data (~100 codes, `prisma/seed-data/postal-codes.ts`) + seed upserts
- [x] M2 seed: 8 contacts (checksum-valid kennitölur generated via `kennitalaCheckDigit`, incl. mock-Þjóðskrá test person), 12 properties across all pipeline stages with loans, seller/prospect links, and placeholder photos uploaded through the real derivative pipeline (skips photos gracefully if MinIO is down)
- [x] README demo flows (M2), ARCHITECTURE.md (domain model, storage/media, composite FKs)
- [x] Verified: typecheck, lint, 35 unit tests, production `next build` all green

### DB + live verification (2026-08-21)

First run against real Postgres/MinIO: migrations applied cleanly, seed created
104 postal codes / 8 contacts / 12 listings with photos through the real sharp +
MinIO pipeline. Browser smoke test (login as anna@demo.is, listings grid with
MinIO-signed cover thumbs, listing detail with gallery/cover/categories/docs
panels, contact create/delete, Þjóðskrá lookup autofill + toast) all pass.
Final state: typecheck, lint, **37 unit + 30 integration tests** green.

Two runtime bugs surfaced by the first live run, both fixed:

1. **Upsert vs. native `ON CONFLICT`** (`src/core/tenancy/isolation.ts`): Prisma
   compiles scoped upsert to `INSERT … ON CONFLICT DO UPDATE … WHERE tenantId`;
   on a cross-tenant unique collision the WHERE excludes the foreign row, zero
   rows are written and Prisma resolves `null` instead of throwing P2002.
   Isolation held (foreign row untouched, no clone), but the silent `null`
   violated upsert's contract — the scoped client now converts it to
   `TenantIsolationError`. Integration test tightened accordingly.
2. **`logAudit` explicit `tenantId: null`** (`src/core/audit/log.ts`): the
   `entry.tenantId ?? null` coercion sent an explicit null through the scoped
   client, which rejects it (only the *absence* of the key lets the client
   stamp it). Every scoped audit call site (contacts, listings, media,
   documents — 11 sites) crashed at runtime; unit/build checks missed it since
   M1's audit events all used `unscopedDb`. Fixed to omit the key unless
   explicitly provided + unit regression test (`src/core/audit/log.test.ts`).

Decisions (M2 so far):

1. **Composite FKs for tenant safety**: every child/join table FK includes `tenantId` → DB-level guarantee against cross-tenant references (defense in depth on top of the scoped client).
2. **Listing RBAC**: all tenant users view all listings; ADMIN manages all, AGENT manages listings they are assigned to; creator becomes primary agent.
3. **ISK amounts as BigInt** (commercial properties exceed int4); areas as Decimal(7,1); tsconfig target → ES2022 for bigint literals.
4. **PostalCode is global reference data** (no tenantId), read via `unscopedDb`; deliberately not in the scoped-model registry.
5. **MediaAsset = images only** (jpeg/png/webp, derivatives always generated); PDFs and other files go to `ListingDocument`. Derivatives are JPEG (not WebP) because the söluyfirlit PDF renderer (M4) takes JPEG/PNG.
6. **Áhvílandi lán on Listing** (not Property) so the Bílar vertical reuses the same structure (SPEC §5 "same structure").
7. **Storage keys embed tenant**: `tenants/{tenantId}/listings/{listingId}/…`, always derived server-side; browser never controls keys. Signed GET URLs generated per render, plain `<img>` (next/image would cache expired signed URLs).

## M3 — Pipeline, offers, fyrirvarar ☐ (next)

## M4 — Portals, söluyfirlit, e-signing ☐

## M5 — Commission, plans, dashboard ☐

## M6 — Handsal Bílar scaffold ☐
