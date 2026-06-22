# syntax=docker/dockerfile:1.7
#
# Jake's Home Appliances SOMS — staging / self-hosted image.
# Multi-stage build that produces a slim runtime from Next.js' standalone
# output (see next.config.ts: output: "standalone").
#
# Build:   docker build -t jakeshomeapp-soms:local .
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
# 3. runtime-deps — production-only node_modules for ops tooling
# ─────────────────────────────────────────────────────────────────────────
# Next.js standalone ships a trimmed `node_modules` traced from app entry
# points only. That trim consistently misses dependencies of the prisma
# CLI (effect, @prisma/internals deps, etc.) — we kept hitting
# "Cannot find module 'X'" at `prisma migrate deploy` time.
#
# Fix: install ALL prod deps in a clean stage and copy them whole into
# runtime. Determinism > image-size optimization for staging.
FROM node:20-alpine AS runtime-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────
# 4. runtime — standalone output + public + prod node_modules + dev tools
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

# Standalone output ships the Next.js server entry + a trimmed
# node_modules. The trim follows app-runtime imports only and
# consistently misses dependencies of the prisma CLI, so we
# OVERRIDE its node_modules with a full prod tree from runtime-deps.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Full prod node_modules — replaces standalone's trimmed copy. Brings in
# every transitive dep of prisma, @prisma/client, bcryptjs, dotenv, pg,
# adapter-pg, … so `prisma migrate deploy` and the seed script don't
# trip on missing modules like `effect`, `@prisma/internals` deps, etc.
COPY --from=runtime-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Layer dev-only ops tooling on top:
#   - tsx + esbuild peer (for `prisma db seed` → `tsx prisma/seed.ts`)
#   - .bin/ binstubs (so `npx prisma|tsx` resolve without a registry hit)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

# Prisma generated client + schema + migrations + config (kept at root
# because prisma.config.ts is discovered from cwd at CLI invocation).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
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
