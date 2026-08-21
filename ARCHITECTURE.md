# Handsal — Architecture

Technical overview for developers joining the project. The product spec is `SPEC.md`; milestone status is `PROGRESS.md`.

## Stack

- **Next.js 15** (App Router, `src/` layout, server components + server actions by default; client components kept lean)
- **TypeScript**, strict
- **PostgreSQL + Prisma 7** — note Prisma 7 specifics below
- **Auth.js (NextAuth v5)** — credentials provider, JWT sessions, RBAC
- **next-intl** — `is` (default) + `en`, cookie-based locale (no URL prefixes)
- **Tailwind CSS v4 + shadcn/ui** (Radix)
- **Zod** for all input validation in server actions
- **Vitest** — `unit` and `integration` projects
- **Docker Compose** dev infra: `postgres`, `minio` (S3), `mailpit` (SMTP)

## Folder structure & boundaries

```
src/
  core/            # shared domain logic — tenancy, audit, (M2+: contacts,
                   # listings, pipeline engine, offers, …) and adapter
                   # interfaces (src/core/ports)
  verticals/
    eignir/        # Eignir-specific: nav, (M2+: property model, pipeline
    bilar/         # config, söluyfirlit); Bílar is scaffold-only
  adapters/        # concrete (mock) implementations of core ports
  lib/             # infrastructure: db client, auth, i18n, formatting
  app/             # Next.js routes: (auth), (app) tenant shell, admin/
  components/      # shared UI (shadcn/ui in components/ui)
  generated/       # Prisma client output — gitignored, `npm run db:generate`
```

**Boundary rule (lint-enforced, `eslint.config.mjs`):** `src/core/**` must not import from `@/verticals/*`, `@/adapters/*`, or `@/app/*`. Adapter *interfaces* live in `src/core/ports`; concrete implementations live in `src/adapters/*` and are injected via a service registry in `src/lib` configured from env (`ADAPTER_*` vars). Verticals and app may import core; never the other way.

## Multi-tenancy & isolation

The single most important invariant: **no query crosses a tenant boundary.**

- Every tenant-scoped model carries `tenantId` and must be registered in
  `src/core/tenancy/scoped-models.ts`. The scoped client **refuses to touch
  unregistered models**, so forgetting to register a new model fails loudly.
- `getTenantDb(tenantId)` (`src/lib/db.ts`) returns a Prisma client extension
  (`src/core/tenancy/isolation.ts`) that:
  - AND-composes `tenantId` into every filter `where` (hostile `OR`/`tenantId`
    clauses cannot widen results),
  - merges `tenantId` into unique selectors (atomic — no read-then-write TOCTOU),
  - stamps `tenantId` onto creates and rejects foreign `tenantId`s or nested
    `tenant` relation writes with `TenantIsolationError`,
  - rejects update/delete on append-only models (`AuditLog`).
- `unscopedDb` is the raw client. Legitimate call sites only: auth (login
  lookup by email), the `/admin` superadmin area, platform audit events,
  seeds/tests. Everything else goes through `getTenantDb`.
- `tests/integration/tenant-isolation.test.ts` proves the invariant across
  every operation type; extend it whenever a scoped model is added.
- **Composite tenant-safe FKs (M2, defense in depth):** child/join rows
  (`ListingAgent`, `ListingContact`, `Property`, `EncumbranceLoan`,
  `MediaAsset`, `ListingDocument`) reference parents by `(tenantId, id)`
  composite foreign keys, so a row can never point at another tenant's
  listing/contact/user even if application code slips. Consequence: creates
  through the scoped client must pass `tenantId` explicitly (the extension
  verifies it matches and would stamp it anyway; Prisma's types require it
  because `tenantId` is part of the relation scalars). Proven in
  `tests/integration/m2-domain-isolation.test.ts`.
- `PostalCode` is global reference data (no `tenantId`), deliberately not in
  the scoped-model registry; read it via `unscopedDb`.

## Domain model (M2)

- `Listing` is the **core base** (SPEC §5): stage (string key; the pipeline
  engine in `src/core/pipeline` is the only writer), ásett verð (`BigInt` — ISK
  amounts exceed int4 for commercial property), descriptions IS/EN,
  agents/contacts/media/documents/loans relations. `Property` is the Eignir
  1:1 extension; `Vehicle` (M6) will mirror this for Bílar.
- Contact roles are contextual per listing via `ListingContact.role`
  (SELLER / BUYER / PROSPECTIVE_BUYER / CO_OWNER).
