#!/usr/bin/env bash
# Jake's Home Appliances SOMS — nightly pg_dump backup.
#
# Driven by jakes-home-appliances-backup.timer (02:30 VST). Lives at
#   /opt/jakes-home-appliances-soms/scripts/backup.sh
# on the server (copied there by deploy-staging.sh).
#
# Writes a gzipped dump and prunes anything older than 7 days. Logs go to
# the systemd journal (journalctl -u jakes-home-appliances-backup).
#
# Manual run:  sudo systemctl start jakes-home-appliances-backup.service

set -euo pipefail

BACKUP_DIR=/opt/jakes-home-appliances-soms/backups
RETENTION_DAYS=7
TS=$(date +%Y%m%d-%H%M%S)
OUT="${BACKUP_DIR}/jakes-home-appliances-${TS}.sql.gz"

# Postgres credentials come from the same .env the app reads.
# shellcheck disable=SC1091
source /opt/jakes-home-appliances-soms/.env

mkdir -p "${BACKUP_DIR}"

echo "[backup] Dumping ${POSTGRES_DB:-soms} → ${OUT}"
docker compose -f /opt/jakes-home-appliances-soms/docker-compose.yml exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-privileges \
  -U "${POSTGRES_USER:-soms}" "${POSTGRES_DB:-soms}" \
  | gzip -9 > "${OUT}"

# Refuse a 0-byte dump — points at a broken pipe or auth failure
if [[ ! -s "${OUT}" ]]; then
  echo "[backup] ERROR: dump file is empty — failing the job" >&2
  rm -f "${OUT}"
  exit 1
fi

SIZE=$(du -h "${OUT}" | cut -f1)
echo "[backup] Wrote ${OUT} (${SIZE})"

echo "[backup] Pruning dumps older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'jakes-home-appliances-*.sql.gz' \
  -mtime "+${RETENTION_DAYS}" -delete -print
