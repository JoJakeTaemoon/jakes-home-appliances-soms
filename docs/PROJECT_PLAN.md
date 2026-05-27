# PROJECT PLAN — Seoul Aqua SOMS

**Version:** v0.1 (Bootstrap, 2026-05-25)

> Read `docs/SPEC.md` first. This file lays out **how we get there** in phases.

---

## Guiding principles

- **Ship something usable every phase.** Each phase replaces a specific spreadsheet the client uses today. The client should be able to *stop using one spreadsheet* per phase ship.
- **Mobile-first for technician screens; desktop-first for office screens.** Don't fall back to "responsive" — make a real decision per feature.
- **No domain code without a passing test.** TDD pipeline from `.claude/CLAUDE.md` enforces this.
- **No phase locks unanswered questions.** If a phase depends on a `QUESTIONS.docx` item, that item's deadline lands before the phase starts.
- **One Vercel deploy per phase ship.** No silent partial features in production.

---

## Phase 0 — Bootstrap (THIS SESSION, 2026-05-25)

**Goal:** the project exists; framework copied; design system defined; client documents archived; spec written; questions itemized.

**Deliverables (already done by the bootstrap pass):**

- `/Users/jake/Works/SeoulAqua/seoul-aqua-soms/` directory tree
- 9 reference files in `reference/process/` + `reference/forms/` + `reference/data/` + `reference/brand/`
- Framework files copied from MegaDnC PMIS (Sections §A + §B of plan)
- `.claude/CLAUDE.md`, `AGENTS.md`, `README.md`, `package.json`, `settings.json` — Seoul-Aqua-rebranded
- `src/messages/{ko,en,vi}.json` — domain keys dropped, framework keys retained
- `.claude/skills/DESIGN.md` — Intercom-frame + Seoul Aqua blue `#0071BD`
- `docs/SPEC.md` — this project's specification
- `docs/PROJECT_PLAN.md` — this file
- `docs/PROCESS_NOTES.md` — distilled from client process PDFs
- `docs/DATA_MODEL_NOTES.md` — entity sketch from CSVs
- `docs/DOCUMENT_TEMPLATES.md` — 10 paper-form catalog
- `docs/QUESTIONS.docx` + `docs/QUESTIONS.md` — ~37 open questions

**Verification:**

- `npm install` succeeds (no domain-only deps left)
- `npm run dev` boots a blank-but-styled Next.js app (smoke check)
- `git init` + initial commit made

**Out of phase 0:**

- Any domain code (Prisma models for Customer / Equipment / etc.)
- Any API route beyond what the framework already provides
- Any feature page

**Exit criteria for Phase 0:** ✅ **ALL MET (2026-05-26)**

- ✅ Client has read SPEC.md and answered all 50 questions in `docs/QUESTIONS.md` (`reference/answers.txt` 2026-05-26)
- ✅ Logo blue (`#0071BD`) confirmed (I.2); high-res PNG + AI files received (I.1: `reference/brand/SeoulAqua_Logo_0071BD_Pantone 285C-01.png` + `.ai`)
- ✅ Hosting target confirmed: **v0 Vercel + Supabase** for fast iteration → **vhost.vn migration before production launch** (H.1)
- ⏳ A.5 filter-equipment compatibility data delivery pending 2026-05-29 evening — non-blocking for Phase 1, needed before Phase 5

---

## Phase 1 — Foundation (estimated 1 week)

**Goal:** an empty-but-runnable, branded, multi-language Next.js app deployed to Vercel staging. No domain features yet. Auth works. Sidebar shows Seoul Aqua logo.

**Scope:**

1. `npm install` + run dev (verify framework copy works)
2. Prisma schema v1 — **only** `User`, `Role`, `Session`, `AuditLog` (NO domain entities yet)
3. Supabase project created (dev + staging)
4. Auth shell — login, logout, refresh-token rotation (port from PMIS verbatim)
5. RBAC — 4 roles (`ADMIN > MANAGER > STAFF` + `TECHNICIAN` parallel) wired into `roles.ts` with rank-based hierarchy helpers (per SPEC §2.1). NOTE: previous PMIS enum (`SYSTEM_ADMIN/DIRECTOR/MANAGER/STAFF`) gets replaced wholesale — no migration needed (no data yet).
6. Layout — sidebar with Seoul Aqua logo (brand blue backdrop), topbar, locale switcher, user menu
7. Empty pages: `/dashboard` (welcome card), `/admin/users` (basic user CRUD)
8. i18n — Korean / Vietnamese / English with the framework strings (translated for SOMS context)
9. `LangSyncer` carry-over so `<html lang>` follows active locale
10. Deploy to Vercel — staging URL active
11. Seed admin user; seed example test users for each role
12. Basic E2E smoke test (login flow × 3 roles)

**Success criteria:**

- A user can log in at `https://soms-staging.vercel.app`, see their name in the sidebar, switch language, log out.
- All 11 agents in `.claude/agents/` have been used at least once during this phase (proving the TDD pipeline works on the new repo).
- The Seoul Aqua blue and Intercom-frame design system shows up consistently — sidebar, primary buttons, focus rings.

