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

**Exit criteria for Phase 0:**

- Client has read SPEC.md and answered at least the **5 blocking questions** flagged in §13.1 below
- Logo blue (`#0071BD`) confirmed (or alternate hex provided)
- Hosting target confirmed (Vercel + Supabase default)

---

## Phase 1 — Foundation (estimated 1 week)

**Goal:** an empty-but-runnable, branded, multi-language Next.js app deployed to Vercel staging. No domain features yet. Auth works. Sidebar shows Seoul Aqua logo.

**Scope:**

1. `npm install` + run dev (verify framework copy works)
2. Prisma schema v1 — **only** `User`, `Role`, `Session`, `AuditLog` (NO domain entities yet)
3. Supabase project created (dev + staging)
4. Auth shell — login, logout, refresh-token rotation (port from PMIS verbatim)
5. RBAC — 5 roles from SPEC §2.1 wired into `roles.ts`
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

- Q11 (role permission matrix details) — answer needed
- Q24 (hosting confirmation — Vercel + Supabase) — answer needed (default if no response by start)

---

## Phase 2 — Customer + Equipment Master (estimated 2 weeks)

**Goal:** today's `고객관리대장` + `정수기등록` spreadsheets become unnecessary.

**Scope:**

1. Prisma models: `Customer`, `EquipmentModel`, `Equipment`, `Part`
2. Customer code generator (`KH#####`) with collision-safe sequence
3. Customer list page (desktop-first, filterable by type / city / sales rep / active)
4. Customer create / edit form (B2C vs B2B mode toggle)
5. Customer detail page (overview of all their equipment, contracts, visits, payments)
6. Equipment registration UI — pick from `EquipmentModel` catalog → auto-numbered `KH#####-N`
7. Equipment relocation / retirement workflows
8. EquipmentModel catalog admin (CRUD)
9. Part catalog admin (CRUD, with replacement-cycle days)
10. **CSV import script** — read all 7 client CSVs (CP949 → UTF-8), upsert into the new tables, generate `KH#####` for every legacy customer, link equipment via legacy customer-id, populate filter master from `필터관리`. Idempotent (safe to re-run).
11. Migration validation: row counts match source CSVs, every customer has a `KH#####`, every equipment has a `customerId` link.

**Success criteria:**

- Office staff can find any customer in < 5 seconds (search by name / phone / KH code / legacy code)
- Equipment list per customer is one screen
- All ~9000 historical customer rows are imported and visible

**Rollback:** flag-feature-off the new screens, revert Prisma migration. Customer data preserved.

**Dependencies on questions:**

- Q1 (KH prefix policy + legacy-code retention) — blocker
- Q2 (existing customer code collision) — blocker
- Q3 (equipment retirement code reuse) — blocker
- Q4 (filter compatibility data delivery date) — non-blocker; can import filter master without compat for now

---

## Phase 3 — Contracts + Documents (estimated 2 weeks)

**Goal:** every paper contract Seoul Aqua signs starts in the system. The 10 form templates render server-side as PDFs with customer data pre-filled.

**Scope:**

1. Prisma models: `Contract`, `ContractEquipment` (M:N), `Document`, `DocumentSignature`
2. Contract create wizard:
   - Pick customer (or create new)
   - Pick sale / rental / maintenance type
   - For rental: 36-month default, mandatory 24-month
   - Add equipment line items (model + quantity + monthly fee or sale price)
   - Calculate totals
   - Save as DRAFT or activate immediately
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

**Success criteria:**

- A technician arrives at a customer with a tablet/phone, opens the rental contract PDF, customer signs on paper, technician photographs the signature, system stores it. Office sees the signed-status update.
- Every form template renders correctly in ko / vi (the legal-binding language).
- B2B contract returned by post is markable as `RECEIVED` when it arrives.

**Rollback:** disable contract-create + PDF generation; keep customer data.

**Dependencies on questions:**

- Q6 (contract code format) — blocker
- Q7 (rental → maintenance auto-conversion rules) — blocker
- Q14 (tablet e-sig vs photo) — blocker (defaults to photo)

---

## Phase 4 — Visits + Schedule (estimated 2 weeks)

**Goal:** today's `필터교환대상` spreadsheet becomes the daily roster screen.

**Scope:**

1. Prisma models: `Visit`, `VisitEquipment` (M:N), `VisitNote`
2. Auto-generation of periodic visits from active rental + maintenance contracts (1× per month or per 2-months)
3. Visit calendar — weekly view by technician (drag-to-reschedule)
4. **Mobile technician roster** — "today" / "tomorrow" / "overdue" tabs, sorted by time window, with one-tap to call customer / navigate (link out to Google Maps)
5. Visit completion form (mobile-first) — confirm equipment serviced, log filter changes, mark complete, capture signature, collect payment (Phase 6 will deepen payment)
6. Reschedule flow (office staff drag, or technician taps "reschedule" on phone)
7. Multi-day, multi-technician big-site handling (link visits via `parentJobId`)
8. Region grouping in roster (simple by-district sort; map view deferred)
9. Notifications — in-app for office when customer-no-show; SMS placeholder (real SMS in Phase 7)

