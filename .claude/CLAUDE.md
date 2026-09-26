# Seoul Aqua SOMS — Claude Code Configuration

## Project Overview

**Seoul Aqua Service Operation Management System (SOMS)** — customer + service-operation management system for **CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)**, a Vietnam-based seller / renter / maintainer of water purifiers, air purifiers, bidets, and related household water-treatment products. ~10 office staff + up to 80 field technicians. Multi-language (ko/vi/en), customer-centric (B2C + B2B), mobile-first for field technicians, desktop-first for office.

## Tech Stack
- Next.js 16 (App Router) + TypeScript (strict)
- Custom components + Tailwind CSS 4 (no shadcn/ui, no native system UI elements)
- PostgreSQL + Prisma v7 (`@prisma/adapter-pg` + `pg.Pool`) — Supabase-compatible
- Custom JWT auth (jose, Edge Runtime compatible)
- next-intl (ko / vi / en — switchable on any screen)
- TanStack React Query + React Context
- Zod + react-hook-form
- Vitest + React Testing Library + Playwright (testing)
<!-- portfolio:drop-start -->
- Hosting: **Vercel + Supabase** (initial); vhost.vn migration deferred
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
- Hosting: **Vercel + Supabase** (production target)
portfolio:add-end -->

> The framework, agent team, build pipeline, and conventions are **inherited from MegaDnC PMIS** (`/Users/jake/Works/MegaDnC/mega_dnc_pmis`). Reference that repo for "how things are done" — but do NOT carry over any domain code (construction project / daily report / equipment / etc.). All schema, all routes, all messages, and the design system are rebuilt for Seoul Aqua.

## Agent Team: TDD Full-Stack Development Pipeline

This project enforces **Test-Driven Development**. No implementation code is written until failing tests exist.

### Team Members

| Agent | Role | Model | When Invoked |
|-------|------|-------|-------------|
| `orchestrator` | Pipeline Lead | opus | Coordinates all stages, enforces TDD flow |
| `designer` | UI/UX Designer | sonnet | Stage 1: wireframes, component specs (uses `skills/DESIGN.md`) |
| `tdd-guide` | TDD Specialist | sonnet | Stage 2 (RED): write failing tests / Stage 4 (GREEN): verify tests pass |
| `frontend` | Frontend Dev | opus | Stage 3: implement to pass frontend tests |
| `backend` | Backend Dev | opus | Stage 3: implement to pass backend tests |
| `reviewer` | Code Reviewer | sonnet | Stage 5: security, performance, quality audit |
| `api-docs` | Doc Writer | sonnet | Stage 5: endpoint documentation |
| `qa` | QA Engineer | sonnet | Stage 6: Playwright E2E tests against real server + DB |
| `manuals` | User-Manual Writer | sonnet | Stage 7.5: per-phase, per-role user manuals (en + ko + vi) for ADMIN / MANAGER / STAFF / TECHNICIAN / CUSTOMER |
| `git-flow` | Git Workflow | sonnet | Stage 0: create feature branch / Stage 8: commit + open PR (only after all gates pass) |
| `devops` | DevOps / Infrastructure | opus | On-demand — Vercel + Supabase ops, CI/CD pipelines, deploy scripts. Outside the per-feature TDD pipeline. |

### TDD Pipeline Flow

```
User Request → orchestrator → git-flow(START) → designer → tdd-guide(RED)
  → backend / frontend → tdd-guide(GREEN) → reviewer + api-docs → qa → manuals
  → git-flow(END) [commit + push + PR]
```

### TDD Rules (Non-Negotiable)

1. **Tests FIRST**: `tdd-guide (RED)` writes tests before any implementation
2. **Tests define contracts**: Implementation agents READ tests to understand expected behavior
3. **GREEN gate**: Code cannot proceed to review until all tests pass
4. **Coverage minimum**: 80% across statements, branches, functions, lines
5. **Fail loop**: If GREEN fails, implementation agents fix code (not tests, unless test was wrong)
6. **Branch gate**: All feature work happens on a `git-flow`-created branch, never on `master`
7. **Commit gate**: `git-flow (END)` only commits/pushes/PRs when GREEN + reviewer + api-docs + qa + manuals have all confirmed pass; it refuses otherwise
8. **Manual gate**: every completed phase must update the affected role manuals under `docs/manuals/{en,ko,vi}/{admin,manager,staff,technician,customer}.md` before the PR is opened

### Usage

```
@orchestrator Phase 1 — Foundation을 TDD로 진행해주세요
@tdd-guide mode=RED — /api/auth/login 엔드포인트의 테스트를 작성해주세요
@backend 테스트를 통과하도록 /api/auth/login을 구현해주세요
@tdd-guide mode=GREEN — 테스트 실행하고 결과 보고해주세요
@git-flow mode=START — feature/customer-master 브랜치 생성
@git-flow mode=END — 모든 게이트 통과, 커밋 + PR 생성
```

## Code Conventions