**Rollback:** delete Supabase project; remove Vercel app. Zero customer impact (none yet).

**Dependencies on questions:**

- ~~Q11 (role permission matrix details)~~ — **RESOLVED 2026-05-26** (SPEC §2.1, 3-tier collapsed)
- Q24 (hosting confirmation — Vercel + Supabase) — answer needed (default if no response by start)

---

## Phase 2 — Customer + Equipment Master (estimated 2 weeks)

**Goal:** today's `고객관리대장` + `정수기등록` spreadsheets become unnecessary.

**Scope:**

1. Prisma models: `Customer`, **`Site`** (NEW — A.4 + A.8 client answer 2026-05-26, Customer > Site > Equipment hierarchy), **`CustomerContact`** (two-contact model — `CONTRACT_PARTY` + `OPS_CONTACT[]` with `scope` enum `CUSTOMER`|`SITE`, see SPEC §3.3.1), `EquipmentModel`, `Equipment` (now with `siteId` + `ownership` enum), `Part`
2. Customer code generator: `KH#####` for new customers; **A.2 migration policy** — legacy management number → `KH0` + zero-padded digits (`8918` → `KH08918`)
3. Customer list page (desktop-first, filterable by type / city / sales rep / active)
4. Customer create / edit form (B2C vs B2B mode toggle, **separate Contract Party + Operations Contact panels with independent language flags**, **Sites tab for B2B** with add/edit/remove + site-scoped Ops contacts per Site)
5. Customer detail page (overview of all their equipment, contracts, visits, payments — **both contacts visible in header with language chips**, **B2B equipment grouped by Site**)
6. Equipment registration UI — pick from `EquipmentModel` catalog → auto-numbered `KH#####-N`, assign to Site (B2B) or directly to Customer (B2C)
7. Equipment relocation / retirement workflows (A.3: status flips to `DEACTIVATED`/`TERMINATED` instead of delete)
8. EquipmentModel catalog admin (CRUD)
9. Part catalog admin (CRUD, with replacement-cycle days)
10. **CSV import script** — read all 7 client CSVs (CP949 → UTF-8), upsert into the new tables, **derive `KH#####` from legacy management number per A.2 (`8918` → `KH08918`)**, link equipment via legacy customer-id, populate filter master from `필터관리`, **generate `CustomerContact` rows: CONTRACT_PARTY from `고객명`+`휴대폰#1`; if `고객정보` carries a distinct secondary name like "MR.K" → auto-create OPS_CONTACT with phone blank (A.9 client answer)**. **Full migration (~9000 customers, J.1 confirmed) + auto-dedup (J.2: match by name+phone) + human review queue.** Idempotent (safe to re-run).
11. **Outbound language router** — utility module (`src/lib/notifications/router.ts`) that, given `(customerId, channel, event)`, returns the correct `CustomerContact` (site-scoped → customer-scoped → CONTRACT_PARTY fallback per A.7 + A.8) and its language. Used by every SMS/email send + every server-rendered PDF. Lays the foundation for Phase 4 SMS and Phase 6 invoice flows.
12. Migration validation: row counts match source CSVs, every customer has a `KH#####`, every equipment has a `customerId` link, **every customer has exactly one CONTRACT_PARTY + 0..N OPS_CONTACT rows**. **J.3 validation lead: Seoul Aqua office manager + dev team**.

**Success criteria:**

- Office staff can find any customer in < 5 seconds (search by name / phone / KH code / legacy code)
- Equipment list per customer is one screen
- All ~9000 historical customer rows are imported and visible

**Rollback:** flag-feature-off the new screens, revert Prisma migration. Customer data preserved.

**Dependencies on questions (status 2026-05-26 — all client-answered):**

- A.1 (KH prefix `KH#####`) — ✅ RESOLVED
- A.2 (legacy code mapping) — ✅ RESOLVED (b: `8918` → `KH08918`)
- A.3 (equipment retirement code reuse) — ✅ RESOLVED (no delete, status flip)
- A.4 + A.8 (Customer > Site hierarchy) — ✅ RESOLVED (Site model from v1)
- A.5 (filter compatibility data delivery) — ⏳ PARTIAL (2026-05-29 evening); non-blocker, can import master without compat
- A.9 (legacy secondary contact handling) — ✅ RESOLVED (auto-create as OPS_CONTACT, phone blank)
- J.1 / J.2 / J.3 — ✅ RESOLVED (full migration, auto+human dedup, office manager + dev team)

---

## Phase 3 — Contracts + Documents (estimated 2 weeks)

**Goal:** every paper contract Seoul Aqua signs starts in the system. The 10 form templates render server-side as PDFs with customer data pre-filled.

**Scope:**

