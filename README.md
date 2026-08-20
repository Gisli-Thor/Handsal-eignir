# Handsal

Multi-tenant SaaS for Icelandic sales professionals — one shared core, two branded verticals:

- **Handsal Eignir** — real estate agencies (fasteignasölur)
- **Handsal Bílar** — used car dealerships (bílasölur, scaffold)

*Handsal*: sealing a deal with a handshake. The product takes a listing from intake to a closed, signed deal.

See `SPEC.md` for the full product specification, `ARCHITECTURE.md` for the technical overview, and `PROGRESS.md` for milestone status.

## Setup (Windows)

Prerequisites:

- **Node 20+** (`node --version`)
- **Docker Desktop** (for Postgres, MinIO and Mailpit)

```powershell
# 1. Install dependencies
npm install

# 2. Environment
copy .env.example .env
# then set AUTH_SECRET to a random value:  npx auth secret

# 3. Start infrastructure (Postgres :5432, MinIO :9000/:9001, Mailpit :1025/:8025)
npm run db:up

# 4. Apply migrations and generate the Prisma client
npm run db:migrate

# 5. Seed demo data
npm run seed

# 6. Run
npm run dev
```

The same commands work on macOS/Linux (`cp` instead of `copy`).

### Web UIs

| Service        | URL                    |
| -------------- | ---------------------- |
| App            | http://localhost:3000  |
| Mailpit (mail) | http://localhost:8025  |
| MinIO console  | http://localhost:9001  |

## Demo logins

Password for all seeded users: **`handsal-demo1`**

| Role       | Email                  | Tenant                       |
| ---------- | ---------------------- | ---------------------------- |
| SUPERADMIN | superadmin@handsal.is  | — (platform `/admin`)        |
| ADMIN      | anna@demo.is           | Demo fasteignasala (Eignir)  |
| AGENT      | jon@demo.is            | Demo fasteignasala (Eignir)  |
| ADMIN      | bjarni@bilar.is        | Demo bílasala (Bílar)        |

## Scripts

| Command                    | What it does                                    |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Dev server (Turbopack)                          |
| `npm run build` / `start`  | Production build / serve                        |
| `npm run typecheck`        | `tsc --noEmit`                                  |
| `npm run lint`             | ESLint (includes core-boundary import rules)    |
| `npm run test`             | Unit tests (no database needed)                 |
| `npm run test:integration` | Integration tests — needs Postgres running; creates and migrates `handsal_test` automatically |
| `npm run db:up` / `db:down`| Start / stop Docker services                    |
| `npm run db:migrate`       | `prisma migrate dev`                            |
| `npm run db:studio`        | Prisma Studio                                   |
| `npm run seed`             | Seed demo data (idempotent)                     |

## Environment variables

Documented inline in `.env.example`. Secrets are only ever provided via env — never committed.

## Demo flows

- **Sign in / theming** — log in as `anna@demo.is` (Eignir theme, copper accent) vs `bjarni@bilar.is` (Bílar theme, steel-blue accent). Language switch (Íslenska/English) is in the avatar menu, top right.
- **Platform admin** — log in as `superadmin@handsal.is`: manage tenants and plans under `/admin`, create a tenant, assign a plan, create its first ADMIN user, and inspect the platform audit log.
- *(M2+)* Contacts with Þjóðskrá lookup, properties and media, pipeline, offers/fyrirvarar, portal publishing, söluyfirlit, e-signing simulator (`/dev/signing`), commissions and dashboard — added milestone by milestone; this section grows with each.

## Production

`Dockerfile` builds a cloud-agnostic standalone image (EU hosting). Run database migrations at deploy time with `npx prisma migrate deploy`. All required env vars are listed in `.env.example`.

## GDPR & data retention (placeholder)

Per-tenant data export, contact anonymization (right to erasure) and document retention notes are implemented/documented from M2 onward as the relevant data models land. The audit log is append-only by design.
