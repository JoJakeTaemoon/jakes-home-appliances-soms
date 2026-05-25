#!/usr/bin/env bash
# vercel-deploy.sh — bundles the "vercel 배포" procedure into one command.
#
# Steps:
#   1. Pre-flight checks (clean tree, on master, in sync with origin)
#   2. Bump minor version in package.json on master
#   3. Reset Supabase production DB + run seed (writes seed files under ./uploads/)
#   4. Commit version bump on master + push origin/master
#   5. Force-sync deploy branch to master + uncomment /uploads in .gitignore
#      + commit the seeded ./uploads tree + force-push origin/deploy
#   6. Return to master (working tree auto-restores: .gitignore back to normal,
#      uploads/ back to gitignored)
#
# Usage:
#   npm run vercel:deploy
#
# IMPORTANT — this resets your Supabase production database. Make sure that is
# truly what you want before running. The Prisma CLI safety gate will trigger
# when run by AI agents (Claude Code etc.); see README for the consent flag.

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
red()    { printf '\033[31m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
bold()   { printf '\033[1m%s\033[0m\n' "$1"; }

step() { bold ""; bold "▶ $1"; }
ok()   { green "  ✓ $1"; }
warn() { yellow "  ⚠ $1"; }
fail() { red   "  ✗ $1"; exit 1; }

# ── 1. Pre-flight ───────────────────────────────────────────────────────────
step "1/5  Pre-flight checks"

if [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree is dirty. Commit or stash before deploying."
fi
ok "Working tree clean"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "master" ]]; then
  warn "Not on master (currently on '$CURRENT_BRANCH'). Continuing anyway — the deploy branch will be reset to '$CURRENT_BRANCH'."
fi

git fetch origin --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/"$CURRENT_BRANCH" 2>/dev/null || echo none)" ]]; then
  warn "Local '$CURRENT_BRANCH' differs from origin/$CURRENT_BRANCH. Make sure you intend to push the local state."
fi
ok "Fetched origin"

# ── 2. Bump version ─────────────────────────────────────────────────────────
step "2/5  Bumping package.json version"

OLD_VERSION=$(node -p "require('./package.json').version")
NEW_VERSION=$(node -e "
  const v = require('./package.json').version.split('.').map(Number);
  v[2] = (v[2] ?? 0) + 1;
  console.log(v.join('.'));
")
# npm version --no-git-tag-version edits package.json + package-lock.json without committing/tagging.
npm version --no-git-tag-version "$NEW_VERSION" >/dev/null
ok "$OLD_VERSION → $NEW_VERSION"

# ── 3. Reset Supabase + seed ────────────────────────────────────────────────
step "3/5  Resetting Supabase production DB + running seed"
warn "This drops every table in the production database. ./uploads/ will be repopulated from the sample assets."
warn "Connection: $(grep -E '^DATABASE_URL' .env 2>/dev/null | sed -E 's|://([^:]+):[^@]+@|://\1:***@|' || echo '(missing .env)')"

# .env (not .env.dev) is the production connection for Supabase.
# Prisma 7 dropped the implicit seed from `migrate reset` (and removed the
# `--skip-seed` flag entirely — passing it errors). `prisma db seed` must be
# invoked as its own step; otherwise the DB ships empty and every login
# 401s. Two earlier deploys actually shipped that way before we caught it.
npx prisma migrate reset --force
ok "Schema reset (migrations re-applied)"

npx prisma db seed
ok "Seed executed"

# Verify the seed actually populated the User table. If the seed ran against
# the wrong DB (e.g. stale credentials), or errored partway, the rest of the
# deploy would still succeed but production would 401 on every login. Fail
# fast here instead.
SEED_USER_COUNT=$(npx tsx scripts/check-seed.ts 2>&1 | grep -E "^user count:" | awk '{print $3}')
if [[ -z "$SEED_USER_COUNT" || "$SEED_USER_COUNT" == "0" ]]; then
  fail "Seed verification failed: User table is empty (count=$SEED_USER_COUNT). DB may be unreachable or seed errored — check .env credentials + retry."
fi
ok "Seed verification: $SEED_USER_COUNT users present"

if [[ ! -d "uploads" ]]; then
  fail "Expected ./uploads/ to exist after seed but it doesn't. Aborting."
fi
SEED_FILE_COUNT=$(find uploads -type f | wc -l | tr -d ' ')
ok "Seed wrote $SEED_FILE_COUNT files under ./uploads/"

# ── 4. Commit version bump on master + push ────────────────────────────────
step "4/5  Committing version bump on $CURRENT_BRANCH"

git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"
git push origin "$CURRENT_BRANCH"
ok "Pushed origin/$CURRENT_BRANCH"

# ── 5. Sync deploy branch + push ───────────────────────────────────────────
step "5/5  Building deploy branch + pushing"

# Local deploy may or may not exist. Either way, point it at the current HEAD
# (which is the version-bumped commit on master).
if git rev-parse --verify deploy >/dev/null 2>&1; then
  git branch -f deploy HEAD
else
  git branch deploy HEAD
fi
git checkout deploy >/dev/null

# Comment out the /uploads exclusion so the seeded sample files become trackable.
# Pure portable sed (BSD + GNU) — backup file then remove it.
sed -i.bak 's|^/uploads$|# /uploads (vercel deploy: temporarily tracked)|' .gitignore
rm -f .gitignore.bak
ok "Commented out /uploads in .gitignore"

git add -A
git commit -m "deploy: bundle seeded ./uploads for $NEW_VERSION"
git push origin deploy --force-with-lease
ok "Pushed origin/deploy"

# ── Cleanup: back to original branch ───────────────────────────────────────
git checkout "$CURRENT_BRANCH" >/dev/null
ok "Returned to $CURRENT_BRANCH (.gitignore back to normal, uploads/ back to gitignored)"

bold ""
green "🚀 Deploy complete. Vercel should pick up origin/deploy and build $NEW_VERSION."