**Success criteria:**

- Tomorrow's roster auto-generates by 18:00 each day
- A technician with 8 visits can complete all of them, log filter changes, capture signatures, and clear the day in < 2 hours of office time (vs ~4 today)
- Reschedule from customer call → new visit row in < 30 sec for office staff

**Rollback:** disable auto-generation; technicians fall back to spreadsheet.

**Dependencies on questions:**

- Q8 (multi-technician parallel assignment model) — blocker
- Q9 (territory / region model) — blocker
- Q10 (map provider) — non-blocker, defer to Phase 4+
- Q12 (offline data entry requirement) — blocker

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

1. Prisma models: `Payment`, `PaymentInstallment` (links Payment ↔ Contract installment)
2. Cash collection on visit completion (Phase 4 placeholder fills in)
3. Bank-transfer matching screen — paste bank statement CSV → auto-suggest contract matches
4. B2B invoice tracking — upload PDF e-invoice + customer + due date; mark `RECEIVED` when payment lands
5. Receivable aging report (overdue by 0-30 / 30-60 / 60-90 / 90+ days)
6. Cash-handover audit — `collectedByUserId` (technician) → `officeReceivedByUserId` (office) → `reconciledByUserId` (accountant); each step timestamped
7. Contract end-date recompute on each installment received (per SPEC §7.3)
8. Export to accounting CSV (monthly close)

**Success criteria:**

- Every dong collected has 3-stage traceability
- Aging report shows tomorrow's expected collections by technician (drives next day's schedule prioritization)
- Monthly close exports cleanly

**Rollback:** disable Payment writes; keep PaymentInstallment computed lazily.

**Dependencies on questions:**

- Q13 (Vietnamese e-invoice vendor choice) — non-blocker for v1 (uploaded PDF approach)
- Q15 (partial payment handling) — blocker
- Q16 (B2B non-invoice tax handling) — blocker

---

## Phase 7 — Notifications + Field polish (estimated 2 weeks)

**Goal:** customer reminders flow without manual phone calls. Mobile tech app feels polished.

**Scope:**

1. SMS provider integration — eSMS.vn or Twilio Vietnam (TBD per Q17)
2. Outbound SMS templates (in vi, opt-out compliant): visit reminder, payment due, contract expiring
3. Email integration — for B2B invoice delivery; provider per Q18
4. In-app notification deepening — real-time via Supabase Realtime
5. Tablet e-signature upgrade (replace photo-of-paper if confirmed in Q14)
6. Offline-tolerant data entry (per Q12) — localStorage queue + sync indicator
7. Mobile-app polish — install prompt (PWA), home-screen icon, splash screen with Seoul Aqua logo

**Success criteria:**

- Visit reminder SMS delivers 24h before scheduled visit, 95 % delivery rate
- B2B invoice emails delivered 100 %, link-back to portal (future) ready
- Technicians stop manually calling customers to confirm

**Rollback:** disable SMS/email send; data + manual workflow stays.

**Dependencies on questions:**

- Q14 (tablet e-sig) — blocker if upgrading
- Q17 (SMS provider) — blocker
- Q18 (email provider) — blocker
- Q19 (notification opt-out scope) — blocker

---

## Phase 8+ — Customer portal & CRM (future, strategic)

Not committed. Sketch only.

- **Phase 8: B2B customer portal** — invoice download, service history per device, request a visit. Customer role activated.
- **Phase 9: B2C customer portal** — view contracts, view filter-due dates, request a visit, pay online (Vietnamese payment gateway integration).
- **Phase 10: Marketing automation** — lead capture, drip campaigns, customer-lifecycle stage tracking. Hooks into Vietnamese marketing tools (Mautic, Zalo OA, etc.).

These are listed for the design system to consider future evolution (the Customer role is already sketched, the design system is friendly enough for self-service users, the API conventions allow opening read endpoints to a customer JWT later).

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
2. **Q11** — Role permission matrix: any deviations from the 5-role model sketched in SPEC §2.1
3. **Q14** — Signature mechanism for v1: tablet e-signature or photo-of-paper (drives Phase 3 effort by ~2 weeks)
4. **Q24** — Hosting confirmation: Vercel + Supabase OK or alternate constraint (e.g. data-residency)
5. **Q I.2** — Brand-blue hex confirmation: `#0071BD` from logo OK, or alternate hex

Everything else can be deferred to the relevant later phase's pre-start gate.

---

## Change log

- **2026-05-25** — v0.1 initial roadmap. Phase 0 deliverables aligned with bootstrap session. Phase 1–7 sketched; Phase 8+ strategic placeholder.