- Listing RBAC (`src/core/listings/permissions.ts`): all tenant users can view
  all tenant listings; ADMIN manages all, AGENT manages assigned listings; the
  creator becomes primary agent. Mutations funnel through
  `requireManageableListing` (`src/app/(app)/listings/listing-access.ts`).
- Kennitala validation lives in `src/core/contacts/kennitala.ts` (mod-11
  checksum, structural checks, person/company by day+40). Contacts have a
  per-tenant unique kennitala.
- Every Þjóðskrá lookup is audit-logged (who/when/kennitala/purpose/result),
  awaited, and failures propagate — a compliance requirement (SPEC §4). Mock
  test kennitölur are documented in `src/adapters/registry/thjodskra.mock.ts`.

## Storage & media pipeline (M2)

- S3-compatible storage (`src/lib/storage.ts`): MinIO in dev, R2/S3 in prod,
  configured via `S3_*` env vars. Binaries never touch Postgres.
- Upload flow: server action hands out a **presigned PUT** (10 min TTL) for a
  server-derived key `tenants/{tenantId}/listings/{listingId}/…` — the browser
  never controls storage paths — then a confirm action downloads the original,
  generates **web (1600px) and thumb (480px) JPEG derivatives** with sharp
  (`src/core/media/derivatives.ts`, EXIF-rotation applied) and creates the
  `MediaAsset` row. First photo becomes the cover; exactly one cover is kept.
- Downloads are short-lived **signed GET URLs** (5 min) generated per render;
  pages use plain `<img>` because next/image would cache expired signed URLs.
- `MediaAsset` = images only (jpeg/png/webp, ≤25 MB, categories
  PHOTO / FLOOR_PLAN / DOCUMENT_SCAN); PDFs and other files are
  `ListingDocument` (typed + dated, ≤50 MB). Deleting rows also deletes the
  storage objects.

## Pipeline, offers, fyrirvarar & activity (M3)

- **Pipeline engine** (`src/core/pipeline/engine.ts`): generic, config-driven.
  A `PipelineConfig` (ordered stages, withdrawn side-state, guards and hooks
  keyed by *target* stage) is built per vertical — Eignir in
  `src/verticals/eignir/pipeline.ts`, looked up via `src/lib/pipelines.ts`
  (same composition pattern as `services.ts`). Any distinct known stage is
  reachable from any other; correctness is enforced by guards, not an
  adjacency matrix. Fallið frá requires a reason. Transitions run in a
  transaction with an optimistic stage check (concurrent moves return
  `conflict`), write the append-only `StageTransition` history, and audit
  `STAGE_CHANGED`. **Guards** may be `overridable` — an ADMIN bypass stores
  the reason on the history row and audits `STAGE_GUARD_OVERRIDDEN`.
  **Hooks** run post-commit and are best-effort (failures are reported, never
  roll back the move) — M3 registers publishedAt/soldAt stamps; M4 adds portal
  publish/unpublish, M5 the commission hook and plan-limit guard.
- **Offers** (`Offer` + `OfferBuyer` + `OfferPaymentItem`): counter-offers
  (gagntilboð) reference their parent — chains have one PENDING leaf; all
  non-PENDING statuses are terminal (`src/core/offers/state.ts`).
  Greiðslutilhögun line items must sum exactly to the offer amount (BigInt
  math, validated server-side and live in the form). Multiple buyers with
  optional ownership shares (real offers split e.g. 54/46 — see
  examples/NOTES.md). Creating the first offer on a listing in *Í sölu*
  auto-moves it to *Tilboð móttekið*; accepting writes an immutable
  `acceptedSnapshot` JSON, rejects every other open offer on the listing, and
  moves the listing forward to *Tilboð samþykkt*.
- **Fyrirvarar**: typed conditions on an offer (added while PENDING or
  ACCEPTED, tracked to resolution after acceptance). The Kaupsamningur guard
  (`src/core/fyrirvarar/guard.ts`) blocks while any fyrirvari on the ACCEPTED
  offer is PENDING/FAILED. Reminder emails to the listing's primary agent at
  7d/2d/deadline (`src/core/fyrirvarar/reminders.ts`) — per-tier sent-stamps
  on the row prevent duplicates; a failed send rolls the stamp back for retry.
- **Background jobs** (`src/lib/jobs.ts`, started once per process from
  `src/instrumentation.ts`, node runtime only): offer expiry + fyrirvari
  reminders every 60s, cross-tenant via `unscopedDb` (documented call site).
  In `instrumentation.ts` the dynamic import sits inside a literal
  `NEXT_RUNTIME === "nodejs"` check so webpack drops nodemailer/Prisma from
  the edge bundle.
