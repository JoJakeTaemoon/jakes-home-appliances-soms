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

# Prisma client + migrations + seed are needed at runtime for
# `npx prisma migrate deploy` and `npx prisma db seed`. The standalone
# output ships the @prisma/client module but not the migrations.
#
# Prisma v7 (with `output = "../src/generated/prisma"` in schema.prisma):
#   - generated client lives at `src/generated/prisma/`, NOT
#     `node_modules/.prisma` — that directory is never created
#   - `@prisma/client` package is still present (and listed in deps) so
#     it ships; the standalone tracer covers app-side usage anyway
#   - seed.ts uses a relative import `../src/generated/prisma/client`
#     so the generated directory must exist on disk at runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# tsx is required to execute prisma/seed.ts (see prisma.seed in package.json)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv-cli ./node_modules/dotenv-cli
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