1. Prisma models: `Contract` (with `parentContractId` + `amendmentRevision` for B2B Appendix per B.2 + B.5; `filterPolicy` JSON per E.2; `monthlyMaintenanceFee` per B.4), `ContractEquipment` (M:N), `Document` (with `retentionExpiresAt` computed: 10y for contract/tax invoice, 5y for others per E.4; `paperDestroyedAt` per E.5), `DocumentSignature`
2. Contract create wizard:
   - Pick customer (or create new)
   - Pick sale / rental / maintenance type
   - For rental: 36-month default, mandatory 24-month
   - Add equipment line items (model + quantity + monthly fee or sale price)
   - Calculate totals
   - **Contract code generated**: B2C `HD-YYYYmmDD/SA-KH####` (e.g. `HD-20260526/SA-KH0001`); B2B `HD-YYYYmmDD/SA-{shortcode}` (e.g. `HD-20260526/SA-SHV`). Shortcode prompted at customer-create if missing (B.2 client answer 2026-05-26)
   - **B2B Appendix workflow**: alternative to new-contract — add equipment to an existing contract via `parentContractId` link + increment `amendmentRevision`
   - Save as DRAFT or activate immediately
   - **B.3 transition**: when 36-month rental Contract.status → COMPLETED, system auto-flips Equipment.ownership from COMPANY → CUSTOMER (no separate ownership-transfer PDF needed)
   - **B.4 1-click renewal**: when contract is approaching end, system surfaces a "Renew as Maintenance" action — office adjusts monthly maintenance fee + confirms; system creates new MAINTENANCE Contract with updated fee
   - **B.5 amendment policy**: B2C uses in-place price-field update + AuditLog; B2B uses `amendmentRevision` history
3. Contract detail page with timeline (signed → installed → first visit → first payment → …)
4. Document PDF generator — server-rendered HTML → PDF via `puppeteer-core` + `@sparticuz/chromium` (carry pattern from PMIS, scope to contract docs)
5. The 10 form templates digitized (see `docs/DOCUMENT_TEMPLATES.md`):
   - 임대 계약서 (B2B rental contract)
   - 가정집 임대 계약서 (B2C rental contract)
   - 출고서 (B2B delivery slip)
   - 납품서 (영수증 겸용) (universal delivery + receipt)
   - 판매 영수증 (출고서 겸용) - 가정집 (B2C sale receipt)
   - 정기 점검 확인서 (B2B periodic inspection)
   - 정기 정검표 - 가정집 (B2C periodic inspection + receipt)
   - 작업확인서 (ad-hoc work confirmation)
   - 물품 주문서 (internal PO — admin-only, vendor-facing)
   - Tax invoice receipt template (placeholder for Phase 6 e-invoice)
6. Photo-of-paper signature upload (v1 default per §8 of SPEC)
7. Document tracking: `physicalReceivedAt` field; office screen "signed originals awaiting return"
8. **Sign-up SMS trigger** — when `Contract.status` transitions to `ACTIVE` or a `DELIVERY_RECEIPT` is finalized, enqueue `SMS_PORTAL_WELCOME` for every CustomerContact with `phone1` and `portalEnabled=false`. The actual SMS *send* depends on the SMS provider work in Phase 3.5; until then sign-ups stack in a pending queue that Phase 3.5 drains on launch.

**Success criteria:**

- A technician arrives at a customer with a tablet/phone, opens the rental contract PDF, customer signs on paper, technician photographs the signature, system stores it. Office sees the signed-status update.
- Every form template renders correctly in ko / vi (the legal-binding language).
- B2B contract returned by post is markable as `RECEIVED` when it arrives.

**Rollback:** disable contract-create + PDF generation; keep customer data.

**Dependencies on questions (status 2026-05-26 — all client-answered):**

- B.1 (sale → maintenance) — ✅ RESOLVED (equipment code reused, status flips to MAINTENANCE)
- B.2 (contract code format) — ✅ RESOLVED (B2C/B2B variants + Appendix)
- B.3 (post-36-month ownership) — ✅ RESOLVED (a: auto-flip)
- B.4 (auto-renewal) — ✅ RESOLVED (1-click with fee adjustment)
- B.5 (amendment policy) — ✅ RESOLVED (B2C in-place, B2B revisions)
- E.1 (signature mechanism) — ✅ RESOLVED (a: photo; tablet e-sig TODO Phase 7+)
- E.2 (rental filter free policy) — ✅ RESOLVED (default free + contract-level exceptions via `filterPolicy` JSON)
- E.3 (B2B periodic check fields) — ✅ RESOLVED (simplified field list)
- E.4 / E.5 (retention + paper disposal) — ✅ RESOLVED (10y contract/tax, 5y others; paper 1y after digital)

---

## Phase 3.5 — Customer Portal + SMS (estimated 2 weeks)

**Goal:** customers (B2C household members + B2B operations staff) get their own mobile-first portal triggered automatically by contract activation, with SMS-delivered initial passwords. Closes the loop on "every customer has a digital identity" — no more "I don't remember when I'm due for filter change".

**Scope:**

