# Phase Preparation — Decisions, Defaults, and TODOs

> **Created:** 2026-05-27 · **Owner:** Engineering
> **Purpose:** Track every "decision needed" item across Phase 1–7. Each row has a chosen default (so implementation isn't blocked) plus a TODO marker for future revisit.
>
> **Operating mode (decided 2026-05-27):** Local-first implementation. No deployment / staging / production cutover until Phase 7+ completion. All real provider integrations (eSMS, Resend, Viettel SInvoice) remain mocked — the factory pattern is already in place.

---

## Status legend

- 🟢 **Decided + applied** — default chosen, code reflects it
- 🟡 **Default applied — TODO revisit** — proceeding with reasonable default; need to confirm before production
- 🔴 **BLOCKED** — needs external input before proceeding
- ⚪ **Deferred** — not relevant for local-first scope

---

## A. Infrastructure & Hosting

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Production hosting | (Source repo) vhost.vn target / (Portfolio) Vercel+Supabase | ⚪ Deferred | Local-first; deployment deferred per 2026-05-27 user decision |
| Local Postgres | **Existing Homebrew Postgres 18.3** on `/tmp:5432`, db `jakes_home_appliances_soms` (already created), user `jake` (socket auth) | 🟢 | Connection: `postgresql://jake@localhost:5432/jakes_home_appliances_soms` |
| Local object storage | **Local filesystem** under `./uploads/` (already in .gitignore) | 🟢 | TODO: swap to Supabase Storage on prod cutover |
| Environment file | `.env` (gitignored) with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `REFRESH_SECRET`, `SMS_PROVIDER=mock`, `EMAIL_PROVIDER=mock` | 🟢 | `.env.example` committed as reference |
| Domain `jakeshomeappliances.com.vn` | **NOT purchased yet** — local uses `http://localhost:3000` | 🟡 | TODO: purchase before any client demo |
| `portal.jakeshomeappliances.com.vn` subdomain | Local uses `http://localhost:3000/portal` path (no subdomain split in local) | 🟡 | TODO: DNS + middleware host routing on prod cutover |
| Email DKIM/SPF/DMARC | n/a (mock provider) | ⚪ Deferred | TODO: set up before prod email cutover |

## B. Authentication

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| JWT signing | `jose` HS256, `JWT_SECRET` (64-byte hex), `aud` claim split (`staff` vs `customer`) | 🟢 | Generated via `openssl rand -hex 64` at setup |
| Access token TTL | **15 minutes** | 🟢 | Per SPEC §2 |
| Refresh token TTL | **7 days** (staff), **30 days** (customer) | 🟢 | Customer longer for portal UX (F.5 keep sessions) |
| Password hashing | **bcrypt cost 12** | 🟢 | Standard |
| Lockout policy | **5 fails / 15 min** | 🟢 | F.6 confirmed |
| Customer password generation | **10 chars alphanumeric**, sent via SMS only | 🟢 | Mock provider logs to console |
| Cookie config | `httpOnly`, `secure` (in prod), `sameSite=lax`, `Path=/` | 🟢 | `Path=/` so middleware can read refresh token on all routes |

## C. Database & ORM

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| ORM | **Prisma v7** + `@prisma/adapter-pg` + `pg.Pool` | 🟢 | Supabase-compatible pattern |
| Migration tool | **Prisma Migrate** (`prisma migrate dev` for local, `prisma migrate deploy` for prod) | 🟢 | |
| Migration approach | **Forward-only**, no destructive drops in prod migrations | 🟢 | |
| Schema location | `prisma/schema.prisma` | 🟢 | Generated client at `src/generated/prisma` (gitignored) |
| Seed strategy | `prisma/seed.ts` with 3 sample customers (1 B2C, 2 B2B with multi-site) + 5 sample staff | 🟢 | TODO: when A.5 filter data arrives, expand seed for Phase 5 |
| Legacy data migration | tsx script reading CSV from `reference/data/` | 🟡 | TODO: actual migration runs at prod cutover; dev/staging uses seed data |
| DB connection check | `scripts/check-db-connection.ts` with `SKIP_DB_CHECK=1` bypass | 🟢 | |

## D. UI Framework

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Framework | **Next.js 16 App Router** + React 19 | 🟢 | |
| Styling | **Tailwind CSS v4** | 🟢 | |
| Components | **Custom-built** (no shadcn, no native dialogs) | 🟢 | CLAUDE.md UI Rule |
| Icons | **lucide-react** (already in package.json) | 🟢 | |
| Forms | **react-hook-form** + **zod** resolvers | 🟢 | |
| Number inputs | Shared `<NumberInput>` (from PMIS) — TODO port | 🟡 | TODO: copy from `~/Works/MegaDnC/mega_dnc_pmis/src/components/ui/number-input.tsx` |
| Date picker | **react-day-picker** + custom shell | 🟢 | |
| Tables | Custom component (not TanStack Table for v1) | 🟢 | |
| Dropdowns | Custom (with search when options > 5 per CLAUDE.md) | 🟢 | |

## E. i18n

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Library | **next-intl** | 🟢 | Locales `ko`, `vi`, `en` |
| URL pattern | `/{locale}/...` | 🟢 | |
| Date format | KR/EN → ISO `YYYY-MM-DD`; VI → `DD/MM/YYYY` | 🟢 | Confirmed 2026-05-26 |
| Currency | VND with locale formatting (`1.500.000 ₫`) | 🟢 | D.4 |
| Fallback locale | `en` | 🟢 | |
| Message catalogs | `src/messages/{ko,vi,en}.json` | 🟢 | |

## F. State & Data Fetching

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Server state | **TanStack Query v5** | 🟢 | |
| Client state | **React Context** for auth + UI shell; no redux | 🟢 | |
| API response envelope | `{ success, data?, error?, pagination? }` | 🟢 | SPEC convention |
| Validation | **zod** schemas under `src/lib/validators/`, shared frontend ↔ API | 🟢 | |

## G. PDF Rendering & Documents

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Library | **@react-pdf/renderer** — server-side React PDF | 🟡 | TODO: install + verify Vercel/server Function compatibility on prod cutover |
| Fonts (KR) | **Pretendard** (`public/fonts/`) | 🟡 | TODO: download .ttf and embed |
| Fonts (VI) | **Be Vietnam Pro** | 🟡 | TODO: download .ttf |
| Fonts (EN) | **Inter** | 🟡 | TODO: download .ttf |
| Templates | One TSX component per document type under `src/lib/pdf/templates/` | 🟢 | |
| Storage path | `./uploads/{customer}/{contractNumber}.pdf` | 🟢 | |
| Retention | 10y for contracts/tax invoices, 5y for receipts/work confs (E.4) | 🟢 | |

## H. Notifications

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| SMS provider | `SMS_PROVIDER=mock` → `src/lib/sms/mock-client.ts` (console.log + DB log) | 🟢 | TODO: eSMS Brandname registration before prod |
| Email provider | `EMAIL_PROVIDER=mock` → `src/lib/email/mock-provider.ts` | 🟢 | TODO: Resend account + domain DKIM/SPF/DMARC before prod |
| Channel routing | `src/lib/notifications/router.ts` — SMS for urgent, Email for non-urgent, Hybrid for credentials | 🟢 | Matrix in DOCUMENT_TEMPLATES.md §C |
| Template structure | Per-template TSX (email) or string template (SMS), keyed by template code, with locale variants | 🟢 | |
| Opt-out flags | `CustomerContact.smsOptOut` / `emailOptOut`; system messages ignore opt-out | 🟢 | F.3 confirmed |
| eSMS Brandname | `JakeApp` (7 chars) | 🟢 | Application form in `docs/SMS_BRANDNAME_APPLICATION.md`; TODO submit to eSMS |

## I. Mobile / PWA

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| PWA strategy | **Hand-rolled `public/sw.js`** (Phase 7) — manifest + minimal service worker (no next-pwa dependency for local-first scope) | 🟢 | Phase 7 shipped 2026-05-27 |
| Service worker scope | Technician routes (`/[locale]/mobile/*`) only for v1 (portal SW deferred) | 🟢 | Phase 7 |
| Offline queue | **Dexie.js** IndexedDB queue + `flush()` with retry-with-backoff | 🟢 | Phase 7 shipped 2026-05-27 — `src/lib/offline/` |
| PWA icons | 192/512 PNG generated from logo JPG via `sharp` | 🟢 | Phase 7 |
| Photo upload | Client-side compression (1080p max) before upload | 🟢 | Use `browser-image-compression` (Phase 4 install) |
| Target devices | Android 8+, iOS 14+, 5–6" portrait, 8MP+ camera (K.1) | 🟢 | |

## J. Observability

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Error tracking | **Sentry (`@sentry/nextjs`)** with sourcemaps | 🟡 | TODO: install Phase 1 end + free tier setup before prod |
| Logging | `console.*` with structured tags; production swap to Sentry breadcrumbs | 🟢 | |
| Audit log | Custom `AuditLog` table — every state-mutating action | 🟢 | 24 month retention (H.2) |
| Uptime | n/a (local-first) | ⚪ Deferred | TODO: Uptime Robot free tier on prod cutover |
| Performance | Vercel Speed Insights | ⚪ Deferred | TODO: enable on prod |

## K. Testing

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Unit/component | **Vitest** (node + jsdom projects) | 🟢 | Already in package.json |
| E2E | **Playwright** | 🟢 | Already in package.json |
| Coverage minimum | **80% statements/branches/functions/lines** (CLAUDE.md TDD rule) | 🟢 | |
| Test data factory | tsx helpers under `__tests__/factories/` | 🟡 | TODO: build during Phase 1 |
| Mock providers | Default in tests (no env override needed) | 🟢 | |

## L. CI/CD

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| CI runner | **GitHub Actions** (`.github/workflows/`) | 🟢 | |
| PR checks | Type check + lint + Vitest + (optional) Playwright | 🟡 | TODO: add `.github/workflows/ci.yml` for source repo |
| Branch protection | `main` push prohibited, PR required, 1 approval, CI green | 🟡 | TODO: enable in GitHub repo settings |
| Portfolio sync | `.github/workflows/portfolio-sync.yml` (already active) | 🟢 | |

## M. Scheduling / Cron

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Cron runtime | **Vercel Cron** (config in `vercel.ts`) on prod | ⚪ Deferred | Local: run via `npm run cron:dev` script (tsx + node-cron) |
| Daily jobs | `09:00 VST` — overdue escalation; `03:00 VST` — backup trigger | 🟢 | Phase 6 |
| Job idempotency | Each job records a `lastRunAt` to skip same-day re-runs | 🟢 | |

## N. Charts / Reports (Phase 6+)

| Item | Default | Status | Notes / TODO |
|---|---|---|---|
| Charting | **Recharts** (lightweight, Tailwind-friendly) | 🟢 | Phase 7 shipped 2026-05-27 — bar / line / pie used across `/reports/*` |
| Date math | **date-fns** (already in package.json) | 🟢 | |
| CSV export | `src/lib/csv.ts` — simple stringify with BOM for Excel | 🟢 | |

## O. Open client questions

| ID | Question | Default applied | Status |
|---|---|---|---|
| A.5 | Filter ↔ equipment-model compatibility CSV | Seed data uses 3 generic models with placeholder filter sets | 🔴 BLOCKED — client delivery overdue (was 2026-05-29 evening). TODO follow up. |
| (none other) | All Phase 0 Q's resolved per QUESTIONS.md | — | 🟢 |

---

## TODO summary — pre-production checklist

When local implementation reaches Phase 7 completion, this list must be cleared before any deployment:

1. **eSMS.vn Brandname registration** — submit application, await 2-3 week approval
2. **Resend account** + `jakeshomeappliances.com.vn` domain verification + DKIM/SPF/DMARC
3. **Domain purchase** `jakeshomeappliances.com.vn` + DNS A/CNAME records
4. **Supabase production project** + connection strings
5. **Vercel project** (source + portfolio) + env vars + preview deploys
6. **Object storage** swap from local FS to Supabase Storage
7. **A.5 filter compatibility data** ingestion + Phase 5 SR pricing rules
8. **Real legacy data migration** (~9000 customers per J.1)
9. **Pretendard / Be Vietnam Pro / Inter fonts** downloaded + embedded in PDF builds
10. **Sentry account** + DSN injection in Vercel env
11. **Branch protection rules** on `main` (currently can push directly)
12. **CI workflow** for source repo (build + test gates on PR)
13. **Backup verification** — run a Supabase restore drill before launch
14. **DNS propagation** for `portal.jakeshomeappliances.com.vn` subdomain + middleware host-routing
15. **Viettel SInvoice** account (Phase 8+ — not needed for v1 launch but plan ahead)
16. **Tablet e-signature hardware** decision (Phase 8+ TODO)
17. **Zalo OA + Zalo Mini App** scoping (Phase 8+ TODO, F.1)

---

> **Update protocol:** when any 🟡 item gets confirmed (default validated) or replaced (different choice made), update the row + flip to 🟢 with a note. When a 🔴 unblocks, flip to 🟢 or 🟡 with the resolved value.
