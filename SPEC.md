# Handsal — Build Specification for Claude Code

You are building **Handsal**, a multi-tenant SaaS platform for Icelandic sales professionals, sold as a monthly subscription to companies. One codebase, one shared core, two branded verticals:

- **Handsal Eignir** — for real estate agencies (fasteignasölur). **Build this vertical to a complete, working MVP.**
- **Handsal Bílar** — for used car dealerships (bílasölur). **Scaffold only** (entities, adapter interfaces, routes, minimal pages) — it will be completed in a later phase.

The name comes from the old Icelandic word *handsal*: sealing a deal with a handshake. The product's job is exactly that — taking a listing from intake to a closed, signed deal.

Read this entire document before writing any code. Follow the milestones in order (§14). Respect the guardrails in §15.

---

## 1. Core architectural principles

1. **One codebase, shared core, vertical modules.** All generic concepts (tenants, users, contacts, listings, media, pipeline, offers, documents, e-signing, portal publishing, commissions, billing plans) live in the core. Vertical-specific fields, pipeline configuration, and portal adapters live in vertical modules. Nothing in the core may import from a vertical module.
2. **Multi-tenant with strict isolation.** A tenant = one company (fasteignasala or bílasala). Every domain row carries `tenantId`. Every query is tenant-scoped through a single data-access layer — never ad-hoc. Write automated tests proving cross-tenant isolation.
3. **All external integrations are mocked behind adapters.** Þjóðskrá, bifreiðaskrá, listing portals, e-signing, email, payments: each is a TypeScript interface with a mock implementation selected via environment config. Real implementations come later when API agreements are signed. **Never call real external APIs.** Mocks must be realistic: deterministic fake data, simulated latency, simulated failures, and a webhook simulator for e-signing.
4. **Bilingual from day one.** All UI strings go through i18n (Icelandic + English, Icelandic default). No hardcoded UI text anywhere. Domain/legal terms (fyrirvari, kauptilboð, söluyfirlit, afsal…) remain Icelandic in both locales, with an English gloss where helpful.
5. **Icelandic locale formatting.** Currency `12.345.678 kr.` (dot thousands separator, no decimals), dates `24.7.2026`, areas `123,4 m²`.

## 2. Tech stack

- **Next.js 15 (App Router) + TypeScript**, single application serving both verticals.
- **PostgreSQL + Prisma.**
- **Tailwind CSS + shadcn/ui.**
- **Auth.js (NextAuth v5)** — email + password (bcrypt/argon2), session-based, RBAC. Design the auth module so rafræn skilríki (electronic ID) can be added later as a provider.
- **next-intl** for i18n (`is` default, `en`).
- **Zod** for all input validation, shared between forms and server actions/API routes.
- **S3-compatible object storage** for photos and documents (MinIO in local Docker; Cloudflare R2 or any S3 in production). Uploads via presigned URLs; downloads via short-lived signed URLs. Never store binaries in Postgres.
- **@react-pdf/renderer** for PDF generation (söluyfirlit, offer documents, contracts).
- **Vitest** for unit/integration tests.
- **Docker Compose** for local dev: `postgres`, `minio`, `mailpit` (SMTP catcher with web UI). Must work on Windows with Docker Desktop; all scripts cross-platform (no bash-only scripts — use Node scripts or provide `.ps1`/`.sh` pairs).
- Deployment target: **cloud-agnostic Docker image** (EU hosting). Provide a production `Dockerfile` and document required env vars in `.env.example`.

### Folder structure

```
src/
  core/            # shared domain: tenants, users, contacts, listings (base),
                   # media, pipeline engine, offers, fyrirvarar, documents,
                   # commissions, plans, activity log, audit log
  verticals/
    eignir/        # property model extensions, pipeline config, söluyfirlit,
                   # portal registrations, UI pages/components
    bilar/         # vehicle model extensions, pipeline config (scaffold)
  adapters/
    registry/      # ÞjóðskráAdapter, BifreiðaskráAdapter (+ mocks)
    portals/       # PortalAdapter + fasteignir.is, mbl.is, fasteignaleitin.is,
                   # bilasolur.is mocks
    signing/       # SigningAdapter + mock
    email/         # EmailAdapter + mock (Mailpit in dev)
    payments/      # PaymentAdapter + stub
  lib/             # db client, auth, i18n, storage, formatting utils
  app/             # Next.js routes
```