1. Prisma models: `CustomerSession`, `ServiceRequest`. Extend `CustomerContact` with portal-auth fields (`portalEnabled`, `passwordHash`, `mustChangePassword`, `lastLoginAt`, `failedLoginCount`, `lockedUntil`, `signupSmsSentAt`, `isPrimary`). Drop OPS unique constraint (1:N model per SPEC §3.3.1).
2. **Customer auth** — separate session table from staff `Session`, JWT carries `aud='customer'`. Routes:
   - `POST /api/portal/auth/login` — phone + password
   - `POST /api/portal/auth/refresh`
   - `POST /api/portal/auth/logout`
   - `POST /api/portal/auth/change-password` — supports both "first login forced" and "voluntary change"
3. **Middleware extension** — `src/middleware.ts` dispatches `/portal/*` paths to customer refresh-token cookie; staff routes unchanged. Same middleware file, different branches.
4. **Notification provider integration (SMS + Email, two-channel, MOCK-FIRST)** — Phase 3.5 first-class dependency. **Decision 2026-05-26**: Phase 3.5 ships against a **mock provider** that logs to console + writes to DB with `status='MOCKED'`. Real providers (eSMS for SMS, Resend for email) are stubbed and swapped in via env var when credentials arrive — no code rewrite. This unblocks Phase 3.5 from the 2-3 week eSMS Brandname lead-time.

   **Factory + interface architecture:**

   ```
   src/lib/sms/
   ├── types.ts                # interface SmsProvider { send(...): Promise<SmsResult> }
   ├── mock-client.ts          # Default: console log + SmsLog row with status='MOCKED'
   ├── esms-client.ts          # Stub until F.4 creds arrive (ApiKey/SecretKey/Brandname)
   ├── index.ts                # Factory reads SMS_PROVIDER env: 'mock' | 'esms'
   └── templates.ts            # 7 codes — see DOCUMENT_TEMPLATES.md §A

   src/lib/email/
   ├── types.ts                # interface EmailProvider { send(...): Promise<EmailResult> }
   ├── mock-provider.ts        # Default: console log + EmailLog row with status='MOCKED'
   ├── resend-client.ts        # Stub until F.7 + A.14 resolved
   ├── index.ts                # Factory reads EMAIL_PROVIDER env: 'mock' | 'resend'
   └── templates.ts            # 9 codes — see DOCUMENT_TEMPLATES.md §B

   src/lib/notifications/router.ts   # §C channel selection — provider-agnostic
   ```

   **Environment variables:**
   - Dev / staging: `SMS_PROVIDER=mock`, `EMAIL_PROVIDER=mock` (default)
   - Production (post-launch): `SMS_PROVIDER=esms` + `ESMS_API_KEY` / `ESMS_SECRET_KEY` / `ESMS_BRANDNAME=SeoulAqua`; `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` / `EMAIL_FROM=noreply@seoulaqua.com.vn` / `EMAIL_REPLY_TO=cs@seoulaqua.com.vn`

   **Mock provider behavior:**
   - Same body / template rendering pipeline as production (variables interpolated, language selected per `CustomerContact.language`)
   - Writes `SmsLog` / `EmailLog` row with all production fields populated + `provider='mock'`, `providerMessageId='mock-{nanoid}'`, `status='MOCKED'`
   - Prints to stdout: `[SMS MOCK] 2026-05-26T15:42:00Z → +84901234567 (VI) | SMS_VISIT_REMINDER | 1 seg, 70 chars\n  [SeoulAqua] 15/06/2026 14:00, ...`
   - Admin "Notifications sent" dashboard shows mocked sends with a `MOCKED` badge — enables full pipeline testing pre-launch

   **Canonical source** for template bodies, subjects, variables, channel rules is `docs/DOCUMENT_TEMPLATES.md` — implementation mirrors it exactly regardless of provider. Variable interpolation uses `next-intl` `formatDateTime()` / `formatNumber()`.

   **Production launch coordination (separate from Phase 3.5 dev):** `docs/SMS_BRANDNAME_APPLICATION.md` submitted to eSMS at the team's convenience (still 2-3 week lead-time — submit before production go-live date). For email, `seoulaqua.com.vn` DKIM/SPF/DMARC setup (Q A.14) is a 1-day infra task. Production flip is env-only.
5. **Sign-up worker** — drains the pending queue from Phase 3 (any contracts that activated before SMS was wired). Generates 10-char password (excludes ambiguous chars: 0/O, 1/l/I), bcrypt-hashes, sets `mustChangePassword=true`, fires `SMS_PORTAL_WELCOME` in the contact's language. Idempotent (skips contacts where `portalEnabled=true`).
6. **Portal pages (mobile-first)** — see SPEC §11.2 and mockup screens 47–58:
   - `/portal/login`, `/portal/change-password`, `/portal` (home), `/portal/equipment`, `/portal/visits`, `/portal/requests/new`, `/portal/requests`, `/portal/contacts` (CONTRACT_PARTY only), `/portal/payments`, `/portal/profile`
