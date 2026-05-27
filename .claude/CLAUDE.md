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

- **Customer portal (Phase 3.5+)**: mobile-first PWA at **`portal.seoulaqua.com.vn`** subdomain (A.10 confirmed). Each `CustomerContact` with `portalEnabled=true` is a portal account. Phone-based login (`phone1`). Sign-up auto-triggered by contract activation or sale finalization — system generates 10-char random password, bcrypt-hashes, and sends `SMS_PORTAL_WELCOME`. First login forces password change (`mustChangePassword=true`). MANAGER+ can reset password anytime (`SMS_PASSWORD_RESET` queued). Separate JWT (`aud='customer'`) and separate `CustomerSession` table from staff sessions. Customer can submit `ServiceRequest`s — free types auto-create Visit, paid types route to office STAFF+ review.

- **Customer hierarchy — Customer > Site > Equipment (A.4 + A.8 confirmed 2026-05-26)**: B2C customers usually have no Sites (equipment + contacts attach directly to Customer). B2B customers usually have 1+ Sites for multi-building deployments. New Prisma `Site` model + `CustomerContact.scope` enum (`CUSTOMER` | `SITE`). CONTRACT_PARTY is always `scope=CUSTOMER`; OPS_CONTACT can be either. Visit reminders route to site-scoped Ops first, then customer-scoped Ops, then CONTRACT_PARTY. See `docs/SPEC.md` §3.2.1 + `docs/PROCESS_NOTES.md` §8.7.

- **Contract code format (B.2 confirmed 2026-05-26)**: B2C `HD-YYYYmmDD/SA-KH####` (e.g. `HD-20260526/SA-KH0001`). B2B `HD-YYYYmmDD/SA-{shortcode}` (e.g. `HD-20260526/SA-SHV`). B2B can use **Appendix** (parentContractId + amendmentRevision) instead of issuing new contracts when adding equipment. B2C amendments update price in-place + AuditLog; B2B amendments increment revision counter.

- **Multi-technician visits (K.3 confirmed 2026-05-26)**: each Visit has one required `leadTechnicianId` (primary owner — handles payment, signature, work-confirmation PDF signoff) and 0..N optional `collaboratorTechnicianIds[]` (helpers — see visit on mobile queue as "Shared with you", contribute notes/photos, but cannot mark complete or accept payment). The previous `VisitTechnician` join table is deprecated; migration folds first row → lead, rest → collaborators.

- **Technician scheduling (C.1 + C.2 confirmed 2026-05-26)**: auto-recommend candidate, office confirms with one click. Ranking: (1) `Customer.preferredTechnicianId` if set + available; (2) region match via `Customer.preferredRegion` / `Site.region` vs `Technician.preferredRegion`; (3) daily load balance. Office can override anyone. **Map view deferred to Phase 7+ TODO** (C.5).

- **Notification providers (mock-first, Phase 3.5)**: Both SMS and Email use a factory + interface pattern with mock-first defaults. Env vars `SMS_PROVIDER` / `EMAIL_PROVIDER` choose between `mock` (default in dev/staging — `src/lib/sms/mock-client.ts` / `src/lib/email/mock-provider.ts`: console log + DB `*Log.status='MOCKED'`) and real adapters (`esms-client.ts`, `resend-client.ts` — populated when F.4 / F.7 / A.14 credentials arrive). Production flip is env-only — no code rewrite. **Phase 3.5 dev unblocked from eSMS Brandname 2-3 week approval lead-time.** SMS templates in `src/lib/sms/templates.ts` keyed by `SMS_PORTAL_WELCOME` / `SMS_PASSWORD_RESET` / `SMS_VISIT_REMINDER` / `SMS_SR_APPROVED` / `SMS_SR_REJECTED` / `SMS_PAYMENT_OVERDUE_FINAL` / `SMS_CONTRACT_RENEWAL_FINAL` (7 codes); email templates in `src/lib/email/templates.ts` (9 codes incl. multi-stage variants). Each has KO + VI + EN variants; recipient's `CustomerContact.language` selects. Verified eSMS rate: 830 VND/seg + 50K/mo per network maintenance (4 networks). Canonical bodies + char counts in `docs/DOCUMENT_TEMPLATES.md` §A (SMS) + §B (Email).

- **Notification channel rule (SMS vs Email — Phase 3.5)**: Two-channel system. **SMS-only** for: security/credentials (password reset, portal welcome), ≤24h-window events (visit reminder D-1), service-request final decisions (approved-paid, rejected), and final-stage escalation (payment D+30, rental D-7). **Email-only** for: receipts, acknowledgments (SR received), early-stage reminders (filter due D-14, payment D+7/D+14, rental D-60/D-30), and detailed summaries with attachments (visit completed with signed PDF). **Hybrid (SMS+Email)** for: portal welcome (SMS short + email long-form), SR approved paid (SMS price+date + email itemized breakdown). Implemented in `src/lib/notifications/router.ts` selecting channel per template based on contact's `phone1`/`email` availability. Fallback rule: when chosen channel unavailable, fall back to the other; when both unavailable, log admin error. **Per-channel opt-out** via `CustomerContact.smsOptOut` + `emailOptOut` flags (F.3 confirmed); system messages (password reset, payment receipt) **ignore opt-out** — always delivered. Email provider = **Resend** (transactional, F.7 confirmed); <!-- portfolio:drop-start -->**vhost.vn Email Relay** (operational/tax-invoice/marketing, F.2 confirmed) — two separate rails.<!-- portfolio:drop-end --> <!-- portfolio:add-start **Resend** also covers operational/tax-invoice/marketing (single ESP). portfolio:add-end --> Email sender domain = `noreply@seoulaqua.com.vn` + Reply-To `cs@seoulaqua.com.vn` (A.14 confirmed) — requires DKIM/SPF/DMARC setup (1-day infra task before production launch). **Password reset is intentionally SMS-only** even when email present (an attacker with email-only access shouldn't receive the new password). Full matrix in `docs/DOCUMENT_TEMPLATES.md` §C; per-template bodies in §A (SMS) + §B (Email).

- **Future Vietnamese channels (Phase 8+ TODO, F.1 client request 2026-05-26)**: **Zalo OA** (Zalo Official Account messaging — alternative to SMS, cheaper and richer in VN) + **Zalo Mini App** (alternative customer portal UI hosted inside Zalo, very popular in Vietnam). Both deferred; placeholder in `docs/PROJECT_PLAN.md` Phase 8.

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
- `docs/QUESTIONS.docx` — Open questions awaiting client answers
- `.claude/skills/DESIGN.md` — Design system (Intercom-frame + Seoul Aqua blue)
- `reference/` — Original client materials (PDFs + CSVs + logo) — READ-ONLY

@AGENTS.md