Enforce boundaries: core never imports verticals or adapters' concrete implementations (interfaces only, injected via a small service registry configured from env).

## 3. Tenancy, users, roles

- **Tenant**: name, slug, vertical (`EIGNIR` | `BILAR`), logo, brand color, contact info, plan, status.
- **User** (belongs to one tenant): name, email, phone, role, avatar, active flag.
- Roles:
  - `ADMIN` (company admin): manage users, tenant settings, commission schemes, plan/usage view, all listings.
  - `AGENT` (sölumaður/fasteignasali): manage own + shared listings, contacts, offers, documents.
  - `SUPERADMIN` (platform level, no tenant): manage tenants and plans in a separate `/admin` area. Superadmins never see tenant business data beyond usage metrics.
- Vertical branding: after login, the app is themed as **Handsal Eignir** or **Handsal Bílar** based on `tenant.vertical` (logo lockup, accent color, vertical-specific navigation). Shared Handsal identity: clean, Nordic, trustworthy — deep charcoal-navy base, a single warm accent (handshake warmth: amber/copper), generous whitespace, no clutter. Design it properly; this is a commercial product, not an internal tool.

## 4. Contacts (shared CRM-lite)

Contacts are people or companies a tenant deals with — **they never log in**.

- Fields: type (person/company), kennitala (optional but validated with the standard checksum when present), name, email, phone, address, notes, tags.
- **Þjóðskrá lookup**: entering a kennitala offers a lookup via `ÞjóðskráAdapter.lookupPerson(kennitala)` → name + legal domicile, autofilling the contact. Every lookup is written to the **audit log** (who, when, which kennitala, purpose) — this is a compliance requirement of Þjóðskrá access agreements.
- Contact roles are contextual per listing: seller (seljandi), buyer (kaupandi), prospective buyer (áhugasamur kaupandi), co-owner.
- Mock adapter: returns deterministic fake persons for a documented set of test kennitölur; unknown but checksum-valid kennitölur return a generated fake person; invalid checksum → validation error.

## 5. Listings — shared base + property extension

**Listing (core base)**: tenantId, vertical, status/pipeline stage, responsible agent(s), asking price (ásett verð), currency (ISK), created/published/sold timestamps, sellers (contact links), description IS + EN, media, documents, activity log, portal publications, commission scheme override.

**Property (Handsal Eignir extension)** — the full field set:

- Identifiers: **fastanúmer** (and optional landeignarnúmer).
- Address: götuheiti, húsnúmer, íbúð/merking, póstnúmer, sveitarfélag (use a seeded lookup table of Icelandic postal codes + municipalities).
- Tegund eignar: fjölbýli, einbýli, raðhús, parhús, hæð/sérhæð, atvinnuhúsnæði, sumarhús, lóð, annað.
- Stærðir: **birt stærð** (m², one decimal), **þar af geymsla** (m²).
- Rooms: herbergi, svefnherbergi, baðherbergi.
- Building: hæð (floor), lyfta (bool), bílskúr/bílastæði (enum + count), byggingarár.
- Valuations: **fasteignamat**, **brunabótamat** (ISK).
- **Áhvílandi lán** (list): lender, remaining balance, verðtryggt/óverðtryggt, interest rate, yfirtakanlegt (assumable) flag.
- Notes/condition remarks.

**Media**: ordered photo gallery with drag-to-reorder, cover image selection, categories `PHOTO` / `FLOOR_PLAN` / `DOCUMENT_SCAN`. Server-side thumbnail + web-size derivatives on upload. Documents (PDF etc.): eignaskiptayfirlýsing, skilalýsing, veðbandayfirlit, and free-form uploads, each typed and dated.

**Activity per listing**: viewings (skoðun) and opið hús events with attendees (contacts), free-form notes, and tasks with due dates and assignee. Everything feeds a unified timeline on the listing detail page.