- **EmailAdapter** (`src/core/ports/email.ts`): `smtp` (nodemailer → Mailpit
  in dev, web UI :8025) or `mock` (in-memory, used by integration tests),
  selected via `ADAPTER_EMAIL`.
- **Activity**: `Viewing` (+`ViewingAttendee` contacts), `ListingNote`,
  `ListingTask` (assignee via tenant-safe composite FK). The listing detail
  page merges stage history, offer events, viewings, notes and tasks into one
  server-rendered timeline; the dashboard aggregates pending fyrirvarar,
  expiring offers, upcoming viewings and open tasks.

## Portals, söluyfirlit & e-signing (M4)

- **Portal publishing** (SPEC §8): `PortalAdapter` port
  (`src/core/ports/portals.ts`) with three Eignir mock instances registered in
  `src/lib/services.ts` (`getPortalAdapters(vertical)`). Orchestration in
  `src/core/portals/sync.ts` is adapter-injected and **never throws** — each
  portal fails independently into `PortalPublication.status = ERROR` +
  lastError + a `PortalSyncEvent` (append-only log) + audit. One retry on
  `TransientPortalError` (mocks fail ~5% with 300–1500 ms latency; RNG is
  injectable for tests). Publication rows are **lazily upserted; a missing
  row means enabled** — entering Í sölu publishes everywhere with zero setup
  and later-registered portals aren't stranded. Pipeline hooks (Í sölu →
  publish, Kaupsamningur → unpublish) ride the M3 post-commit hook slots;
  content edits (fields/media/loans) call `markPublicationsNeedUpdate`.
  Inbound leads from `pull` land as `Contact` rows flagged
  `needsReview` (+`source`), linked as prospective buyers; repeat leads
  append a `ListingNote` instead of duplicating.
