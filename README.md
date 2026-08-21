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
- **Contacts + Þjóðskrá lookup (M2)** — as `anna@demo.is`, open *Tengiliðir* → *Nýr tengiliður*, enter a kennitala and press *Fletta upp*. Test kennitölur (mock adapter): `010130-2989` (Gervimaður Ameríka), `010130-2399` (Útlönd), `010130-3019` (Afríka), `410130-2979` (Gervifélag ehf., autoselects company), `010130-5069` (always fails — simulated outage). Any other checksum-valid kennitala returns a deterministic generated person; invalid checksums are rejected. Every lookup lands in the audit log with purpose and result.
- **Properties & media (M2)** — *Eignir* lists 12 seeded properties across all pipeline stages. Open one: property facts, photo gallery (upload JPG/PNG/WebP → server-side web+thumb derivatives, drag to reorder, star = cover, per-photo category), typed & dated documents (PDF/images, signed download links), sellers/prospects linked from contacts, responsible agents, and áhvílandi lán. RBAC: `jon@demo.is` (AGENT) can only edit listings he is assigned to; `anna@demo.is` (ADMIN) edits all.
- **Pipeline (M3)** — every listing detail page has a *Sölupípa* stepper: click any stage to move the listing (all transitions are recorded with actor + timestamp in the *Atburðasaga* timeline at the bottom). *Fallið frá* requires a reason; reactivating goes back to *Undirbúningur*. Moving **Langholtsvegur 130** to *Kaupsamningur* demonstrates the fyrirvarar guard: blocked for agents, ADMINs get an override dialog whose reason lands in the audit log.
- **Offers & counter-offers (M3)** — *Tilboð* in the nav lists all offers; **Grettisgata 17** has a live negotiation (kauptilboð → gagntilboð expiring within 48h — flagged on the dashboard), **Langholtsvegur 130** a 3-deep chain ending in an accepted offer with an immutable terms snapshot. *Skrá tilboð* on a listing: multiple buyers with ownership shares, gildistími (date + time), and a greiðslutilhögun editor that validates line items sum exactly to the offer amount. Accepting an offer closes competing offers and moves the listing to *Tilboð samþykkt*. Offers past their gildistími are auto-expired by an in-process job (runs every 60s).
- **Fyrirvarar (M3)** — on **Langholtsvegur 130**: mixed-status conditions with color-coded deadline countdowns (green fulfilled/waived, amber < 7 days, red overdue/failed). Resolve buttons record who and when; a FAILED fyrirvari offers the fallback prompt (back to *Í sölu* or *Fallið frá*). The dashboard aggregates all pending fyrirvarar by deadline, and the reminder job emails the primary agent at 7 days / 2 days / on the deadline — watch the emails arrive in Mailpit (http://localhost:8025).
- **Activity (M3)** — viewings/opið hús with contact attendees, notes, and tasks (due date + assignee) per listing; everything merges into the listing's unified timeline and feeds the dashboard panels.
- **Portal publishing (M4)** — every listing has a *Birting á vefgáttum* panel: per-portal enable toggles, status badges, push/pull buttons and a sync log. Entering *Í sölu* auto-publishes to all enabled portals; entering *Kaupsamningur* auto-unpublishes. Editing a published listing (fields, photos, loans) flips it to *Þarf samstillingu* with a "sync now" prompt. The mock portals simulate real latency and ~5% transient failures (retried once; repeated failure shows as ERROR with the message). *Pull* occasionally returns fake inbound leads that land in *Tengiliðir* flagged **Til yfirferðar** and linked to the listing as prospective buyers — the seed includes two.
- **Söluyfirlit (M4)** — on a listing, *Söluyfirlit* → *Útbúa söluyfirlit* renders a tenant-branded PDF (cover photo, Þjóðskrá table, loans, söluþóknun disclosure per 11. gr. laga nr. 70/2015; floor plan page if present). Regenerating creates v2, v3… with all versions downloadable. Send it to prospective buyers: bilingual email with the PDF attached + a 7-day signed link (see it in Mailpit, http://localhost:8025), every send logged (who, which version, when) — optionally with a receipt-confirmation e-signature request.
- **E-signing simulator (M4)** — on a listing, *Rafræn undirritun* → choose a source (kauptilboð generated from the accepted offer, kaupsamningur/afsal drafts — all watermarked DRÖG — or any uploaded PDF), pick signers (kennitala required) and send. Then open **`/dev/signing`** (dev only): it plays the signing provider, listing open requests with per-signer **Sign**/**Reject** buttons that POST the real webhook (`/api/webhooks/signing`). When everyone signs, the request turns SIGNED, a signature page is stamped onto the PDF, and it appears under the listing's documents as *Undirritað*. Try it on **Hafnargata 28** — the seed leaves a kaupsamningur half-signed.
- *(M5+)* Commissions, plan limits, reports and the full dashboard — added milestone by milestone; this section grows with each.

## Production

`Dockerfile` builds a cloud-agnostic standalone image (EU hosting). Run database migrations at deploy time with `npx prisma migrate deploy`. All required env vars are listed in `.env.example`.

## GDPR & data retention (placeholder)

Per-tenant data export, contact anonymization (right to erasure) and document retention notes are implemented/documented from M2 onward as the relevant data models land. The audit log is append-only by design.
