# Seoul Aqua SOMS

**Service Operation Management System** for **CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)** — a Vietnam-based seller / renter / maintainer of water purifiers, air purifiers, bidets, and household water-treatment products.

Customer-centric ops platform for ~10 office staff + up to 80 field technicians. Multi-language (한국어 / Tiếng Việt / English), B2C + B2B, mobile-first for technicians.

> **Status:** Bootstrap. Domain code not yet written. Read `docs/SPEC.md` and `docs/PROJECT_PLAN.md` to start.

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Custom components + Tailwind CSS v4 |
| Design System | Intercom-frame + Seoul Aqua brand-blue (see `.claude/skills/DESIGN.md`) |
| Database | PostgreSQL + Prisma 7 ORM (`@prisma/adapter-pg` + `pg.Pool`) |
| Auth | Custom JWT (jose, Edge Runtime compatible) |
| i18n | next-intl (ko / vi / en, switchable on any screen) |
| State | TanStack React Query + React Context |
| Validation | Zod + react-hook-form |
| Testing | Vitest + React Testing Library + Playwright |
<!-- portfolio:drop-start -->
| Hosting | Vercel + Supabase (initial); vhost.vn migration deferred |
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
| Hosting | Vercel + Supabase (production) |
portfolio:add-end -->

The framework, agent team, build pipeline, and conventions are **inherited from MegaDnC PMIS** (`/Users/jake/Works/MegaDnC/mega_dnc_pmis`). Domain code is rebuilt from scratch for Seoul Aqua.

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

Open [http://localhost:3000](http://localhost:3000).

## Repository Layout

```
seoul-aqua-soms/
├── .claude/
│   ├── agents/          # 11 agents (orchestrator, designer, tdd-guide, frontend, backend,
│   │                    #            reviewer, git-flow, api-docs, qa, manuals, devops)
│   ├── skills/
│   │   ├── DESIGN.md    # Intercom-frame + Seoul Aqua blue
│   │   └── tdd-workflow.md
│   ├── CLAUDE.md        # Project context (load FIRST in a new session)
│   └── settings.json    # Per-project Claude Code settings
├── docs/
│   ├── SPEC.md                # Project specification
│   ├── PROJECT_PLAN.md        # Phased delivery roadmap
│   ├── PROCESS_NOTES.md       # Business processes (distilled from client PDFs)
│   ├── DATA_MODEL_NOTES.md    # Schema derived from client CSV samples
│   ├── DOCUMENT_TEMPLATES.md  # Paper-form to digital-flow mapping
│   ├── QUESTIONS.docx         # Open questions for the client
│   ├── QUESTIONS.md           # Markdown twin of QUESTIONS.docx for git-diff
│   └── manuals/{en,ko,vi}/    # Per-role user manuals (filled in as phases ship)
├── reference/                 # Raw client materials — READ-ONLY
│   ├── process/               # 2 process PDFs
│   ├── forms/                 # 10 paper-form templates (PDF)
│   ├── data/                  # 7 CSV samples
│   └── brand/                 # Seoul Aqua logo
├── src/
│   ├── app/                   # Next.js App Router (domain routes added per phase)
│   ├── lib/                   # auth, db, api helpers
│   ├── components/            # ui, layout, notifications
│   ├── providers/             # AuthProvider, QueryProvider, ThemeProvider
│   ├── i18n/                  # next-intl routing + request
│   ├── messages/              # ko.json, en.json, vi.json
│   └── middleware.ts          # auth + i18n combined middleware
├── prisma/
│   ├── schema.prisma          # Seoul Aqua entities (built per phase)
│   ├── seed.ts                # Default admin + sample data
│   └── reset.ts               # Dev reset helper
├── public/
│   ├── logo/                  # Seoul Aqua logo
│   └── fonts/PretendardVariable.woff2
├── scripts/                   # vercel-deploy, db-check, coverage report
├── __tests__/
│   └── setup-node.ts          # Vitest setup (auto-mocks action-log)
└── .github/workflows/
    └── qa-prod.yml            # Nightly QA against production
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build (Prisma generate + DB check + Next.js build) |
| `npm test` | Run unit/component tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run migration:dev` | Create + apply Prisma migration (`.env.dev`) |
| `npm run db:seed:dev` | Seed dev database |
| `npm run db:reset:dev` | Wipe + re-seed dev database |
| `npm run vercel:deploy` | One-shot deploy to Vercel (see `scripts/vercel-deploy.sh`) |

> **⚠️ DANGER:** `npm run db:reset` (no `:dev`) wipes the **production** Supabase DB. Always use `:dev`.

## Agent Team

This project uses the same 11-agent TDD pipeline as MegaDnC PMIS. See `.claude/CLAUDE.md` for the full agent table and TDD rules. Invoke via:

```
@orchestrator Phase 1 — Foundation을 TDD로 진행해주세요
```

## License

Private. All rights reserved.