7. **Service request submission + status tracker** — customer files request from portal; free types auto-create a Visit; paid types route to an office inbox for STAFF+ review (mockup screen 57). Status changes trigger SMS back to submitter.
8. **Office side: password reset** — MANAGER+ button on customer-detail per contact. Regenerates password, queues `SMS_PASSWORD_RESET`, writes audit log. Mockup screen 58.
9. **i18n** — portal uses the logged-in contact's `CustomerContact.language` rather than the staff i18n switcher (which doesn't apply outside the office app).

**Success criteria:**

- Every customer with an active contract (B2C + B2B) receives a welcome SMS with portal URL + initial password within 5 minutes of contract activation.
- A customer can log in on a phone, see their next visit, see filter-due dates, and submit a service request in under 60 seconds.
- A B2B CONTRACT_PARTY can add/edit/delete OPS contacts (with proper SMS for new contacts) from the portal.
- An office MANAGER can reset any contact's password in 1 click; the new password reaches the customer's phone in under 1 minute.

**Rollback:** Disable `/portal/*` routes (single feature flag); customer data and `portalEnabled` flags are preserved.

**Dependencies on questions:**

**Phase 3.5 dev-start blockers** (must answer before coding begins):
- A.10 (portal URL/domain) — blocker
- A.11 (password policy) — blocker
- C.6 (service-request type list) — blocker

**Phase 3.5 non-blockers** (have defaults):
- A.12 (OTP vs password) — non-blocker (default password-only)
- A.13 (shared-phone contacts handling) — non-blocker (default: only one gets enabled)
- F.5 (password-reset session behavior) — non-blocker (default: keep existing sessions, change is enough)
- F.6 (lockout policy) — non-blocker (default: 5 fails → 15 min lockout)

**Production-launch blockers** (Phase 3.5 dev proceeds against mock provider; these only gate the env flip from mock → real):
- F.4 (SMS sender ID — Brand name registration ~2-3 weeks at eSMS.vn; needed for SMS_PROVIDER=esms env flip)
- F.7 (Email provider choice — Resend recommended; needed for EMAIL_PROVIDER=resend env flip)
- A.14 (Email sender domain + DKIM/SPF/DMARC for `seoulaqua.com.vn`; 1-day infra task before production email send)
- Q17 (SMS provider — **pulled forward from Phase 7**; needed for env flip)

> **Mock-first development** unblocks Phase 3.5 from external-vendor lead times. End-to-end portal + service-request + notification flows are fully testable against the mock providers — DB `SmsLog`/`EmailLog` records show `status='MOCKED'` instead of `SENT`, and an admin dashboard badge surfaces this distinction. Production go-live is a separate, lighter-weight gate.

---

## Phase 4 — Visits + Schedule (estimated 2 weeks)

**Goal:** today's `필터교환대상` spreadsheet becomes the daily roster screen.

**Scope:**

1. Prisma models: `Visit` (with `siteId`, **`leadTechnicianId`** + **`collaboratorTechnicianIds[]`** per K.3 client answer), `VisitEquipment` (M:N), `VisitNote`
2. Auto-generation of periodic visits from active rental + maintenance contracts (1× per month or per 2-months)
3. **Scheduler auto-recommend (C.1, C.2 client answer 2026-05-26)**: when a new visit needs a tech, the system ranks candidates by (1) `Customer.preferredTechnicianId` if set + available; (2) region match (`Technician.preferredRegion` ↔ `Customer.preferredRegion` / `Site.region`); (3) daily-load balance. Office confirms with one click; can manually override anyone.
4. Visit calendar — weekly view by technician (drag-to-reschedule)
5. **Mobile technician roster** — "today" / "tomorrow" / "overdue" tabs, sorted by time window, with one-tap to call customer / navigate (link out to Google Maps). **Collaborators see shared visits with a "Shared with you" badge — read+contribute notes/photos but cannot mark complete or accept payment.**
6. Visit completion form (mobile-first) — confirm equipment serviced, log filter changes, mark complete, capture signature, collect payment. **Lead tech only** (collaborators see read-only complete button).
7. Reschedule flow (office staff drag, or technician taps "reschedule" on phone)
8. Multi-day, multi-technician big-site handling (link visits via `parentJobId`)
9. **Region grouping in roster** (simple by-district sort per C.5 client answer; map view deferred to Phase 7+ TODO)
10. **Mobile device targets (K.1 confirmed)**: Android 8+ / iOS 14+, 5-6 inch screen design baseline, 8MP+ camera assumed for filter/equipment photos
11. **Technician auth (K.2 confirmed)**: phone number + password (no email required)
12. Notifications — in-app for office when customer-no-show; SMS via Phase 3.5 router (mock or eSMS per env)

**Success criteria:**

- Tomorrow's roster auto-generates by 18:00 each day
- A technician with 8 visits can complete all of them, log filter changes, capture signatures, and clear the day in < 2 hours of office time (vs ~4 today)
- Reschedule from customer call → new visit row in < 30 sec for office staff

**Rollback:** disable auto-generation; technicians fall back to spreadsheet.

