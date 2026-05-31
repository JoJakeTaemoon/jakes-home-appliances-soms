#!/usr/bin/env bash
# Seoul Aqua SOMS — nightly pg_dump backup.
#
# Driven by seoul-aqua-backup.timer (02:30 VST). Lives at
#   /opt/seoul-aqua-soms/scripts/backup.sh
# on the server (copied there by deploy-staging.sh).
#
# Writes a gzipped dump and prunes anything older than 7 days. Logs go to
# the systemd journal (journalctl -u seoul-aqua-backup).
#
# Manual run:  sudo systemctl start seoul-aqua-backup.service

set -euo pipefail

BACKUP_DIR=/opt/seoul-aqua-soms/backups
RETENTION_DAYS=7
TS=$(date +%Y%m%d-%H%M%S)
OUT="${BACKUP_DIR}/seoul-aqua-${TS}.sql.gz"

# Postgres credentials come from the same .env the app reads.
# shellcheck disable=SC1091
source /opt/seoul-aqua-soms/.env

mkdir -p "${BACKUP_DIR}"

echo "[backup] Dumping ${POSTGRES_DB:-soms} → ${OUT}"
docker compose -f /opt/seoul-aqua-soms/docker-compose.yml exec -T postgres \
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
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'seoul-aqua-*.sql.gz' \
  -mtime "+${RETENTION_DAYS}" -delete -print