- **API Response Format**: `{ success: boolean, data?: T, error?: string, pagination?: {...} }`
- **File Naming**: PascalCase for components, camelCase for utilities, kebab-case for routes
- **i18n**: All user-facing strings via `useTranslations()` — never hardcode
- **Validation**: Zod schemas in `src/lib/validators/` shared between frontend and API routes
- **Components**: Server Components by default, `"use client"` only when needed
- **Exports**: Named exports preferred
- **Tests**: `__tests__/` directory structure (unit/integration/components), Vitest (node + jsdom projects) + Playwright E2E
- **Design System**: **Intercom-frame + Seoul Aqua blue** (`.claude/skills/DESIGN.md`) — warm cream canvas, sharp 4px borders, scale(1.1) hover on primary CTA, Seoul Aqua brand-blue as the primary accent (NOT grayscale, NOT orange)
- **UI Rule**: All components must be custom-built with Tailwind CSS. No shadcn/ui, no native system elements (select, dialog, confirm, alert). Custom dropdowns must include search when options > 5.
- **Database**: Prisma v7 with `@prisma/adapter-pg` + `pg.Pool` (required for Supabase compatibility)
- **Cookie Path**: `refreshToken` cookie uses `Path=/` (not `/api/auth`) so middleware can read it on all routes
- **Mobile-first for technician screens**: data-entry-heavy screens (visit completion, payment collection) must work on a phone in the field; office-staff screens can be desktop-first

## Domain Vocabulary (KR / VI / EN)

| KR | VI | EN | Notes |
|---|---|---|---|
| 고객 | Khách hàng | Customer | B2C 가정집 + B2B 회사 |
| 가정집 / 회사 | Hộ gia đình / Doanh nghiệp | B2C / B2B | Customer-type discriminator |
| 사업장 / 사이트 | Cơ sở / Địa điểm | Site | Sub-location of a Customer (factory building, branch office). Customer > Site > Equipment 3-level hierarchy (A.4 + A.8 client answer 2026-05-26). B2C usually has no Sites; B2B usually has 1+ Sites. |
| 계약 주체 | Bên ký hợp đồng | Contract Party / Signatory | 계약서 서명, 세금계산서, 법적 통보 대상. `CustomerContact` role = `CONTRACT_PARTY`, always `scope=CUSTOMER` |
| 관리 주체 | Liên hệ vận hành | Operations Contact | 방문 일정 확정, SMS, 영수증 수신, 일상 커뮤니케이션. `CustomerContact` role = `OPS_CONTACT`. Can be `scope=CUSTOMER` (organization-level) or `scope=SITE` (specific to a Site) |
| 장비 | Thiết bị | Equipment | Customer's installed unit; e.g. 정수기 모델 PTS-2100. Attaches to Customer (B2C) or Site (B2B) |
| 정수기 / 비데 / 공기청정기 | Máy lọc nước / Bồn cầu thông minh / Máy lọc không khí | Water purifier / Bidet / Air purifier | Product categories |
| 필터 / 소모품 | Lõi lọc / Vật tư tiêu hao | Filter / Consumable | Replacement parts |
| 임대 | Thuê | Rental | 36-month contract, ownership transfers at end |
| 판매 | Bán | Sale | Outright purchase |
| 유지관리 / 관리 | Bảo trì / Quản lý | Maintenance | Post-rental or stand-alone service contract |
| 정기 점검 | Bảo trì định kỳ | Periodic inspection | Monthly or bi-monthly visit |
| 작업확인서 | Phiếu xác nhận công việc | Work confirmation | Ad-hoc service receipt |
| 계약서 | Hợp đồng | Contract | Rental / sale contract |
| 영수증 | Hóa đơn (thu tiền) | Receipt | Cash collection receipt |
| 출고서 | Phiếu xuất kho | Delivery slip | B2B device handoff |
| 납품서 | Phiếu giao hàng | Delivery / sales note | B2C universal slip |
| 세금계산서 | Hóa đơn GTGT | (e-)Tax invoice | B2B-only, Vietnamese eInvoice |
| 기사 | Kỹ thuật viên | Technician | Field installer / maintainer / collector — `TECHNICIAN` role |
| 사무실 직원 | Nhân viên văn phòng | Office staff | All HQ staff (`ADMIN` / `MANAGER` / `STAFF`); no department split |
| 관리자 | Quản trị viên | Admin | `ADMIN` — full system + user management |
| 매니저 | Quản lý | Manager | `MANAGER` — operations + price changes + tax invoice issuance + customer password reset |
| 직원 | Nhân viên | Staff | `STAFF` — day-to-day ops; sees all menus incl. sales + accounting |
| 고객 포털 | Cổng khách hàng | Customer portal | Mobile-first PWA at **`portal.seoulaqua.com.vn`** subdomain (A.10 client answer 2026-05-26; Phase 3.5+) |
| 선호 기사 | Kỹ thuật viên ưu tiên | Preferred technician | `Customer.preferredTechnicianId` — soft hint for scheduler (C.2 client answer 2026-05-26) |
| 주관 기사 / 협업 기사 | KTV chính / KTV phụ | Lead / collaborator technician | `Visit.leadTechnicianId` (required, primary responsibility) + `Visit.collaboratorTechnicianIds[]` (helpers). Payment + signature = lead only (K.3 client answer 2026-05-26) |
| 부록서 | Phụ lục hợp đồng | Contract Appendix | B2B amendment alternative — `Contract.parentContractId` + `Contract.amendmentRevision` instead of issuing new contract (B.2 + B.5 client answer 2026-05-26) |
| 임시 비밀번호 | Mật khẩu tạm thời | Temporary password | 10-char auto-generated, SMS-delivered, must change on first login |
| 서비스 요청 | Yêu cầu dịch vụ | Service request | Customer-submitted request (inspection / repair / replacement / relocation) — `ServiceRequest` entity |
| 현장 / 방문 | Lượt thăm | Visit | Single field call by a technician |
| 수금 | Thu tiền | Collection | Cash collection by technician |