**Dependencies on questions (status 2026-05-26 — all client-answered):**

- C.1 (assignment algorithm) — ✅ RESOLVED (b: auto-recommend + office confirm)
- C.2 (territories / preferred tech) — ✅ RESOLVED (soft region + preferredTechnicianId per customer)
- C.3 (PWA vs native) — ✅ RESOLVED (a: PWA)
- C.4 (offline) — ✅ RESOLVED (online-first v1, Phase 7 TODO)
- C.5 (map) — ✅ RESOLVED (region sort only, map Phase 7+ TODO)
- K.1 / K.2 / K.3 — ✅ RESOLVED (device targets, phone-auth, lead+collaborators)

---

## Phase 5 — Service history + Filter lifecycle (estimated 1.5 weeks)

**Goal:** today's `필터교환이력` + `필터교환대상` spreadsheets fully replaced.

**Scope:**

1. Prisma models: `PartReplacement`, `EquipmentService`
2. Per-equipment filter due-date computation (last replaced + cycle days)
3. Per-customer service history timeline (every visit, every part change)
4. Overdue alerts — dashboard widget "12 customers overdue for filter change"
5. **Mobile bulk-update screen** — "today I visited 8 customers; for each, mark which filters I changed" in one screen (vs 8 separate forms)
6. PartReplacement audit (who, when, which part, which equipment, which visit)
7. Inventory counter (simple): each PartReplacement decrements stock; manual adjust for receiving

**Success criteria:**

- Filter-due alerts are zero-touch
- Bulk update of 10 customers' filter changes in < 1 minute on a phone
- Service history per customer renders instantly (< 500 ms)

**Rollback:** disable PartReplacement writes; data preserved.

**Dependencies on questions:**

- Q4 (filter compatibility data) — needed for "which filters apply to this equipment" suggestion

---

## Phase 6 — Payments (estimated 2 weeks)

**Goal:** today's `고객 수금정보` spreadsheet fully replaced. Cash-handover audit trail closes.

**Scope:**

1. Prisma models: `Payment` (with `expectedAmount` for partial-payment carryover per D.3; `invoicePdfPath` + `invoicePdfUploadedAt` + `invoiceProvider`='viettel-sinvoice' default per D.1; **D.5 confirmed**: all B2B require tax invoice — PDF upload optional with warning banner if missing after N days)
2. Cash collection on visit completion (Phase 4 placeholder fills in)
3. Bank-transfer matching screen — paste bank statement CSV → auto-suggest contract matches
4. B2B invoice tracking — upload PDF e-invoice (Viettel SInvoice PDF) + customer + due date; mark `RECEIVED` when payment lands. **Viettel SInvoice direct integration is TODO for Phase 8+**.
5. Receivable aging report (overdue by 0-30 / 30-60 / 60-90 / 90+ days)
6. **Cash-handover audit (D.2 client answer)**: 3-step trail `collectedByUserId` (technician) → `officeReceivedByUserId` (office) → `reconciledByUserId` (accountant); each step timestamped. **48-hour SLA alert**: if cash is not marked `officeReceivedAt` within 48h of `collectedAt`, admin dashboard surfaces the row.
7. **Partial payment support (D.3)**: a customer may pay less than the full installment; system records the partial amount, computes outstanding balance, and rolls remainder into next cycle.
8. **Operational email (F.2)**: invoice PDFs auto-emailed via vhost.vn Email Relay to `Customer.billingEmail`. Separate from transactional Resend channel.
9. Contract end-date recompute on each installment received (per SPEC §7.3)
10. **VND-only display (D.4 confirmed)**: all currency UI in VND; exports may include conversion column.
11. Export to accounting CSV (monthly close)

**Success criteria:**

- Every dong collected has 3-stage traceability
- Aging report shows tomorrow's expected collections by technician (drives next day's schedule prioritization)
- Monthly close exports cleanly

**Rollback:** disable Payment writes; keep PaymentInstallment computed lazily.

**Dependencies on questions (status 2026-05-26 — all client-answered):**

- D.1 (e-invoice provider) — ✅ RESOLVED (Viettel SInvoice; v1 PDF upload; integration TODO Phase 8+)
- D.2 (cash handover audit) — ✅ RESOLVED (3-step + 48h SLA)
- D.3 (partial payment) — ✅ RESOLVED (allow + carryover)
- D.4 (currency) — ✅ RESOLVED (VND only)
- D.5 (no-invoice B2B) — ✅ RESOLVED (**all B2B require invoice**; PDF upload optional warning)
- F.2 (email provider for invoice) — ✅ RESOLVED (vhost.vn Email Relay)

---

## Phase 7 — Notifications + Field polish (estimated 1.5 weeks)

**Goal:** notification depth + tech-app polish. Core SMS infra was built in Phase 3.5; this phase extends it.

**Scope:**

