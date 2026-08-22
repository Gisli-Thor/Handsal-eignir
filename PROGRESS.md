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

## M3 — Pipeline, offers, fyrirvarar ✅ (2026-08-21)

Completed:

- [x] Schema (migration `20260821104939_m3_pipeline_offers_fyrirvarar_activity`):
  `StageTransition` (append-only), `Offer` (self-relation chain) /
  `OfferBuyer` (share %) / `OfferPaymentItem`, `Fyrirvari` (+ reminder stamps),
  `Viewing`/`ViewingAttendee`, `ListingNote`, `ListingTask` — all with
  composite tenant-safe FKs; scoped-model registry + audit actions extended
- [x] Core pipeline engine (`src/core/pipeline`): config-driven stages, guards
  keyed by target stage (overridable → ADMIN bypass with logged reason),
  post-commit best-effort hooks, transactional stage change with optimistic
  concurrency (conflict result), append-only history, STAGE_CHANGED /
  STAGE_GUARD_OVERRIDDEN audit; Eignir config (`verticals/eignir/pipeline.ts`)
  with publishedAt/soldAt stamp hooks; `lib/pipelines.ts` lookup
- [x] Offers: chain state machine + greiðslutilhögun sum validation (BigInt) in
  `core/offers/state.ts`; create (kauptilboð/gagntilboð, multi-buyer with
  hlutfall, payment line items with live sum check, gildistími date+time),
  accept (immutable snapshot, closes competing offers, stage move), reject/
  withdraw; first offer on Í sölu auto-moves to Tilboð móttekið; expiry job
- [x] Fyrirvarar: typed conditions, Kaupsamningur guard (blocks agents, ADMIN
  override dialog), color-coded deadline panel (green/amber/red per SPEC),
  resolve/waive/fail/reopen with resolved-by+at, FAILED fallback prompt
  (Í sölu / Fallið frá), reminder emails 7d/2d/due with per-tier idempotent
  stamps (rollback on send failure)
- [x] EmailAdapter port + SMTP (nodemailer → Mailpit) and mock adapters;
  in-process job scheduler (60s) via `src/instrumentation.ts` (node-only)
- [x] Activity: viewings/opið hús with contact attendees, notes, tasks
  (due date, assignee, complete toggle); unified server-rendered timeline
  merging stage history + offer events + viewings + notes + tasks
- [x] UI: Sölupípa stepper with click-to-move + Fallið frá reason dialog +
  reactivate; offers thread (indented chains); /offers overview page (nav
  unlocked); dashboard panels (pending fyrirvarar by deadline, offers
  expiring soon, upcoming viewings, open tasks); full is/en catalogs
- [x] M3 seed: stage history for all 12 listings, 4 offer chains (live
  negotiation expiring <48h, 3-deep chain → accepted with 4 mixed-status
  fyrirvarar, closed sale), viewings/notes/tasks incl. one overdue task
- [x] Tests: 21 new unit tests (engine, offer state machine + payment
  validation incl. >MAX_SAFE_INTEGER, guard) and 11 new integration tests
  (engine on real Postgres incl. guard override + append-only history,
  composite-FK isolation for all new models, expiry job, reminder job with
  mock email). Totals: **56 unit + 41 integration, all green**
- [x] Verified live in browser: dashboard panels, stepper, guard block +
  ADMIN override dialog, offer chains, fyrirvarar colors, timeline, /offers;
  reminder job sent a real email through Mailpit on schedule
- [x] README demo flows (M3), ARCHITECTURE.md section, this file

Decisions (M3):

1. **Free stage movement, guard-enforced correctness**: any distinct known
   stage is reachable (real workflows skip/revisit stages); guards on the
   target stage carry the rules (fyrirvarar → Kaupsamningur now; plan limit →
   Í sölu in M5). Fallið frá requires a reason; reactivation → Undirbúningur
   (via stepper any stage is reachable afterwards).