**Vehicle (Handsal Bílar extension — scaffold only)**: fastanúmer/plate (skráningarnúmer), VIN, make, model, year (árgerð), mileage (akstur), fuel type, transmission, color, næsta skoðun date, number of owners, áhvílandi lán (same structure). `BifreiðaskráAdapter.lookupVehicle(plateOrVin)` mock autofills these. Scaffold the model, adapter interface + mock, list/detail routes with minimal UI, and the simplified pipeline config — nothing more.

## 6. Sales pipeline

Pipeline stages are **configuration data per vertical**, driven by a small core pipeline engine (stage transitions, guards, side-effects/hooks, full stage history with timestamps and actor).

**Handsal Eignir stages:**

1. **Undirbúningur** (intake, gathering documents/photos)
2. **Í sölu** (published)
3. **Tilboð móttekið**
4. **Tilboð samþykkt**
5. **Kaupsamningur**
6. **Afhending**
7. **Afsal / Lokið**
- Terminal side-state from any stage: **Fallið frá** (withdrawn/cancelled), with reason.

Stage side-effects (via hooks): entering *Í sölu* → auto-publish to the listing's enabled portals (§8); entering *Kaupsamningur* → auto-unpublish from all portals; entering *Afsal / Lokið* → finalize commission record (§10).

**Handsal Bílar (scaffold config):** Undirbúningur → Í sölu → Tilboð → Kaupsamningur/Afsal → Afhent/Lokið, + Fallið frá.

## 7. Offers (tilboð), counter-offers, and fyrirvarar

**Offer**: listing, buyer contact(s), amount, proposed afhending date, greiðslutilhögun (payment schedule as line items: description, amount, due date — must sum to offer amount, validated), **gildistími** (expiry timestamp), free-text terms, status: `PENDING / ACCEPTED / REJECTED / COUNTERED / EXPIRED / WITHDRAWN`.

- **Gagntilboð (counter-offers)** form a chain: each counter references its parent; the UI shows the full negotiation thread on one screen. Accepting any offer in the chain closes the others.
- Expiry: a scheduled check (simple interval job in-process is fine for MVP) marks offers `EXPIRED` when gildistími passes; expiring-soon offers surface on the dashboard.
- Accepting an offer moves the listing to **Tilboð samþykkt** and snapshots the accepted terms (immutable copy).

**Fyrirvarar (conditions on an accepted offer)** — this is a first-class feature, not a note field:

- Each fyrirvari: type (`FJÁRMÖGNUN` — financing, `SALA EIGIN EIGNAR` — sale of buyer's own property, `ÁSTANDSSKOÐUN` — inspection, `SAMÞYKKI STJÓRNAR` — board approval, `ANNAÐ` — other/free text), description, **deadline**, responsible party (buyer/seller side), status: `PENDING / FULFILLED / WAIVED / FAILED`, resolved-by + timestamp.
- The **Tilboð samþykkt stage view** must show a clear fyrirvarar panel: each condition with a deadline countdown, color-coded (green fulfilled, amber < 7 days, red overdue).
- The tenant dashboard aggregates all pending fyrirvarar across listings, sorted by deadline. Email reminders (via EmailAdapter) to the responsible agent at 7 days, 2 days, and on the deadline.
- Advancing to **Kaupsamningur** is guarded: all fyrirvarar must be `FULFILLED` or `WAIVED` (an ADMIN can override with a logged reason).
- A `FAILED` fyrirvari prompts the agent to either fall back the listing to *Í sölu* or mark it *Fallið frá*.

## 8. Portal publishing (fasteignir.is, mbl.is/fasteignir, fasteignaleitin.is, bilasolur.is)

One `PortalAdapter` interface: `publish(listing)`, `update(listing)`, `unpublish(listing)`, `pull(listing)` (fetch current remote state/leads), `status(listing)`. Register per-vertical implementations:

- Eignir: `fasteignir.is`, `mbl.is/fasteignir`, `fasteignaleitin.is` (mocks).
- Bílar: `bilasolur.is` (mock, scaffold).

Behavior:

- Per listing, per portal: an enable toggle and a `PortalPublication` record — status (`NOT_PUBLISHED / PUBLISHED / NEEDS_UPDATE / UNPUBLISHED / ERROR`), remote id, last synced at, last error, full sync log.
- **Automatic:** publish to all enabled portals on entering *Í sölu*; unpublish from all on entering *Kaupsamningur*.
- **Manual, on demand:** per-portal and all-portals buttons for re-push (publish/update) and pull, available at any stage.
- Editing a published listing flips its publications to `NEEDS_UPDATE` (show a "sync now" prompt).
- Mock adapters simulate 300–1500 ms latency, ~5% transient failures (with retry), and generate occasional fake inbound leads on `pull` (name/email/phone/message) that land as prospective-buyer contacts linked to the listing, flagged for review.

## 9. Söluyfirlit — generation and distribution

The söluyfirlit is the legally required property summary an agent must provide to a prospective buyer.

- **Generate** a PDF from the property record: property identification and address, tegund, stærðir (birt stærð / þar af geymsla), byggingarár, herbergi, fasteignamat, brunabótamat, áhvílandi veðskuldir, ásett verð, söluþóknun disclosure, agent + agency info, description, cover photo, floor plan if present. Branded with the **tenant's** logo and colors (not Handsal's). Versioned: regenerating creates v2, v3… with timestamps; old versions remain downloadable.
- **Send** to one or more prospective-buyer contacts via EmailAdapter: templated bilingual email with the PDF attached (and a signed download link). Log every send: recipient contact, version sent, sender, timestamp.
- The listing detail page shows a söluyfirlit panel: current version, generate/regenerate, send, and full send history — so the agent can always prove who received what, when.
- Optional per send: request confirmation of receipt via the SigningAdapter (simple acknowledgment signature).