## Known Issues / Gotchas (inherited from PMIS framework)

- `.env` passwords with `$` or `*` must be URL-encoded (`%24`, `%2A`)
- `PrismaPg({ connectionString })` fails with Supabase — must use `PrismaPg(pool)` with `pg.Pool` instance
- Next.js 16 deprecated `middleware.ts` — shows warning but still works. Middleware must skip `_next` and dot-containing paths
- All API fetch calls from client components MUST include `Authorization: Bearer ${accessToken}` header (get from `useAuth()`)
- `AuthProvider` uses `useLayoutEffect` to restore cached user from `sessionStorage` before paint — prevents blank sidebar on back/forward navigation
- `AuthGuard` uses `useSyncExternalStore` for hydration-safe server/client detection
- Login page forces logout on mount + clears all sessionStorage auth keys
- `npm run db:reset` deletes all data and re-seeds — **NEVER run on production** (always use `db:reset:dev`)
- Use the shared `<NumberInput>` component from `src/components/ui/number-input.tsx` for all numeric form fields — raw `<input type="number">` has a can't-clear-last-digit UX bug

## Seoul Aqua-specific Conventions (added during phases — initially empty)

- **Staff role hierarchy (3-tier + parallel)**: `ADMIN > MANAGER > STAFF` for HQ + `TECHNICIAN` parallel (field, mobile-first). No department roles (no SALES, no ACCOUNTANT — sales/accounting menus visible to all HQ users; sensitive ops gated by rank). Customer role is NOT in `StaffRole` enum — customers log in via `CustomerContact` + `CustomerSession`. See `docs/SPEC.md` §2.1 for the canonical permission matrix.

- **Customer two-contact model (1 + N)**: every `Customer` has exactly 1 `CONTRACT_PARTY` and 0..N `OPS_CONTACT`s. Each `CustomerContact` has independent `name · title · phone · email · language`. The CONTRACT_PARTY (in portal) and any MANAGER+ (in office app) can add/edit/delete OPS contacts. Exactly one OPS is marked `isPrimary=true` when any OPS exists. Outbound channel routing by role:
  - 계약서 · 세금계산서 · 법적 통보 → CONTRACT_PARTY (그의 언어로)
  - 방문 SMS · 영수증 · 정기점검표 · 일정 알림 → primary OPS_CONTACT (그의 언어로) — fallback CONTRACT_PARTY if no OPS
  - 미수금 독촉 → CONTRACT_PARTY + 모든 OPS_CONTACT CC
  - 모바일 "고객 전화" 기본 → primary OPS_CONTACT
  See `docs/SPEC.md` §3.3.1 and mockup screen 12 for the canonical UI.

- **Customer portal (Phase 3.5+)**: mobile-first PWA at **`portal.seoulaqua.com.vn`** subdomain (A.10 confirmed). Each `CustomerContact` with `portalEnabled=true` is a portal account. Phone-based login (`phone1`). Sign-up auto-triggered by contract activation or sale finalization — system generates a 10-char random password and bcrypt-hashes it; the plaintext comes back to the office screen once and is read out by phone (nothing is sent — see the 2026-09-25 bullet). First login forces password change (`mustChangePassword=true`). MANAGER+ can reset password anytime from 고객 수정. Separate JWT (`aud='customer'`) and separate `CustomerSession` table from staff sessions. Customer can submit `ServiceRequest`s — free types auto-create Visit, paid types route to office STAFF+ review.

- **Customer hierarchy — Customer > Site > Equipment (A.4 + A.8 confirmed 2026-05-26)**: B2C customers usually have no Sites (equipment + contacts attach directly to Customer). B2B customers usually have 1+ Sites for multi-building deployments. New Prisma `Site` model + `CustomerContact.scope` enum (`CUSTOMER` | `SITE`). CONTRACT_PARTY is always `scope=CUSTOMER`; OPS_CONTACT can be either. Visit reminders route to site-scoped Ops first, then customer-scoped Ops, then CONTRACT_PARTY. See `docs/SPEC.md` §3.2.1 + `docs/PROCESS_NOTES.md` §8.7.