1. **Additional SMS templates beyond Phase 3.5 minimum** — visit reminder (24h ahead), payment-due, contract-expiring, filter-overdue. All in vi/ko with opt-out compliance.
2. Email integration — for B2B invoice delivery; provider per Q18
3. In-app notification deepening — real-time via Supabase Realtime (staff bell + customer portal toasts)
4. Tablet e-signature upgrade (replace photo-of-paper if confirmed in Q14)
5. Offline-tolerant data entry (per Q12) — localStorage queue + sync indicator (for both technician app AND customer portal)
6. Mobile-app polish — install prompt (PWA), home-screen icon, splash screen with Seoul Aqua logo. Applies to BOTH the technician mobile UI and the customer portal.

**Success criteria:**

- Visit reminder SMS delivers 24h before scheduled visit, 95 % delivery rate
- B2B invoice emails delivered 100 %, link-back to portal ready
- Technicians stop manually calling customers to confirm

**Rollback:** disable SMS/email send; data + manual workflow stays.

**Dependencies on questions:**

- Q14 (tablet e-sig) — blocker if upgrading
- ~~Q17 (SMS provider)~~ — moved to Phase 3.5
- Q18 (email provider) — blocker
- Q19 (notification opt-out scope) — blocker

---

## Phase 8+ — Portal v2 + CRM (future, strategic)

Phase 3.5 already shipped the v1 customer portal (login + history + service requests + multi-OPS management). Phase 8+ extends it:

- **Phase 8: Viettel SInvoice direct integration** (D.1 TODO) — replace PDF upload with API call so invoices are issued from SOMS into Vietnamese tax authority systems automatically.
- **Phase 8: Tablet e-signature** (E.1 TODO) — replace photo-of-paper with on-device touch signature capture.
- **Phase 8: Map view + route optimization** (C.5 TODO) — Goong Maps or Google Maps for daily-route visualization and optimization.
- **Phase 8: Offline queue for technicians** (C.4 TODO) — localStorage outbox + sync-on-reconnect for visits completed without network.
- **Phase 8: Portal payments** — VNPay / MoMo / VietQR integration so customers can pay rent or service-request quotes directly in the portal.
- **Phase 8: Zalo OA + Zalo Mini App** (F.1 client request 2026-05-26) — Zalo Official Account messaging as a richer alternative to SMS for visit reminders / receipts / notifications (cheaper than SMS, native Vietnamese audience reach). Zalo Mini App as an alternative customer portal UI hosted inside Zalo (very popular in VN).
- **Phase 9: Marketing automation** — lead capture, drip campaigns, customer-lifecycle stage tracking. Hooks into Vietnamese marketing tools (Mautic, Zalo OA campaigns).
- **Phase 10: B2B-specific portal extensions** — multi-site rollups (B2B portal G.2: tax invoice download, payment confirmation requests), per-department download of invoices, bulk visit-request for many devices on a single submission.

**G.1 (customer portal activation timing)** — TBD per client; internal-stability-first. Will reactivate planning here when client signals readiness.

**G.3 (online portal payment)** — TBD per client; will form a dedicated phase once payment provider is chosen.

These are extensions — not new categories. The v1 portal is the foundation.

---

## Cross-cutting workstreams (always-on)

| Workstream | Cadence | Owner |
|---|---|---|
| User manuals (per role × per language) | Updated after each phase ship | `manuals` agent |
| E2E test coverage | Each phase adds Playwright specs for that phase's flows | `qa` agent |
| Security review | Each phase reviewed by `reviewer` agent before ship | `reviewer` agent |
| Performance budget | Page LCP < 2.5 s; API P95 < 300 ms; monitored via Vercel Speed Insights | `devops` agent |
| Backup verification | Monthly restore-test of `pg_dump` | `devops` agent |

---

## 13. Phase 0 Exit gate — 5 blocking questions

These must be answered before Phase 1 starts:

1. **Q1** — Customer-code policy: confirm `KH#####` format and what to do with legacy management numbers in the existing CSV
2. ~~**Q11** — Role permission matrix~~ — **RESOLVED 2026-05-26** (SPEC §2.1, 3-tier: `ADMIN/MANAGER/STAFF` + `TECHNICIAN`)
3. **Q14** — Signature mechanism for v1: tablet e-signature or photo-of-paper (drives Phase 3 effort by ~2 weeks)
4. **Q24** — Hosting confirmation: Vercel + Supabase OK or alternate constraint (e.g. data-residency)
5. **Q I.2** — Brand-blue hex confirmation: `#0071BD` from logo OK, or alternate hex

Additional blockers for **Phase 3.5** (because SMS provider has ~3-week lead time, decisions need to land before Phase 2 ends):

6. **A.10** — Portal URL/domain (production domain is `seoulaqua.com.vn`; pending decision: subdomain `portal.seoulaqua.com.vn` vs path `seoulaqua.com.vn/portal` vs root-redirect — SMS templates currently assume root redirect for shortest char budget; see `docs/DOCUMENT_TEMPLATES.md` § SMS catalog)
7. **A.11** — Password policy (length + character classes)
8. **C.6** — Service request type list (confirm/extend the 7 types in SPEC §6.5)
9. **F.4** — SMS sender ID / Brand name (eSMS.vn registration lead-time critical)
10. **Q17** — SMS provider choice (default eSMS.vn)