- **PDF infrastructure**: `@react-pdf/renderer` is in
  `serverExternalPackages` (next.config.ts) and only ever loaded via the
  dynamic import in `src/lib/pdf/render.ts`, which also registers Noto Sans
  from `public/fonts` **on the same module instance** (CJS/ESM dual copies
  have separate FontStores — the cause of "font not registered" under tsx)
  as base64 data URIs (the resolver misparses `C:\` paths) with hyphenation
  disabled (the default callback mangles Icelandic). PDF documents get no
  React context — all data arrives pre-formatted as plain props. These
  modules deliberately carry no `server-only` marker: the seed (tsx) and
  integration tests (vitest) import them outside Next.
- **Söluyfirlit** (SPEC §9): layout in
  `src/verticals/eignir/soluyfirlit-pdf.tsx` mirrors the legacy-system
  examples (examples/NOTES.md) and is Icelandic-only — a legal document, not
  UI. Versions are append-only rows (`SoluyfirlitVersion`, `version = max+1`,
  key `tenants/{t}/listings/{l}/soluyfirlit/v{n}.pdf`); sends are the
  append-only proof-of-delivery log (`SoluyfirlitSend`, optional
  `receiptSigningRequestId`). Emailed download links use
  `EMAIL_LINK_TTL_SECONDS` (7 days) — `presignDownload` grew a `ttlSeconds`
  param because the default 5-minute TTL is a dead link in an inbox.
  Söluþóknun disclosure is `Listing.soluthoknunText` free text until M5's
  commission schemes supersede it.
- **E-signing** (SPEC §11): `SigningAdapter` port; the mock is **stateless**
  (mints provider ids + links) — domain state lives in `SigningRequest` rows
  and is driven exclusively through `POST /api/webhooks/signing`
  (shared-secret header, `timingSafeEqual`, zod). The webhook resolves the
  request by the **globally unique** `providerRequestId` via `unscopedDb`
  (payloads carry no tenant context) and derives tenantId from the row;
  signers are matched by `providerSignerId`. Status derivation in
  `src/core/signing/status.ts` (any rejection → REJECTED; all signed →
  SIGNED). On SIGNED: a react-pdf signature page
  (`src/lib/pdf/signature-page.tsx`) is merged onto the source with pdf-lib
  (`ignoreEncryption`, falls back to the signature page alone on merge
  failure) and stored back as a `ListingDocument` of type `UNDIRRITAD`.
  Draft contracts (kauptilboð from the accepted-offer snapshot with
  amount-in-words via `src/core/format/isk-words.ts`, kaupsamningur/afsal
  skeletons) are watermarked DRÖG — SPEC §15 forbids invented legal text.
  `/dev/signing` (dev-gated, cross-tenant via unscopedDb — it plays the
  provider) fires the real webhook route from its buttons; integration tests
  import the route's `POST` directly.
- **Wide-screen layout**: the listing detail page is `max-w-[1400px]` with an
  `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` main/sidebar split; list pages
  cap at 1600px/7xl (listings grid gains `2xl:grid-cols-4`).

## Auth & RBAC

- Auth.js v5, credentials provider (bcryptjs), **JWT sessions** (the supported
  strategy for credentials). The token carries `userId`, `tenantId`, `role`,
  `vertical`.
- Config is split: `src/lib/auth.config.ts` is edge-safe (used by
  `src/middleware.ts`); `src/lib/auth.ts` adds the Prisma/bcrypt-dependent
  provider. Rafræn skilríki (electronic ID) later slots in as another provider
  in `auth.ts` without touching the session shape.
- Roles: `SUPERADMIN` (no tenant, `/admin` only — never sees tenant business
  data), `ADMIN`, `AGENT`. Middleware routes each role to its area; **every
  server action additionally calls a guard** from `src/lib/auth-guards.ts`
  (`requireTenantUser`, `requireTenantAdmin`, `requireSuperadmin`) — never rely
  on middleware alone.
- Login is rate-limited (`src/lib/rate-limit.ts`, in-memory fixed-window,
  per-IP and per-email). Single-instance MVP scope; swap for Redis when
  scaling out.
- Logins and failed logins are audit-logged.

## Audit log

Append-only `AuditLog` model. Actions are a **TS union over a string column**
(`src/core/audit/actions.ts`) so new actions don't need a migration. Write via
`logAudit(db, entry)` (`src/core/audit/log.ts`) — pass the scoped client for
tenant events (stamps `tenantId`), `unscopedDb` for platform events
(`tenantId: null`). SUPERADMIN sees platform events only; tenant ADMINs will
get their own tenant-scoped audit view.

## i18n

- next-intl, request config in `src/i18n/request.ts`; locale comes from the
  `handsal-locale` cookie, default `is`. Catalogs: `messages/is.json` + `en.json`
  (kept key-identical).
- **No hardcoded UI strings, ever** — every user-facing string goes through
  next-intl from the first line of a component. Domain/legal Icelandic terms
  (fyrirvari, kauptilboð, söluyfirlit, afsal, …) stay Icelandic in both
  locales, with an English gloss where helpful.
- Icelandic number/date formatting is deterministic and hand-rolled in
  `src/lib/format.ts` (`12.345.678 kr.`, `24.7.2026`, `123,4 m²`) — do not use
  `Intl` for these (ICU output varies by runtime).

## Theming

Design tokens in `src/app/globals.css` (Tailwind v4 `@theme`): deep
charcoal-navy base, warm copper/amber accent. The `[data-vertical]` attribute
(set in `src/app/(app)/layout.tsx` from `tenant.vertical`) switches the accent
(`--vertical-accent`): Eignir = copper, Bílar = steel blue; a tenant
`brandColor` overrides it inline. Use the `vertical` Tailwind color
(`text-vertical`, `bg-vertical/10`, …) for vertical-accented UI.

## Prisma 7 notes

- Generator is `prisma-client` (TypeScript output) → `src/generated/prisma`
  (gitignored; run `npm run db:generate` after pulling schema changes).
- The datasource URL lives in `prisma.config.ts` (not in the schema); the
  runtime client needs a driver adapter: `new PrismaClient({ adapter: new
  PrismaPg({ connectionString }) })` — see `createPrismaClient` in
  `src/lib/db.ts`.
- Seed: `npm run seed` (tsx), idempotent upserts.

## Testing

- `npm run test` — unit project (`src/**/*.test.ts`, `tests/unit/`), no DB.
- `npm run test:integration` — `tests/integration/`, real Postgres; global
  setup creates + migrates `handsal_test` (see `TEST_DATABASE_URL`), suites
  truncate between tests, files run serially.
- Required unit coverage as features land (SPEC §16): kennitala validation,
  commission calculations, offer chain state machine, fyrirvarar stage guard,
  plan limit enforcement — plus tenant isolation in the integration suite.

## Conventions

- Conventional commits.
- Server actions: Zod-parse input → guard (RBAC) → mutate via the correct
  client → `logAudit` → `revalidatePath` → return a small serializable state
  object for `useActionState`.
- Never store binaries in Postgres; object storage via presigned URLs (M2).
- No real external API calls — all integrations are mocks behind core ports.

## Decisions log

Recorded per milestone in `PROGRESS.md`.