2. **Hooks are post-commit and best-effort** — a portal failure (M4) must
   never roll back a stage change; hook errors are surfaced to the caller.
3. **First offer on a listing in Í sölu auto-moves it to Tilboð móttekið**
   (system transition, recorded like any other).
4. **Accepting an offer closes every other open offer on the listing**, not
   just the same chain — the property is under an accepted offer either way.
5. **Fyrirvarar attach to the offer** (addable while PENDING or ACCEPTED —
   they are agreed in the offer itself, per the legacy-system examples) and
   are tracked to resolution after acceptance; the guard only counts the
   ACCEPTED offer's open ones.
6. **Multiple buyers with hlutfall (%)** on offers, from examples/NOTES.md
   (real offers split ownership); counters inherit the parent's buyers.
7. **Reminder idempotency via per-tier stamps on the row**; a more urgent
   tier also stamps milder ones (an overdue fyrirvari found late → one email).
8. **Jobs are in-process** (SPEC-sanctioned for MVP): 60s interval started
   from instrumentation.ts, node runtime only, cross-tenant via unscopedDb.

### M3 verification (2026-08-21)

Typecheck, lint, 56 unit + 41 integration tests, production build all green.
Browser smoke test passed end-to-end, including a live reminder email landing
in Mailpit from the running scheduler.

## M4 — Portals, söluyfirlit, e-signing ✅ (2026-08-21)

Completed:

- [x] Schema (migration `20260821205728_m4_portals_soluyfirlit_signing`):
  `PortalPublication` + `PortalSyncEvent` (append-only), `SoluyfirlitVersion`
  + `SoluyfirlitSend` (both append-only, send links optional receipt
  request), `SigningRequest` (+globally-unique providerRequestId) /
  `SigningSigner` (providerSignerId) / `SigningEvent` (append-only);
  `Contact.source/needsReview`, `Listing.soluthoknunText`,
  `ListingDocumentType.UNDIRRITAD`; scoped-model registry + 10 audit actions
- [x] Ports + mocks: `PortalAdapter` (3 Eignir mock instances, 300–1500 ms
  latency, ~5% transient failures, fake leads on pull, injectable RNG) and
  stateless `SigningAdapter` mock; `getPortalAdapters`/`getSigning` registry
- [x] Publication lifecycle: `core/portals/sync.ts` (never throws — per-portal
  ERROR isolation, retry-once, sync log + audit; lead ingestion with email
  dedupe → flagged prospect contacts); pipeline hooks (Í sölu → publish,
  Kaupsamningur → unpublish); NEEDS_UPDATE flips from listing/media/loan
  edits; portals panel (toggles, statuses, push/pull, sync-now prompt, log)
- [x] PDF infra: @react-pdf/renderer (serverExternalPackages + dynamic
  import), Noto Sans from public/fonts registered as base64 on the imported
  module instance, hyphenation disabled; pdf-lib for merging
- [x] Söluyfirlit: PDF per SPEC §9 + examples/NOTES.md layout (tenant-branded,
  cover photo, Þjóðskrá table, loans, söluþóknun disclosure, floor-plan page,
  signature lines), versioning (max+1, immutable rows), send flow (bilingual
  email + PDF attachment + 7-day signed link, send log, optional receipt
  signature request), panel with full history
- [x] E-signing: draft contract PDFs watermarked DRÖG (kauptilboð from
  accepted-offer snapshot incl. amount-in-words util `isk-words.ts`;
  kaupsamningur/afsal skeletons), signing panel (source picker incl. uploaded
  PDFs, signer picker), webhook `POST /api/webhooks/signing` (shared secret,
  timingSafeEqual, zod) → status derivation → on SIGNED stamp signature page
  (react-pdf + pdf-lib merge) stored back as UNDIRRITAD document;
  `/dev/signing` simulator fires the real webhook (dev-gated)
- [x] Wide-screen layout (user request): listing detail max-w-[1400px] with
  xl main/sidebar split; listings/dashboard 1600px caps; tables 7xl;
  listings grid 2xl:grid-cols-4
