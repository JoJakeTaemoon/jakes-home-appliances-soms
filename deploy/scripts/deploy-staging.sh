#!/usr/bin/env bash
# Seoul Aqua SOMS — host-side deploy entrypoint.
#
# Lives at /opt/seoul-aqua-soms/scripts/deploy-staging.sh on the server.
# Invoked by .github/workflows/deploy-staging.yml over SSH:
#
#   APP_IMAGE=ghcr.io/jojaketaemoon/seoulaqua-soms:main-<sha> \
#     bash /opt/seoul-aqua-soms/scripts/deploy-staging.sh
#
# Idempotent: re-running just re-pulls and re-applies. Migrations are
# `prisma migrate deploy` which is itself idempotent.

set -euo pipefail

cd /opt/seoul-aqua-soms

APP_IMAGE="${APP_IMAGE:-}"
if [[ -z "${APP_IMAGE}" ]]; then
  echo "[deploy] ERROR: APP_IMAGE must be set (e.g. ghcr.io/.../seoulaqua-soms:main-<sha>)" >&2
  exit 1
fi

echo "[deploy] Pinning compose to ${APP_IMAGE}"
# Replace the APP_IMAGE line inside /opt/seoul-aqua-soms/.env so docker
# compose picks the new tag on `up`. Use a temp file to keep the mode bits.
if grep -q '^APP_IMAGE=' .env; then
  sed -i.bak "s|^APP_IMAGE=.*|APP_IMAGE=${APP_IMAGE}|" .env
  rm -f .env.bak
else
  echo "APP_IMAGE=${APP_IMAGE}" >> .env
fi

echo "[deploy] Pulling images"
docker compose pull

echo "[deploy] Bringing up app + postgres + caddy"
docker compose up -d --remove-orphans

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