- **Contract code format (B.2 confirmed 2026-05-26)**: B2C `HD-YYYYmmDD/SA-KH####` (e.g. `HD-20260526/SA-KH0001`). B2B `HD-YYYYmmDD/SA-{shortcode}` (e.g. `HD-20260526/SA-SHV`). B2B can use **Appendix** (parentContractId + amendmentRevision) instead of issuing new contracts when adding equipment. B2C amendments update price in-place + AuditLog; B2B amendments increment revision counter.

- **Equipment code format (A.3.1 revised 2026-09-07)**: `Equipment.assetCode` (장비코드 / 관리번호) is **`MAY-{NNNNNN}`** (e.g. `MAY-000001`) — a fixed `MAY-` prefix plus a 6-digit sequence **scoped to `modelId`**. Each model counts from `MAY-000001` independently, so **the code string is NOT table-wide unique**: model A and model B both have a `MAY-000001`. The unique thing is the pair `(modelId, assetCode)` — `@@unique([modelId, assetCode])`. Any lookup by code must carry the model too. The customer boundary is irrelevant: two customers on the same model take consecutive numbers off that model's single sequence. **Server-issued when the unit is assigned to a customer** — `customerId` is required, so registration is assignment — on every path (single `POST /api/equipment`, multi-line `POST /api/equipment/register`, bulk `POST /api/equipment/bulk-register`) via `src/lib/equipment/asset-code.ts`; no manual-entry mode, and immutable (`PATCH /api/equipment/:id` rejects it). Allocation takes a `pg_advisory_xact_lock` keyed on the model. Off-catalog units (`modelId = null`) share one sequence and are protected by that lock only — the composite unique can't constrain NULLs. Retired units keep their code (status change only, A.3). `serialNumber` is a separate non-unique field and no longer mirrors the code. Rows inserted outside the API (dev seed fixtures, legacy imports) are swept by `backfillMissingAssetCodes()` — `prisma/seed.ts` calls it at the end, and `scripts/backfill-asset-codes.ts` is the CLI for DBs you do not reseed (run it from a workstation; the container image has no `scripts/`). Superseded the 2026-09-04 `{modelCode}{YYMMDD}{NNNN}` global-unique rule; migration `20260907000000_equipment_asset_code_per_model` re-issues existing rows. See `docs/SPEC.md` §4.3.1.

- **Audit coverage rules (2026-09-24)**: `logAudit()` is called from the route or the service layer (`src/lib/{payments,visits,contracts,service-requests,...}/*.ts`) — a route with no `audit:` block usually delegates, so grep the workflow module before concluding something is unlogged. Anything that writes through **Prisma directly** must log explicitly: the CSV catalog import now emits one flattened `CATALOG_IMPORT` / `entityType: "CatalogImport"` row per upload (counts + the *names* created), and `prisma/seed.ts` / `reset.ts` / migrations stay deliberately unlogged. Soft-delete via PATCH must not log as a plain UPDATE — `EquipmentModel` picks `EQUIPMENT_MODEL_DEACTIVATE` / `_REACTIVATE` from the `isActive` transition, matching `*_DEACTIVATE` elsewhere. **Every action string a route emits needs a row in `src/lib/audit/labels.ts`**, or the screen renders an amber `(미등록)` badge that reads like the action was never recorded; `__tests__/unit/lib/audit/labels.test.ts` locks the emitted-code list, and a new `entityType` also needs `ENTITY_TYPE_OPTIONS` + `ACTIONS_BY_ENTITY` in `AuditFilters.tsx` plus `reports.audit.entityTypes.*` in all three message files. `before`/`after` are diffed **shallowly**, so flatten nested payloads before logging or the drawer shows raw JSON.

- **Product classification — 제품군 · 제품 유형 · 모델 · 부품 (2026-09-26, supersedes the 2026-09-24 single-제품군 rule)**: `ProductCategory` (제품군) stays the top classifier; **`ProductType` (제품 유형)** is new and belongs to **one or more** 제품군 (`ProductTypeCategory`). A model sits in **one or more** 제품군 (`EquipmentModelCategory`) and **0..1** 제품 유형 (`EquipmentModel.productTypeId`); when it has a type, **every 제품군 on the model must be one of the type's**. Consumables and accessories carry **0..N** 제품군 (`ConsumableCategory` / `AccessoryCategory`) for sorting and search **only** — tagging a part with a 제품군 never applies it to that 제품군's models; which parts a model uses is still `ConsumableOnModel` / `AccessoryOnModel`, and the normal workflow is ① register the filters (no model needed) → ② register the model → ③ attach them in the model form's 「필터 구성」. None of the "at least one" / subset rules fit a DB constraint, so every write goes through `src/lib/products/classification.ts` (`assertModelClassification`, `assertTypeKeepsModelCategories` — a type may not drop a 제품군 its models still use, 409). `EquipmentModel.categoryId` and `Consumable.categoryId` were **dropped** by migration `20260926000000_product_type_classification`, which first copies them into the join tables. List APIs flatten links to `categories: CategoryLite[]` + `categoryIds: string[]` via `CATEGORY_LINKS_SELECT` / `flattenCategories()`; audit rows carry `categoryIds` as a comma string because the drawer diffs shallowly. UI: 제품군 is picked with **`MultiCombobox`** (`src/components/ui/multi-combobox.tsx` — searchable, inline 「+ 추가」, disabled options, chips), 제품 유형 with the single `Combobox` + inline `ProductTypeQuickCreateModal`; in the model form the type list only shows types holding every chosen 제품군, and choosing a type disables 제품군 outside it. A 「제품 유형」 tab sits between 제품군 and 모델 on 제품 카탈로그. Catalog CSV: several 제품군 per model go in each `Category (EN/KO/VI)` cell joined by ` | `, positionally aligned (export writes it, import splits it). Render names with `pickCategoryName(cat, locale)`; `categoryAltNames()` supplies the other locales as the searchable `description`. VI label for 제품군 is **Nhóm sản phẩm**, for 제품 유형 **Loại sản phẩm** (the 제품군 tab used to say "Loại sản phẩm"). Esc inside a `Combobox` / `MultiCombobox` is caught on `window` in the capture phase so it closes only the dropdown, never the `Modal` around it.

