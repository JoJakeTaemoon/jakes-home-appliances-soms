#!/usr/bin/env bash
# Jake's Home Appliances SOMS — host-side deploy entrypoint.
#
# Lives at /opt/jakes-home-appliances-soms/scripts/deploy-staging.sh on the server.
# Invoked by .github/workflows/deploy-staging.yml over SSH:
#
#   APP_IMAGE=ghcr.io/jojaketaemoon/jakeshomeapp-soms:main-<sha> \
#     bash /opt/jakes-home-appliances-soms/scripts/deploy-staging.sh
#
# Idempotent: re-running just re-pulls and re-applies. Migrations are
# `prisma migrate deploy` which is itself idempotent.

set -euo pipefail

cd /opt/jakes-home-appliances-soms

APP_IMAGE="${APP_IMAGE:-}"
if [[ -z "${APP_IMAGE}" ]]; then
  echo "[deploy] ERROR: APP_IMAGE must be set (e.g. ghcr.io/.../jakeshomeapp-soms:main-<sha>)" >&2
  exit 1
fi

echo "[deploy] Pinning compose to ${APP_IMAGE}"
# Replace the APP_IMAGE line inside /opt/jakes-home-appliances-soms/.env so docker
# compose picks the new tag on `up`. Use a temp file to keep the mode bits.
if grep -q '^APP_IMAGE=' .env; then
  sed -i.bak "s|^APP_IMAGE=.*|APP_IMAGE=${APP_IMAGE}|" .env
  rm -f .env.bak
else
  echo "APP_IMAGE=${APP_IMAGE}" >> .env
fi

echo "[deploy] Reclaiming disk before pull (old main-<sha> images accumulate)"
# Old tagged images (main-<sha>) are not dangling, so -a is required to
# remove them. Docker protects images referenced by running containers, so
# the currently-live image survives. Pruning BEFORE pull frees space first,
# which is what auto-recovers a box that is already full. || true keeps a
# prune miss from aborting the deploy under `set -euo pipefail`.
docker image prune -af || true
docker builder prune -af || true

echo "[deploy] Pulling images"
docker compose pull

echo "[deploy] Bringing up app + postgres + caddy"
docker compose up -d --remove-orphans

echo "[deploy] Post-up prune of images the new tag replaced (best-effort)"
docker image prune -af || true

echo "[deploy] Waiting for app to become healthy"
for i in $(seq 1 30); do
  if docker compose ps app --format '{{.Health}}' | grep -q '^healthy$'; then
    echo "[deploy] App healthy after ${i} × 5s"
    break
  fi
  sleep 5
done

echo "[deploy] Applying Prisma migrations"
docker compose exec -T app npx prisma migrate deploy

echo "[deploy] Done — current /api/health:"
curl -fsS -k https://localhost/api/health | head -c 500
echo