## 10. Söluþóknun (commission)

- **Commission scheme** configurable per tenant with per-listing override: `FIXED_PERCENT` (x% of sale price), `TIERED` (percentage brackets by price), or `FLAT_PLUS_PERCENT`; plus fixed line items (e.g. gagnaöflun, umsýslugjald); VSK handling (24%, prices shown with/without VSK); **agent split** (percentage split when multiple agents share a listing).
- On *Afsal / Lokið*, compute and freeze a **CommissionRecord**: sale price, scheme applied, gross commission, VSK, per-agent amounts.
- **Reports** (ADMIN): earned commission per period and per agent, plus a pipeline forecast (expected commission of listings in stages 3–6 based on ásett verð / accepted offer). Table + simple chart, exportable as CSV.

## 11. E-signing (rafræn undirritun)

Provider-agnostic `SigningAdapter` modeled on the common Icelandic providers' pattern (Taktikal / Signet / Dokobit):

- `createSigningRequest(document, signers[]) → { requestId, signerLinks[] }`, `getStatus(requestId)`, `cancel(requestId)`, plus a webhook endpoint for status callbacks.
- Signers identified by kennitala + name + email/phone. Statuses: `DRAFT / SENT / PARTIALLY_SIGNED / SIGNED / REJECTED / EXPIRED / CANCELLED`.
- Usable from: an accepted **offer** (kauptilboð document), **kaupsamningur**, **afsal**, and any uploaded PDF on a listing. Generate offer/contract PDFs from templates pre-filled with listing + parties data (keep templates simple and clearly marked as drafts — real legal templates come from the customer).
- The **mock**: creates fake signer links, and includes a dev-only simulator page (`/dev/signing`) listing open requests with per-signer "sign" / "reject" buttons that fire the webhook — so the whole flow is demonstrable end-to-end.
- Signed documents (mock stamps a signature page) are stored back on the listing with full status history.

## 12. Plans and billing (limits only — no payment processing)

- Plans tiered by **active listing count** (active = stages *Í sölu* through *Afhending*): e.g. **Byrjun** (10 active listings), **Vöxtur** (50), **Atvinnumaður** (unlimited) — monthly price per company stored on the plan.
- **Enforcement**: moving a listing into *Í sölu* beyond the plan limit is blocked with a clear upgrade prompt; usage meter (n / limit) visible to ADMINs; warning email at 90% usage.
- `PaymentAdapter` is a stub interface only (future Stripe/rapyd). SUPERADMIN assigns plans manually in `/admin`. No checkout, no invoicing in MVP.

## 13. Cross-cutting requirements

