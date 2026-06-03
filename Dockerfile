# syntax=docker/dockerfile:1.7
#
# Seoul Aqua SOMS — staging / self-hosted image.
# Multi-stage build that produces a slim runtime from Next.js' standalone
# output (see next.config.ts: output: "standalone").
#
# Build:   docker build -t seoulaqua-soms:local .
# Run:     docker compose up app  (see docker-compose.yml for the full stack)

# ─────────────────────────────────────────────────────────────────────────
# 1. deps — npm ci once, cached by package*.json hash
# ─────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Prisma + bcryptjs need a few native bits on Alpine
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────
# 2. builder — next build with standalone output
# ─────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

# Carry node_modules forward instead of re-installing
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# scripts/check-db-connection.ts runs as part of `npm run build` and refuses
# to continue if the DB is unreachable. The build doesn't actually need a
# DB (next build is pure), so skip the check — staging will run real
# migrations after the image starts.
ENV SKIP_DB_CHECK=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────
# 3. runtime — only the standalone output + public + Prisma engine
# ─────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl curl tini \
  && addgroup -S -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output already includes a trimmed node_modules tree.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma + tooling needed at runtime for `npx prisma migrate deploy` and
# `npx prisma db seed`. The standalone tracer only follows imports made
# from app-runtime code, so anything used exclusively by the CLI or the
# seed script must be COPY'd explicitly.
#
# Prisma v7 (with `output = "../src/generated/prisma"` in schema.prisma):
#   - generated client lives at `src/generated/prisma/`, NOT
#     `node_modules/.prisma` — that directory is never created
#   - the prisma CLI (`node_modules/prisma`) requires the FULL `@prisma/*`
#     org (engines, fetch-engine, get-platform, internals, …) — copying
#     only `@prisma/client` makes `prisma migrate deploy` fail with
#     "Cannot find module '@prisma/engines'"
#   - seed.ts uses a relative import `../src/generated/prisma/client`
#     so the generated directory must exist on disk at runtime
#   - `prisma.config.ts` declares the seed command + datasource URL —
#     prisma CLI loads it from the working directory
#
# tsx (for `prisma db seed` → `tsx prisma/seed.ts`):
#   - depends on `esbuild` (declared as a peer) and the platform-specific
#     `@esbuild/linux-*` package — copy both or tsx errors with
#     "Cannot find package 'esbuild'"
#
# `node_modules/.bin/` carries the symlinks `npx` resolves — without it
# `npx prisma` falls back to a registry install in the container and
# fails (offline + read-only fs).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# tsx + esbuild peer for `prisma db seed` → `tsx prisma/seed.ts`
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv-cli ./node_modules/dotenv-cli
# Binstubs so `npx prisma` / `npx tsx` resolve without a network hit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3000

# Healthcheck — the /api/health route below answers 200 once Prisma can ping
# the DB. docker-compose uses this to gate `caddy` startup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# tini reaps zombies + forwards SIGTERM cleanly so Next.js can flush requests.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