- **Multi-technician visits (K.3 confirmed 2026-05-26)**: each Visit has one required `leadTechnicianId` (primary owner — handles payment, signature, work-confirmation PDF signoff) and 0..N optional `collaboratorTechnicianIds[]` (helpers — see visit on mobile queue as "Shared with you", contribute notes/photos, but cannot mark complete or accept payment). The previous `VisitTechnician` join table is deprecated; migration folds first row → lead, rest → collaborators.

- **Technician scheduling (C.1 + C.2 confirmed 2026-05-26)**: auto-recommend candidate, office confirms with one click. Ranking: (1) `Customer.preferredTechnicianId` if set + available; (2) region match via `Customer.preferredRegion` / `Site.region` vs `Technician.preferredRegion`; (3) daily load balance. Office can override anyone. **Map view deferred to Phase 7+ TODO** (C.5).

- **Notification providers (mock-first, Phase 3.5)**: Both SMS and Email use a factory + interface pattern with mock-first defaults. Env vars `SMS_PROVIDER` / `EMAIL_PROVIDER` choose between `mock` (default in dev/staging — `src/lib/sms/mock-client.ts` / `src/lib/email/mock-provider.ts`: console log + DB `*Log.status='MOCKED'`) and real adapters (`esms-client.ts`, `resend-client.ts` — populated when F.4 / F.7 / A.14 credentials arrive). Production flip is env-only — no code rewrite. **Phase 3.5 dev unblocked from eSMS Brandname 2-3 week approval lead-time.** SMS templates in `src/lib/notifications/templates/index.ts` keyed by `SMS_VISIT_REMINDER` / `SMS_SR_APPROVED` / `SMS_SR_REJECTED` / `SMS_PAYMENT_OVERDUE_FINAL` / `SMS_CONTRACT_RENEWAL_FINAL` (5 codes — the two credential-carrying ones were deleted 2026-09-25); email templates in `src/lib/email/templates.ts` (9 codes incl. multi-stage variants). Each has KO + VI + EN variants; recipient's `CustomerContact.language` selects. Verified eSMS rate: 830 VND/seg + 50K/mo per network maintenance (4 networks). Canonical bodies + char counts in `docs/DOCUMENT_TEMPLATES.md` §A (SMS) + §B (Email).

- **eSMS SMS live (2026-09-12)**: brandname **`SEOUL AQUA`** (note the space — not `SeoulAqua`) is approved with a funded prepaid balance. `SMS_PROVIDER=esms` posts to `SendMultipleMessage_V4_post_json` with `SmsType=2` from `src/lib/notifications/esms-client.ts`; env is `ESMS_API_KEY` / `ESMS_SECRET_KEY` / `ESMS_BRAND_NAME` / `ESMS_SANDBOX`. **`ESMS_SANDBOX` defaults to `1` outside production** — eSMS validates the request but delivers nothing and charges nothing. Sandbox does NOT check content registration, so only a live send reveals `CodeResult 146` (CSKH body not registered). Zalo ZNS is deliberately skipped (SMS-only decision 2026-09-12) even though the account has one ZNS template (TempID 601950). **Only `SMS_VISIT_REMINDER` has a registered body so far** — its text is fixed by the carrier approval (hotline `0768902009` hardcoded, no `[SeoulAqua]` prefix, accent-free Vietnamese for GSM-7, `{equipment}` ≤ 50 chars + `{datetime}` ≤ 40); no Korean body was registered, so `ko` contacts get the Vietnamese one. The other four SMS codes fail with 146 until ViHAT (`thaoltt@vihatgroup.com`) registers them. Fixed body text is 130 chars, leaving 30 for both variables before the message becomes 2 segments. Delivery history + per-row failure reason + resend live at `/o/admin/notification-logs` (ADMIN + MANAGER); `npx tsx scripts/esms-probe.ts <phone> [CODE]` checks which bodies the carrier accepts (sandbox by default, `ESMS_PROBE_LIVE=1` to bill a real send). **Full matrix measured live 2026-09-12** (8 templates × ko/vi/en, see `docs/SMS_TEMPLATE_REGISTRATION.md`): only `SMS_VISIT_REMINDER` is registered — its VI and EN bodies are approved, and `ko` passes only because it carries the VI text. The other templates return 146 ("Sai template Brandname CSKH") in every language, as does arbitrary text. Registration is per body, so each language needs its own approval. eSMS also records RequestIds for SANDBOX requests, so a sandbox rehearsal burns the ids a later live run needs (CodeResult 124) — `scripts/esms-probe.ts` varies its sample values per run to dodge that. Because of that, the manual sender on the delivery-log screen offers **no free-text box**: staff pick a registered template, fill its variables and choose recipients (`POST /api/admin/notification-logs/send`, multi-recipient, contacts each read in their own language, `hq_phone` always server-filled). A short-lived `SMS_ADHOC` free-text template existed on 2026-09-12 and was removed the same day once the live matrix proved unregistered bodies can never be delivered.