Everything else can be deferred to the relevant later phase's pre-start gate.

---

## Change log

- **2026-05-27 (v0.7 latest)** — **Client answers received** via `reference/answers.txt`. All 50 questions answered. Major Phase impact:
  - **Phase 2**: Site model added (Customer > Site > Equipment, A.4 + A.8); `KH0`-prefix migration (A.2); shortcode field (B.2); preferred-tech fields (C.2); auto-Ops contact for legacy secondary names (A.9); full migration (J.1).
  - **Phase 3**: contract code format `HD-YYYYmmDD/SA-...` with B2B Appendix support (B.2 + B.5); Equipment.ownership auto-flip (B.3); 1-click renewal (B.4); filter policy JSON (E.2); document retention (E.4: 10y/5y); paper destruction policy (E.5).
  - **Phase 3.5**: portal URL = **`portal.seoulaqua.com.vn`** subdomain (A.10) — adds +712K VND/mo SMS cost as A.3 VI bumps to 2-seg.
  - **Phase 4**: multi-tech `leadTechnicianId` + `collaboratorTechnicianIds[]` (K.3); auto-scheduler with preferred tech (C.1, C.2); region sort only (C.5); device targets (K.1: Android 8+ / iOS 14+ / 5-6" / 8MP+); phone+password auth (K.2); online-first PWA (C.3 + C.4).
  - **Phase 6**: 48h cash audit SLA (D.2); partial payment + carryover (D.3); VND only (D.4); **all B2B require tax invoice** (D.5) with PDF upload warning-only; vhost.vn Email Relay for invoice delivery (F.2).
  - **Phase 8+**: **Zalo OA + Mini App TODO** (F.1); Viettel SInvoice direct integration TODO (D.1); tablet e-sig TODO (E.1); map view TODO (C.5); offline queue TODO (C.4); G.1/G.2/G.3 portal v2 expansions.
  - **Infra**: vhost.vn hosting confirmed (H.1); 24-month audit retention (H.2); 03:00 VST backup (H.3).
  - Phase 0 exit criteria **all met** — ready to start Phase 1.
- **2026-05-26 (v0.6)** — **Mock-first notification provider** introduced to Phase 3.5. SMS + Email both ship against a mock provider that logs to console + writes `SmsLog`/`EmailLog` rows with `provider='mock'`, `status='MOCKED'`. Real providers (eSMS, Resend) become stubs swapped via env (`SMS_PROVIDER`, `EMAIL_PROVIDER`) when credentials arrive. F.4 / F.7 / A.14 / Q17 reclassified from Phase 3.5 blockers → production-launch blockers — Phase 3.5 dev no longer waits on the 2-3 week eSMS Brandname approval. Same template content, same DB schema, same UI throughout.
- **2026-05-26 (v0.5)** — Phase 3.5 expanded to **two-channel notification system**: SMS for urgent (security/credentials/dunning-final/D-1) + Email for non-urgent (receipts/acknowledgments/early reminders/summaries with PDF). 10 logical events → 7 SMS templates + 9 email templates (incl. multi-stage variants). Added `src/lib/email/provider.ts` + `src/lib/email/templates.ts` + `EmailLog` model + `src/lib/notifications/router.ts` to Phase 3.5 scope. Verified eSMS pricing applied (830 VND/seg + 50K/mo per network). Monthly cost projection revised: ~1.51M VND/mo (down from ~3.98M, -62%). New blockers F.7 (email provider) + A.14 (email domain DKIM/SPF).
- **2026-05-26 (later)** — v0.4. Phase 3.5 SMS scope tightened: canonical template bodies live in `docs/DOCUMENT_TEMPLATES.md` § SMS catalog (10 templates × KO/VI/EN with verified char counts per Option C hybrid: 4 × 1-segment + 6 × 2-segment). Client-deliverable Brandname application form generated at `docs/SMS_BRANDNAME_APPLICATION.md` — to be submitted to eSMS account manager in parallel with Phase 1–3 work (2–3 week telecom approval lead-time). Production domain confirmed `seoulaqua.com.vn`.
- **2026-05-26** — v0.3. **Phase 3.5 (Customer Portal + SMS) inserted** between Phase 3 and Phase 4 (~2 weeks). SMS provider work pulled forward from Phase 7 → Phase 3.5. Phase 1 RBAC seed simplified to 4 roles (ADMIN/MANAGER/STAFF/TECHNICIAN — Q11 resolved). Phase 8+ refocused on portal payments + CRM extensions (the portal itself ships in 3.5). Phase 0 exit gate Q11 closed; A.10/A.11/C.6/F.4/Q17 added as Phase 3.5 blockers.
- **2026-05-25** — v0.1 initial roadmap. Phase 0 deliverables aligned with bootstrap session. Phase 1–7 sketched; Phase 8+ strategic placeholder.
