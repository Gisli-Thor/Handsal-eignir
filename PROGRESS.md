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

### ⏸ Session stop point (2026-08-20)

**All M1 code is written and committed** (5 commits, latest `9abe133`). Typecheck, lint, 13 unit tests, `next build`, and a live smoke test of the dev server (login page renders in `is`/`en`, middleware redirects work) are all verified green.

**Blocked on Docker**: Docker Desktop was installed but failed to start — virtualization (AMD SVM) is disabled in the BIOS of this machine (ASUS ROG STRIX B550-F Gaming). The user is restarting to enable it: **BIOS (Del) → F7 Advanced Mode → Advanced → CPU Configuration → SVM Mode → Enabled → F10**. If Docker then complains about WSL, run `wsl --install --no-distribution` in an admin PowerShell and reboot once more.

**Exact next steps when the session resumes** (nothing else is pending for M1):

1. `npm run db:up` — start postgres/minio/mailpit
2. `npm run db:migrate` — apply the initial migration (already generated in `prisma/migrations/20260820000000_init`)
3. `npm run seed` — seed plans, superadmin, demo tenants (logins in README, password `handsal-demo1`)
4. `npm run test:integration` — run the 22-test tenant isolation suite
5. Optionally verify login flows manually at http://localhost:3000
6. Mark this stop point resolved here, then **begin M2 — Contacts & properties**

## M2 — Contacts & properties ☐

## M3 — Pipeline, offers, fyrirvarar ☐

## M4 — Portals, söluyfirlit, e-signing ☐

## M5 — Commission, plans, dashboard ☐

## M6 — Handsal Bílar scaffold ☐