- **SMS content rules (ViHAT answer 2026-09-23)**: the carrier registers the **body text**, so every language of a template is a separate approval. ViHAT refused Korean outright (`Không hỗ trợ tiếng Hàn`), so **`smsBodies(vi, en)` in `templates/index.ts` points `ko` at the English string** — Korean-speaking contacts receive English SMS, while email keeps its Korean bodies. Because there is no Korean SMS body, `templateLocales()` offers SMS only `vi` + `en` on 알림 서식 and the manual sender, and `overrideLocaleFor()` makes a `ko` SMS send read the `en` override row (2026-09-25). Vietnamese is registered **accent-free**, and the bodies avoid `·` and `₫` too, so every SMS body is GSM-7 at one segment instead of UCS-2 at two. `sendNotification()` folds variable values through `toAsciiVi()` whenever the body is plain ASCII — a Vietnamese customer name would otherwise flip the whole message to UCS-2 and drift from the approved wording. The carrier also requires a **fixed registered link**, so bodies carry `soms.seoulaqua.com.vn` literally; there is no `{url}` variable in any SMS body. Status, per-language bodies and the submission letter live in `docs/SMS_TEMPLATE_REGISTRATION.md` (+ `.docx`).

- **No self-service password reset (2026-09-24)**: staff and customers both recover by phoning a human. Staff: `POST /api/users/[id]/password-reset` (ADMIN/MANAGER, strictly downward — see the 2026-09-25 hierarchy bullet) mints a 10-char temp password, returns the plaintext **in the response** for one-time on-screen display, sets `mustChangePassword=true`, clears the lockout counters and revokes every `Session`; it sends **nothing** — no SMS, no email — so the credential never reaches a delivery log. UI is the 「비밀번호 초기화」 button on 관리자 → 사용자 관리. Customers: MANAGER+ action, which since 2026-09-25 also sends nothing. Removed in the same change: `src/lib/auth/recovery.ts` (`normalizePhone` moved to `src/lib/auth/phone.ts`), `/api/auth/password-reset/{request,verify}`, `/api/portal/auth/password-reset`, the `/o/forgot-password` + `/[locale]/forgot-password` pages, the `SMS_STAFF_RESET_CODE` template, and the four `User.passwordReset*` columns (migration `20260924100000_drop_staff_password_recovery`). Audit action for the new path is `PASSWORD_RESET_BY_STAFF`; the three retired `PASSWORD_RESET_*` labels stay in `src/lib/audit/labels.ts` so pre-2026-09-24 rows still render. Login screens now show a static "관리자에게 연락하세요" hint instead of a link.

- **No credential ever leaves the building (2026-09-25)**: passwords are read out over the phone on every path, staff and customer alike. `SMS_PORTAL_WELCOME` + `SMS_PASSWORD_RESET` are **deleted** from `templates/index.ts`, and with them `CREDENTIAL_TEMPLATE_CODES` and the redaction it drove (mock-client console, `/o/admin/notification-logs` body column) and `router.ts`'s `NO_FALLBACK_TEMPLATES` — no template interpolates `{pwd}` any more, and a test in `__tests__/unit/lib/notifications/templates.test.ts` keeps it that way. `enablePortalAccount()` and `resetPortalPassword()` now return `plainPassword` for one-time on-screen display and dispatch only `EMAIL_PORTAL_WELCOME`, an activation notice that names the login ID and says staff will phone with the password. `POST /api/customers/:id/contacts/:contactId/{reset-password,enable-portal}` return `tempPassword`; the UI is a 「포털 비밀번호 초기화」 card on **고객 수정** (`/o/customers/:id/edit`, MANAGER+), listing the `portalEnabled` contacts. Same shape as the staff reset of 2026-09-24.

