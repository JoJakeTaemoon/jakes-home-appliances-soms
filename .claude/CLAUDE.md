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
- Hosting: **Vercel + Supabase** (initial); vhost.vn migration deferred

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
| `manuals` | User-Manual Writer | sonnet | Stage 7.5: per-phase, per-role user manuals (en + ko + vi) for ADMIN / OFFICE_MANAGER / SALES / TECHNICIAN / ACCOUNTANT |
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
8. **Manual gate**: every completed phase must update the affected role manuals under `docs/manuals/{en,ko,vi}/{admin,office_manager,sales,technician,accountant}.md` before the PR is opened

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
| 장비 | Thiết bị | Equipment | Customer's installed unit; e.g. 정수기 모델 PTS-2100 |
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
| 기사 | Kỹ thuật viên | Technician | Field installer / maintainer / collector |
| 사무실 직원 | Nhân viên văn phòng | Office staff | Coordinators, accountants, sales |
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

- (Will be filled in as we hit gotchas — e.g., customer-code generation policy, mobile sync rules, etc.)

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
