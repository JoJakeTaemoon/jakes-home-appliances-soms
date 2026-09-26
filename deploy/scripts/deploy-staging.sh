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

# Pruning before the pull used to be unconditional, and it is why deploys
# started timing out: `-a` drops every image not currently running, including
# the base layers the incoming image shares with the outgoing one, so each
# deploy re-downloaded the whole thing over the link to the server. The
# post-deploy prune below reclaims the same space without costing a full
# download. Keep the pre-pull prune only for the case it was written for —
# a box already too full to receive an image.
AVAIL_GB=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
if [ "${AVAIL_GB:-99}" -lt 10 ]; then
  echo "[deploy] Only ${AVAIL_GB}GB free — pruning before pull to make room"
  docker image prune -af || true
  docker builder prune -af || true
else
  echo "[deploy] ${AVAIL_GB}GB free — keeping the layer cache for a faster pull"
fi

echo "[deploy] Pulling images"
docker compose pull

echo "[deploy] Bringing up app + postgres + caddy"
docker compose up -d --remove-orphans

# The Caddyfile is bind-mounted, so `up -d` leaves caddy untouched when only
# that file changed — it has to be told to pick the file up.
#
# `caddy reload` is not the way to do it here: the Caddyfile sets `admin off`,
# so there is no admin API on :2019 for reload to POST to, and it exits 1.
# Validate the config first (that works without the admin API) so a bad file
# fails the deploy before the proxy is touched, then bounce the container.
echo "[deploy] Validating Caddy config"
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile

echo "[deploy] Restarting Caddy to pick up the config"
docker compose restart caddy

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

# Ask the app container directly rather than going through Caddy. Since the
# domain switch dropped `local_certs`, Caddy only holds a certificate for
# soms.jakeshomeappliances.com.vn, so `curl -k https://localhost` gets a TLS alert
# (no policy matches that SNI) and `-f` takes the whole deploy down *after*
# the migrations already ran. The public TLS path is covered by the
# workflow's own smoke-check step, which retries against the real name.
echo "[deploy] Done — current /api/health:"
docker compose exec -T app curl -fsS --max-time 10 http://127.0.0.1:3000/api/health | head -c 500
echo