- **User management is strictly downward (2026-09-25)**: `outranks(caller, target)` in `src/lib/auth/roles.ts` is the single ladder for every verb — edit, re-role, phone change, password reset, deactivate — and `canResetPassword` now delegates to it. ADMIN reaches MANAGER/STAFF/TECHNICIAN, MANAGER reaches STAFF/TECHNICIAN, **nobody reaches a peer, a superior, or themselves**. Enforced in `/api/users` (POST, via `canAssignRole`), `/api/users/[id]` (PATCH + DELETE), `/api/users/[id]/phone` (self still allowed — it is your own number) and `/api/users/[id]/password-reset`; the 관리자 → 사용자 관리 screen gates its three row buttons on the same call and fills both role dropdowns from `getAssignableRoles()`. Consequence to know: an ADMIN can no longer create, edit or reset **another ADMIN**, so a second admin account is a seed/DB action, and there is no self-service profile edit anywhere.

- **판매원 is its own master (2026-09-25)**: `Customer.salesRepId` used to point at a `User`, so every active office account showed up in the 담당 판매원 picker whether they sell or not. It now points at the **`SalesRep`** table — `name` (required) + `phone` / `email` / `title` / `notes` / `isActive` — because most reps are outside agents with no login. Migration `20260925120000_sales_rep_master` creates the table, **clears every existing assignment** (client decision: the roster is entered fresh) and drops `User.isSalesRep`. Roster CRUD lives on `/o/sales-reps` next to the KPI cards: **adding is open to any office role** (whoever registers a customer may need the rep in the same breath, and the 고객 등록/수정 폼's 담당 판매원 Combobox has an inline 「+ 추가」 wired to the same `SalesRepModal`), while **editing and retiring are MANAGER+**. Delete is soft (`isActive=false`) — the FK is `onDelete: SetNull`, so a hard delete would silently blank who sold a past customer; `GET /api/sales-reps` hides inactive rows unless `?includeInactive=true`. Audit actions `SALES_REP_{CREATE,UPDATE,DEACTIVATE}` under entityType `SalesRep`.

- **데이터 이관 is ADMIN-only (2026-09-25)**: `/o/admin/migration` and all three of its APIs (`import` / `export` / `template`) reject MANAGER. One bad workbook rewrites the customer book, so the menu entry is `ADMIN_ONLY` in `sidebar.tsx` and the page itself renders `admin.migration.adminOnly` for anyone else who types the URL.

- **One host, three realms (2026-09-23)**: the staging box is now the production box, and everything is served from **`soms.seoulaqua.com.vn`** — customer portal at `/`, office at `/o`, field at `/f`. There is no separate portal deployment; `portal.seoulaqua.com.vn` is dead. Hosts come from `APP_HOST` / `PORTAL_URL` / `PORTAL_URL_HTTPS` in `src/lib/config/company.ts`. Caddy issues TLS from Let's Encrypt; its config must not carry `local_certs`, `default_sni` or a catch-all `:80` block or issuance silently falls back to self-signed. The Caddyfile is bind-mounted, so `deploy/scripts/deploy-staging.sh` reloads Caddy explicitly — `compose up -d` alone does not. `NEXT_PUBLIC_APP_URL` was deleted; nothing read it.

- **Bulk migration (2026-09-24)**: `/o/admin/migration` (ADMIN + MANAGER) loads existing customers, contracts, equipment and per-equipment consumables from one workbook. Two steps against the same file — `POST /api/admin/migration/import` with `mode=validate` reports, `mode=commit` writes — and the file is re-posted rather than parked server-side, so commit re-validates against the catalog as it stands. `src/lib/migration/plan.ts` is pure (sheets + an `ExistingSnapshot` in, plan + row issues out), so preview and commit cannot disagree; `apply.ts` writes the whole workbook in one transaction. Codes use the normal allocators (`KH#####`, `HD-…/SA-…`, per-model `MAY-######`) while the customer's own identifiers live in `Customer.legacyCode` / `Contract.legacyContractNumber` — that pair is what makes a re-upload skip instead of duplicate. Contracts land ACTIVE with a COMPLETED installation Visit at the real install date; **no contact is portal-enabled, so nothing notifies during a load**. `GET /api/admin/migration/export` writes the same workbook filled with live data, so a download can be corrected and handed straight back — the identifier columns carry the customer's own code when there is one and ours otherwise, and the importer accepts either as "already here". **The Equipment sheet's key is `modelCode|assetCode`, not the asset code alone**: the code sequence runs per model, so three different units legitimately carry `MAY-000001` and a bare asset code collides. A blank Model Code with a `Custom Description` creates an off-catalog unit. `src/lib/xlsx/read-workbook.ts` reads both `.xlsx` (ZIP walk + `node:zlib`) and the SpreadsheetML the template is written in, because Excel's Save and Save As disagree about the format. The template (`GET /api/admin/migration/template`) carries a bilingual Guide sheet and example rows whose every identifier starts with `SAMPLE-`, so an untouched file always fails validation instead of creating fictional customers.

- **Catalog purge workflow (2026-09-26)**: `.github/workflows/purge-catalog.yml` (manual `workflow_dispatch`, confirm phrase `PURGE CATALOG`) runs `deploy/scripts/purge-catalog.sql` on the production box after a fresh `pg_dump`: deletes every model, consumable and accessory, keeps users, brands, 제품군, 제품 유형 and all customer-side data. It **fails closed** — if any equipment, visit consumable log, order line or unit filter link still points at the catalog it raises before deleting anything, because those FKs are Restrict or SetNull and would either abort half-way or silently blank real records. Never wire it to a push or schedule.

- **Seeding is refused in production (2026-09-23)**: `prisma/seed.ts` and `prisma/reset.ts` exit non-zero when `NODE_ENV=production` unless `ALLOW_PROD_SEED=1` is set deliberately. The app container sets `NODE_ENV=production`, which is exactly where the `reseed-staging` workflow execs, so both of its modes now fail closed; that workflow's default was also flipped from `reset` to `seed`. Local development is unaffected.

- **Notification channel rule (SMS vs Email — Phase 3.5)**: Two-channel system. **SMS-only** for: security/credentials (password reset, portal welcome), ≤24h-window events (visit reminder D-1), service-request final decisions (approved-paid, rejected), and final-stage escalation (payment D+30, rental D-7). **Email-only** for: receipts, acknowledgments (SR received), early-stage reminders (filter due D-14, payment D+7/D+14, rental D-60/D-30), and detailed summaries with attachments (visit completed with signed PDF). **Hybrid (SMS+Email)** for: portal welcome (SMS short + email long-form), SR approved paid (SMS price+date + email itemized breakdown). Implemented in `src/lib/notifications/router.ts` selecting channel per template based on contact's `phone1`/`email` availability. Fallback rule: when chosen channel unavailable, fall back to the other; when both unavailable, log admin error. **Per-channel opt-out** via `CustomerContact.smsOptOut` + `emailOptOut` flags (F.3 confirmed); system messages (password reset, payment receipt) **ignore opt-out** — always delivered. Email provider = **Resend** (transactional, F.7 confirmed); <!-- portfolio:drop-start -->**vhost.vn Email Relay** (operational/tax-invoice/marketing, F.2 confirmed) — two separate rails.<!-- portfolio:drop-end --> <!-- portfolio:add-start **Resend** also covers operational/tax-invoice/marketing (single ESP). portfolio:add-end --> Email sender domain = `noreply@seoulaqua.com.vn` + Reply-To `cs@seoulaqua.com.vn` (A.14 confirmed) — requires DKIM/SPF/DMARC setup (1-day infra task before production launch). **Password reset is intentionally SMS-only** even when email present (an attacker with email-only access shouldn't receive the new password). Full matrix in `docs/DOCUMENT_TEMPLATES.md` §C; per-template bodies in §A (SMS) + §B (Email).

