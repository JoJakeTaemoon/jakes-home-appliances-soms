# Seoul Aqua SOMS

**Service Operation Management System** for **CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)** — a Vietnam-based seller / renter / maintainer of water purifiers, air purifiers, bidets, and household water-treatment products.

Customer-centric ops platform for ~10 office staff + up to 80 field technicians. Multi-language (한국어 / Tiếng Việt / English), B2C + B2B, mobile-first for technicians, desktop-first for office staff.

> **Status:** Phase 7 (Offline queue + Reports + Dashboards + Polish) shipped 2026-05-27 — v1 scope complete. Phase 8+ (Zalo OA, real geocoded map, multi-tenant) deferred. See [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

---

## Documentation Map

Most of what's worth knowing lives in dedicated documents rather than this README. Pick your entry point:

### 📋 Product & business

| Document | What's inside |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Full product requirements — **86 use cases** + 16 mermaid diagrams |
| [docs/SPEC.md](docs/SPEC.md) | Canonical project specification, permission matrix, two-contact model, customer-portal scope |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Phased delivery roadmap (Phase 0–8+) with scope and exit gates |
| [docs/PROCESS_NOTES.md](docs/PROCESS_NOTES.md) | Distilled business processes (rental, sale, maintenance, collections) from client PDFs |
| [docs/DOCUMENT_TEMPLATES.md](docs/DOCUMENT_TEMPLATES.md) | Paper-form → digital-flow mapping + SMS/Email template catalogue |

### 🛠️ Engineering

| Document | What's inside |
|---|---|
| [AGENTS.md](AGENTS.md) | The 11-agent TDD pipeline + how to invoke each agent |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Project context loaded by every Claude Code session (conventions, gotchas, vocabulary) |
| [docs/URL_SCHEME.md](docs/URL_SCHEME.md) | Canonical URL structure — `/o/*` office, `/f/*` field, `/` customer, locale optional (defaults to `en` silently) |
| [docs/DATA_MODEL_NOTES.md](docs/DATA_MODEL_NOTES.md) | Schema rationale derived from client CSV samples |
| [docs/INFRA.md](docs/INFRA.md) | Self-hosted staging runbook (vhost.vn dry-run) — Docker Compose, systemd cron, pg_dump backup, deploy workflow |
| [.claude/skills/DESIGN.md](.claude/skills/DESIGN.md) | Design system: Intercom-frame + Seoul Aqua brand-blue |
| [.claude/skills/tdd-workflow.md](.claude/skills/tdd-workflow.md) | TDD methodology — RED → implement → GREEN gates |

### 👥 End-user manuals

Per-role manuals live under [`docs/manuals/`](docs/manuals/), one folder per locale:

| Locale | Path |
|---|---|
| English | [`docs/manuals/en/`](docs/manuals/en/) |
| 한국어 | [`docs/manuals/ko/`](docs/manuals/ko/) |
| Tiếng Việt | [`docs/manuals/vi/`](docs/manuals/vi/) |

Each folder holds five role guides: `admin.md`, `manager.md`, `staff.md`, `technician.md`, `customer.md`. The `manuals` agent refills the affected role × locale combinations every time a phase ships — see [AGENTS.md](AGENTS.md) for the manual-gate rule.

### 🎨 Visual references

- [docs/mockups/index.html](docs/mockups/index.html) — clickable mockup gallery from the design phase
- [reference/](reference/) — original client materials (process PDFs, paper forms, CSV samples, logo) — **READ-ONLY**

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript (strict) |
| UI | Custom components + Tailwind CSS v4 (no shadcn/ui, no native system dialogs) |
| Design System | Intercom-frame + Seoul Aqua brand-blue — see [DESIGN.md](.claude/skills/DESIGN.md) |
| Database | PostgreSQL + Prisma 7 ORM (`@prisma/adapter-pg` + `pg.Pool`) |
| Auth | Custom JWT (jose, Edge Runtime compatible); phone-based staff login |
| i18n | next-intl (ko / vi / en, switchable on any screen, default `vi`) |
| State | TanStack React Query + React Context |
| Validation | Zod + react-hook-form |
| Testing | Vitest + React Testing Library + Playwright |
| Notifications | SMS + Email mock-first (eSMS + Resend in production) |
<!-- portfolio:drop-start -->
| Hosting | Vercel + Supabase (initial); vhost.vn migration deferred |
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
| Hosting | Vercel + Supabase (production) |
portfolio:add-end -->

The framework, agent team, build pipeline, and conventions are **inherited from MegaDnC PMIS**. Domain code is rebuilt from scratch for Seoul Aqua.

---

## Getting Started

### Prerequisites

- Node.js 22 LTS
- PostgreSQL 15+ (or Supabase)

### Setup

```bash
npm install

cp .env.example .env
# Edit .env — set DATABASE_URL and DIRECT_URL
# NOTE: passwords with $ or * must be URL-encoded ($ → %24, * → %2A)

npx prisma generate
npx prisma migrate deploy
npx prisma db seed

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the locale prefix defaults to `vi`.

### Dev login credentials (after `db seed`)

Phone is the staff login key. Uniform dev password `12341234`.

| Role | Phone | Password |
|---|---|---|
| Admin | `012345678` | `12341234` |
| Manager | `0123456781` | `12341234` |
| Staff | `0123456782` | `12341234` |
| Technician 1 | `0123456783` | `12341234` |
| Technician 2 | `0123456784` | `12341234` |

Customer portal (`/portal/login`): `0901234567` / `portal1234` (mustChangePassword = true).

Forgot-password flow at [`/forgot-password`](http://localhost:3000/vi/forgot-password) sends a mock SMS code — when `SMS_PROVIDER=mock`, dispatches stream to your browser dev-tools console via `/api/dev/mock-sms/stream`.

---

## Repository Layout

```
seoul-aqua-soms/
├── .claude/
│   ├── agents/                  # 11 agents (orchestrator, designer, tdd-guide,
│   │                            #            frontend, backend, reviewer, git-flow,
│   │                            #            api-docs, qa, manuals, devops)
│   ├── skills/
│   │   ├── DESIGN.md            # Design system
│   │   └── tdd-workflow.md      # TDD methodology
│   ├── CLAUDE.md                # Project context loaded by every AI session
│   └── settings.json            # Per-project Claude Code settings
├── docs/
│   ├── PRD.md                   # Product requirements (86 use cases)
│   ├── SPEC.md                  # Project specification
│   ├── PROJECT_PLAN.md          # Phased delivery roadmap
│   ├── PROCESS_NOTES.md         # Distilled business processes
│   ├── DATA_MODEL_NOTES.md      # Schema rationale
│   ├── DOCUMENT_TEMPLATES.md    # Paper-form to digital mapping
│   ├── manuals/{en,ko,vi}/      # Per-role user manuals (5 roles × 3 locales)
│   └── mockups/index.html       # Clickable design mockups
├── reference/                   # READ-ONLY client materials
│   ├── process/                 # Business process PDFs
│   ├── forms/                   # Paper-form templates
│   ├── data/                    # CSV samples
│   └── brand/                   # Seoul Aqua logo
├── src/
│   ├── app/[locale]/            # Next.js App Router (auth, dashboard, mobile, portal, admin)
│   ├── app/api/                 # Route handlers (REST endpoints)
│   ├── lib/                     # auth, db, notifications, validators, reports, scheduler
│   ├── components/              # ui, layout, dev (mock-sms-logger)
│   ├── providers/               # AuthProvider, QueryProvider
│   ├── i18n/                    # next-intl routing + request
│   ├── messages/                # ko.json, vi.json, en.json
│   └── middleware.ts            # auth + i18n combined
├── prisma/
│   ├── schema.prisma            # Database schema
│   ├── migrations/              # SQL migration history
│   ├── seed.ts                  # Dev seed data
│   └── reset.ts                 # Dev reset helper
├── __tests__/
│   ├── unit/                    # Pure-function unit tests
│   ├── integration/             # API + DB integration tests (real Postgres)
│   ├── components/              # React component tests (jsdom)
│   └── e2e/                     # Playwright E2E (real browser)
├── public/
│   ├── logo/                    # Seoul Aqua logo (192/512 PNG icons + manifest)
│   └── fonts/                   # Pretendard variable font
├── scripts/                     # vercel-deploy, db-check, coverage report
└── .github/workflows/
    └── ci.yml                   # Postgres service + tsc + tests + build
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build (Prisma generate + DB check + Next.js build) |
| `npm test` | Run unit + integration + component tests (Vitest) |
| `npm run test:coverage` | Run tests with V8 coverage report |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run migration:dev` | Create + apply Prisma migration (`.env.dev`) |
| `npm run db:seed:dev` | Seed dev database |
| `npm run db:reset:dev` | Wipe + re-seed dev database |
| `npm run vercel:deploy` | One-shot deploy to Vercel |

> **⚠️ DANGER:** `npm run db:reset` (no `:dev`) wipes the **production** Supabase DB. Always use `:dev`.

---

## Agent Team

This project uses an 11-agent TDD pipeline. Full agent table, model assignments, and pipeline rules are in [AGENTS.md](AGENTS.md). One-line summary:

> User Request → orchestrator → git-flow(START) → designer → tdd-guide(RED) → frontend / backend → tdd-guide(GREEN) → reviewer + api-docs → qa → manuals → git-flow(END)

Invoke via:

```
@orchestrator Phase 1 — Foundation을 TDD로 진행해주세요
```

---

## License

Private. All rights reserved.
