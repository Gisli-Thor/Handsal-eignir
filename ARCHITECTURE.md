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