- **Audit log** (append-only): all registry lookups (§4), fyrirvarar overrides, stage transitions, plan changes, document sends, signing events, logins. Viewable by ADMIN (own tenant) and SUPERADMIN (platform events only).
- **GDPR**: per-tenant data export (JSON + files manifest); contact anonymization (right to erasure) that preserves transactional integrity; document retention notes in README.
- **Security**: tenant isolation enforced in the data-access layer + tests; RBAC checks server-side on every mutation; rate limiting on auth; signed URLs for all file access; secrets only via env.
- **Seed script**: demo tenant "Demo fasteignasala" with 2 users (admin + agent), ~12 properties spread realistically across all pipeline stages, offers with a counter-offer chain, an accepted offer with mixed-status fyrirvarar, portal publications in various states, söluyfirlit history, and a completed sale with a commission record — so every screen demos well immediately. Also seed one Bílar tenant with 2 scaffolded vehicles.
- **Dashboard (per tenant)**: pipeline overview (counts + value per stage), pending fyrirvarar by deadline, offers expiring soon, upcoming viewings/opið hús, open tasks, recent portal sync errors.

## 14. Milestones — implement strictly in order

After each milestone: run typecheck, lint, and tests; update `PROGRESS.md` with what was completed and any open questions; commit with conventional commits.

- **M1 — Foundation.** Repo, Docker Compose (postgres/minio/mailpit), Prisma schema for core, Auth.js with roles, tenancy + isolation layer + isolation tests, i18n scaffolding, base layout with vertical theming, `/admin` superadmin area (tenants + plans CRUD), seed script skeleton.
- **M2 — Contacts & properties.** Contact CRUD + kennitala validation + ÞjóðskráAdapter mock + audit logging; Property model + full CRUD forms; media upload pipeline (presigned uploads, derivatives, ordering, cover, categories); documents; postal code/municipality seed data.
- **M3 — Pipeline, offers, fyrirvarar.** Pipeline engine + Eignir config; listing detail with stage timeline; offers with counter-chains, greiðslutilhögun validation, expiry job; fyrirvarar model, stage guard, deadline dashboard + email reminders; viewings/opið hús, notes, tasks.
- **M4 — Portals, söluyfirlit, e-signing.** PortalAdapter + three Eignir mocks, publication lifecycle (auto + manual push/pull), sync log, inbound mock leads; söluyfirlit PDF generation, versioning, email distribution + send log; SigningAdapter mock + dev simulator + document flows.
- **M5 — Commission, plans, dashboard.** Commission schemes, records, reports + CSV export; plan limits + enforcement + usage meter; full tenant dashboard; polish pass on i18n (complete `is`/`en` message catalogs) and empty/error/loading states.
- **M6 — Handsal Bílar scaffold.** Vehicle model, BifreiðaskráAdapter + bilasolur.is adapter interfaces with mocks, Bílar pipeline config, minimal list/detail pages, Bílar theming, seed data. **Do not build beyond scaffold.**

## 15. Guardrails — do NOT build

- No real external API calls of any kind.
- No buyer/seller login portals — contacts never authenticate.
- No payment processing, checkout, or invoicing.
- No native mobile apps (the web UI must be fully responsive — agents will use phones for photos and on-site updates).
- No completion of the Bílar vertical beyond the M6 scaffold.
- Do not invent real legal contract text — templates are clearly-labeled drafts.

## 16. Working instructions

- Work milestone by milestone; do not skip ahead. If a requirement is ambiguous, choose the simplest interpretation consistent with this spec and record the decision in `PROGRESS.md`.
- Keep `README.md` current: setup on Windows (Docker Desktop, Node 20+), env vars, seed login credentials, and how to demo each major flow including the e-signing simulator.
- Keep `ARCHITECTURE.md` that keeps all the techincal information for a new coder approaching the project.
- Every user-facing string through next-intl from the first line of UI code — retrofitting i18n is not acceptable.
- Prefer server components + server actions; keep client components lean.
- Write unit tests as you go for: kennitala validation, commission calculations (all scheme types + VSK + splits), offer chain state machine, fyrirvarar stage guard, plan limit enforcement, and tenant isolation.
- Always keep an up-to-date git repository