- [x] Seed: 11 publications in mixed states (incl. ERROR + sync log), 2
  flagged inbound leads, söluyfirlit v1/v1+v2 with send log (real renders),
  PARTIALLY_SIGNED kaupsamningur on Hafnargata 28 (completable in the
  simulator)
- [x] Tests: +24 unit (portal sync transitions/lead dedupe, isk-words
  validated against the real documents' amounts, signing status derivation)
  and +10 integration (lifecycle on real DB, composite-FK isolation,
  append-only rules, webhook route auth + full sign→stamp→document flow
  against MinIO). Totals: **80 unit + 51 integration, all green**
- [x] Verified live in browser: portal publish-all with real mock latency +
  sync log, söluyfirlit v2 rendered/downloaded (Icelandic glyphs, cover
  photo, branding), send → Mailpit email with attachment + receipt request,
  /dev/signing signed both open requests through the real webhook → stamped
  UNDIRRITAD PDFs on the listings; wide layout verified at 1920px
- [x] README demo flows (M4 + simulator per SPEC §16), ARCHITECTURE.md, this file

Decisions (M4):

1. **Publication rows lazily upserted; missing row = enabled** — entering
   Í sölu publishes everywhere with zero setup; portals added to the registry
   later aren't stranded.
2. **Portal sync never throws** — per-portal failures become ERROR status +
   log; pipeline hooks stay fire-and-forget.
3. **Webhook tenant safety**: providerRequestId is globally unique; the
   webhook (no tenant context) resolves via unscopedDb and derives tenantId
   from the row. Signers matched by providerSignerId (not DB ids).
4. **Signing mock is stateless**; domain state is webhook-authoritative. The
   M4 UI has no separate DRAFT step (create → SENT); the enum keeps DRAFT for
   provider parity.
5. **PDF documents are Icelandic-only** — legal documents, not UI (SPEC §1.4
   applies to UI strings; the send *email* is bilingual per §9).
6. **`presignDownload` gained `ttlSeconds`** — emailed links use 7 days
   (SigV4 max); the default 5-minute TTL stays for per-render page links.
7. **Söluþóknun disclosure = `Listing.soluthoknunText` free text** until M5
   commission schemes supersede it.
8. **PDF modules carry no `server-only` marker** (seed/tsx and vitest import
   them); they are kept out of client/edge bundles by the dynamic-import +
   serverExternalPackages pattern instead. Fonts must register on the same
   @react-pdf module instance that renders (dual-package FontStores).

### M4 verification (2026-08-21)

Typecheck, lint, 80 unit + 51 integration tests, production build (dev server
stopped first) all green. Browser smoke passed end-to-end at 1920px width.

## M5 — Commission, plans, dashboard ✅ (2026-08-22)

Completed:

- [x] Schema (migration `20260822184301_m5_commission_plans`):
  `Tenant.commissionScheme Json?` + `usageWarnedAt`,
  `Listing.commissionSchemeOverride Json?`, `ListingAgent.splitPct`,
  `CommissionRecord` (frozen, composite tenant-safe FK, unique per listing,
  append-only in the scoped registry); audit actions
  COMMISSION_RECORD_CREATED / COMMISSION_SCHEME_UPDATED / AGENT_SPLIT_UPDATED
- [x] Commission core (`src/core/commission/`): zod scheme (JSON columns,
  BigInt as digit strings, `version: 1`), pure BigInt calculator (basis
  points, floor division, VSK 24% on commission + fixed fees), Icelandic
  disclosure generator, finalize hook (accepted offer amount ?? ásett verð,
  freeze-once), report aggregations + CSV builder (UTF-8 BOM, semicolons)
- [x] Plan limits (`src/core/plans/`): non-overridable guard registered on
  ALL five active-band stages with a free within-band short-circuit;
  upgrade-prompt dialog in the stage timeline (ADMIN gets a /settings link);
  usage meter on /settings; 90% warning email job (stamp-before-send,
  rollback on failure, cleared under 90%) as the third scheduler job
- [x] Settings: usage meter + tenant scheme editor (shared
  `commission-scheme-form.tsx`); per-listing override card on listing detail
  (ADMIN, "use tenant default" option); agent split editor in the agents
  panel (per-agent %, sum-to-100 validation); frozen record card with splits
- [x] Söluyfirlit: söluþóknun disclosure now scheme-derived
  (`describeSchemeIs`) when `soluthoknunText` is unset (text = explicit
  override, superseding the M4 stopgap)
- [x] Reports `/reports` (ADMIN, nav `adminOnly` flag): monthly earned
  (hand-rolled bar chart on `--chart-1`, last 12 months), per-agent,
  pipeline forecast (stages 3–6, real calculator, effective scheme); CSV
  route `?report=monthly|agents|forecast`
- [x] Dashboard (full per SPEC §13): pipeline overview (counts + ásett-verð
  value per stage, mini bars) + recent portal sync errors panels added to
  the M3 four
- [x] Polish pass: `(app)`/admin `loading.tsx`, global `error.tsx` +
  `not-found.tsx` (translated), sheet/dialog sr-only Close via
  `common.close`, settings users-table empty branch
- [x] Seed: tenant schemes (Eignir 2,2% + NOTES.md fees; Bílar
  FLAT_PLUS_PERCENT), TIERED override on Hafnargata 28, 60/40 split +
  real-calculator CommissionRecord on Heiðarvegur 5 (backdated near soldAt)
- [x] Tests: +22 unit (calculator incl. tier boundaries/basis-point
  float/split remainders, scheme zod, describeSchemeIs, plan guard incl.
  band short-circuit, CSV builder) and +10 integration (freeze-once hook,
  guard at limit on real DB, record isolation + append-only, usage-warning
  job stamp set/clear/rollback). Totals: **102 unit + 61 integration green**
- [x] Verified live in browser: dashboard panels, reports + CSV (BOM
  checked), settings meter + prefilled scheme editor, plan-limit upgrade
  dialog (limit temporarily lowered to current usage), 60/40 split editor +
  frozen record card, scheme-derived disclosure extracted from a freshly
  generated söluyfirlit PDF

Decisions (M5):

1. **Schemes as zod-validated JSON columns** (not a model): polymorphic blob
   nothing queries relationally; reports read the frozen record; corrupt
   blobs degrade to "no scheme".
2. **TIERED = marginal brackets** (tax-band style; single-bracket-by-total
   would let a tiny price increase reduce the commission). `uptoISK`
   inclusive; last tier open-ended.
3. **Splits (user decision)**: primary agent gets 100% by default;
   per-listing percentages (ListingAgent.splitPct) editable by ADMIN, must
   sum to 100; rounding remainder to the primary. Line items are agency
   fees — excluded from splits.
4. **BigInt floor arithmetic + basis points** (Math.round(percent×100)) —
   deterministic whole-ISK, immune to float drift (2.2×100 ≠ 220 in floats).
5. **Plan guard on the whole active band, not just Í sölu** — the engine
   allows any→any jumps; within-band moves short-circuit without a DB hit.
   Non-overridable per SPEC §12.
6. **Usage warning is a job, not a hook** — a hook misses the
   superadmin-lowers-plan case; dedup via `usageWarnedAt` stamped before
   send, rolled back on failure, cleared under 90%.
7. **Dashboard stage values = sum of ásett verð** (accepted-offer amounts
   per stage deliberately not folded in — the forecast on /reports does
   that properly).
8. **CSV**: UTF-8 BOM + semicolon delimiter (Icelandic Excel), CRLF.

### M5 verification (2026-08-22)

Typecheck, lint, 102 unit + 61 integration tests, production build (dev
server stopped first) all green. Browser smoke passed end-to-end.

## M6 — Handsal Bílar scaffold ☐