- **Future Vietnamese channels (Phase 8+ TODO, F.1 client request 2026-05-26)**: **Zalo OA** (Zalo Official Account messaging — alternative to SMS, cheaper and richer in VN) + **Zalo Mini App** (alternative customer portal UI hosted inside Zalo, very popular in Vietnam). Both deferred; placeholder in `docs/PROJECT_PLAN.md` Phase 8.

<!-- portfolio:add-start
- **Portfolio safety (mock-only)**: this is a portfolio mirror, NOT the production system. **No real SMS or email is ever sent.** `SMS_PROVIDER=mock` and `EMAIL_PROVIDER=mock` are the only supported values; the real eSMS/Resend adapters are intentionally not wired in this mirror. Mock providers log payloads to `console` + DB `*Log.status='MOCKED'`. Any production credentials would be ignored — see `src/lib/sms/mock-client.ts` / `src/lib/email/mock-provider.ts`.
portfolio:add-end -->

<!-- portfolio:drop-start -->
- **Hosting (H.1 confirmed 2026-05-26)**: v0 ships on Vercel + Supabase for fast iteration; **vhost.vn migration before production launch** (data residency requirement). Audit log retention 24 months (H.2); daily backup at VST 03:00 (H.3).
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
- **Hosting**: Production on Vercel + Supabase. Audit log retention 24 months (H.2); Supabase-managed daily backups.
portfolio:add-end -->

## Key Documents

- `docs/SPEC.md` — Project specification (read FIRST when joining)
- `docs/PROJECT_PLAN.md` — Phased delivery roadmap
- `docs/PROCESS_NOTES.md` — Distilled business processes (from client PDFs)
- `docs/DATA_MODEL_NOTES.md` — Schema derived from client CSVs
- `docs/DOCUMENT_TEMPLATES.md` — Paper-form to digital-flow mapping
- `docs/SMS_TEMPLATE_REGISTRATION.md` — Which SMS bodies eSMS has registered per language, measured by live send, plus the registration request to submit to ViHAT
- `docs/QUESTIONS.docx` — Open questions awaiting client answers
- `.claude/skills/DESIGN.md` — Design system (Intercom-frame + Seoul Aqua blue)
- `reference/` — Original client materials (PDFs + CSVs + logo) — READ-ONLY

@AGENTS.md
