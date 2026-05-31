# Infrastructure runbook — staging (self-hosted on vhost.vn)

Source of truth for everything that runs at `103.27.60.70`. Treat this file
as the operator's manual: any change to the host (sudoers, env, systemd
units, compose) should be reflected here in the same PR.

> Production migration to vhost.vn reuses this stack verbatim — only the
> domain, the secrets, and the resource sizing change. Keep this runbook
> production-shaped.

---

## Architecture

```
              ┌─────────────────────────────────────────────┐
   internet ──┤ 103.27.60.70 — Ubuntu 22.04 (vhost.vn box)  │
              │                                             │
              │   :443 / :80  ── caddy:2-alpine             │
              │       (self-signed TLS, will swap to LE     │
              │        when staging.seoulaqua.com.vn lands) │
              │                    │                        │
              │                    ▼ (compose net)          │
              │           app — next.js standalone          │
              │       (ghcr.io/.../seoulaqua-soms:staging)  │
              │                    │                        │
              │                    ▼                        │
              │           postgres:16-alpine                │
              │           bind-mounted /opt/...             │
              │                                             │
              │  systemd timers ──▶ curl ▶ /api/cron/*      │
              │  (8 units: 7 cron + 1 backup)               │
              └─────────────────────────────────────────────┘
```

Host paths:

```
/opt/seoul-aqua-soms/
├── .env                 secrets, chmod 600, deploy:deploy
├── docker-compose.yml   rsynced from repo on every deploy
├── Caddyfile            same
├── deploy/              same — systemd units + helper scripts
├── scripts/             backup.sh + deploy-staging.sh (installed copies)
├── postgres-data/       Postgres data dir, chmod 700
├── uploads/             app uploads, mounted into the app container
├── caddy-data/          Caddy's auto-cert cache
├── caddy-config/        Caddy's runtime config
└── backups/             nightly pg_dump output, 7-day retention
```

---

## Phases recap

| Phase | What | When | How |
|---|---|---|---|
| 1 | Server bootstrap (Docker, UFW, user, fail2ban) | Once, manual | `sudo bash deploy/scripts/bootstrap.sh` |
| 2 | App code changes | One PR (this one) | `feat/staging-deploy` |
| 3 | First deploy (secrets + migrations + seed) | Once, manual | Workflow `workflow_dispatch` + `db seed` manually |
| 4 | CI auto-deploy on `main` push | Ongoing | `.github/workflows/deploy-staging.yml` |

---

## Phase 1 — server bootstrap (one-time)

```bash
# from your laptop
scp deploy/scripts/bootstrap.sh root@103.27.60.70:/tmp/
ssh root@103.27.60.70 'bash /tmp/bootstrap.sh'
```

`bootstrap.sh` is idempotent — safe to re-run if it fails halfway. After it
finishes:

```bash
# Append your laptop's ssh key to the deploy user
ssh-copy-id deploy@103.27.60.70

# Or paste manually:
ssh root@103.27.60.70
echo 'ssh-ed25519 AAAA...' >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## Phase 3 — first deploy (one-time)

### 1. Fill `/opt/seoul-aqua-soms/.env`

```bash
ssh deploy@103.27.60.70
cd /opt/seoul-aqua-soms

# Generate the four secrets locally first so you have a copy.
for k in POSTGRES_PASSWORD JWT_SECRET REFRESH_SECRET CRON_SECRET; do
  printf '%s=%s\n' "$k" "$(openssl rand -hex 64)"
done > .env.new

cat >> .env.new <<EOF
POSTGRES_USER=soms
POSTGRES_DB=soms
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://103.27.60.70
SMS_PROVIDER=mock
EMAIL_PROVIDER=mock
APP_IMAGE=ghcr.io/jojaketaemoon/seoulaqua-soms:staging
EOF

mv .env.new .env
chmod 600 .env
```

### 2. Trigger the deploy workflow

GitHub → Actions → "Deploy to staging" → **Run workflow** on `main`.
First run takes ~5–7 min (Docker build + first image pull).

### 3. Seed the DB (only on first deploy)

The deploy workflow runs `prisma migrate deploy` but not `db seed` — seed
is destructive and you do it once.

```bash
ssh deploy@103.27.60.70 'cd /opt/seoul-aqua-soms && docker compose exec app npx prisma db seed'
```

### 4. Verify

```bash
# From any machine
curl -k https://103.27.60.70/api/health
# {"status":"ok","db":"ok","version":"0.1.x","uptime":...}
```

Browser → https://103.27.60.70/vi/login → accept self-signed cert →
login `admin` / phone `012345678` / password `12341234`.

---

## Phase 4 — CI auto-deploy

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `STAGING_HOST` | `103.27.60.70` |
| `STAGING_USER` | `deploy` |
| `STAGING_SSH_KEY` | Private SSH key authorised on `deploy@103.27.60.70` |

(GitHub also needs the `staging` environment defined — `Settings → Environments → New → staging`. Use the environment to require reviewers for production later.)

### Flow

```
PR merged → main push → CI green → build-and-push (GHCR) → deploy → smoke-check
```

Total time: ~3 min on a warm image cache, ~7 min cold.

---

## Day-to-day operations

### View app logs

```bash
ssh deploy@103.27.60.70
cd /opt/seoul-aqua-soms
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f caddy
```

Cron + backup logs are in the systemd journal:

```bash
journalctl -u seoul-aqua-cron@filter-due -n 100
journalctl -u seoul-aqua-backup --since '24 hours ago'
```

### List active timers

```bash
systemctl list-timers --all | grep seoul-aqua
```

### Restart a single service

```bash
sudo docker compose -f /opt/seoul-aqua-soms/docker-compose.yml restart app
# or any of: postgres, caddy
```

### Restart the whole stack

```bash
sudo docker compose -f /opt/seoul-aqua-soms/docker-compose.yml down
sudo docker compose -f /opt/seoul-aqua-soms/docker-compose.yml up -d
```

### Apply a Prisma migration manually

```bash
docker compose exec app npx prisma migrate deploy
```

### Re-seed (DESTROYS data — never on prod)

```bash
docker compose exec app npm run db:reset
```

### Rotate a secret

```bash
# Edit /opt/seoul-aqua-soms/.env with the new value
vi /opt/seoul-aqua-soms/.env
# Restart the app to pick it up
sudo docker compose -f /opt/seoul-aqua-soms/docker-compose.yml up -d --force-recreate app
```

`POSTGRES_PASSWORD` rotation is more involved — change it in `.env`, then
`docker compose exec postgres psql -U soms -c "ALTER USER soms PASSWORD '...';"`
and restart.

### Trigger a cron job manually

```bash
sudo systemctl start seoul-aqua-cron@filter-due.service
journalctl -u seoul-aqua-cron@filter-due -n 50
```

---

## Backups

### What runs nightly

`seoul-aqua-backup.timer` fires at 02:30 VST. Calls `backup.sh` which:

1. `docker compose exec postgres pg_dump --clean --if-exists ...`
2. Pipes through `gzip -9`
3. Writes `/opt/seoul-aqua-soms/backups/seoul-aqua-YYYYmmdd-HHMMSS.sql.gz`
4. Deletes anything older than 7 days

### Manual backup

```bash
sudo systemctl start seoul-aqua-backup.service
ls -la /opt/seoul-aqua-soms/backups/
```

### Restore (DR drill — restores into a fresh DB, not the live one)

```bash
ssh deploy@103.27.60.70
cd /opt/seoul-aqua-soms

# Pick the dump you want to restore
LATEST=$(ls -t backups/seoul-aqua-*.sql.gz | head -1)

# Create a parallel DB to restore into (so you can compare side-by-side)
docker compose exec postgres psql -U soms -d postgres -c "CREATE DATABASE soms_dr;"

# Restore
gunzip < "${LATEST}" | docker compose exec -T postgres psql -U soms -d soms_dr

# Verify
docker compose exec postgres psql -U soms -d soms_dr -c "SELECT COUNT(*) FROM \"User\";"

# Clean up the drill DB when satisfied
docker compose exec postgres psql -U soms -d postgres -c "DROP DATABASE soms_dr;"
```

To restore *into the live DB* (data loss): same as above but target `soms`
instead of `soms_dr`. Always take a fresh dump first.

### Off-site copy (TODO)

Backups currently live only on the same disk as the DB. Before prod
launch: copy each new dump to a separate vhost.vn object store or a
remote SFTP target. Track in [TODOS.md](../TODOS.md).

---

## Cron jobs — schedule reference

| systemd unit | When | Vercel equivalent |
|---|---|---|
| `seoul-aqua-cron@overdue-escalation.timer` | 08:00 VST daily | `0 1 * * *` UTC |
| `seoul-aqua-cron@filter-due.timer`         | 09:00 VST daily | `0 2 * * *` UTC |
| `seoul-aqua-cron@rental-renewal.timer`     | 10:00 VST daily | `0 3 * * *` UTC |
| `seoul-aqua-cron@rental-completion.timer`  | 11:00 VST daily | `0 4 * * *` UTC |
| `seoul-aqua-cron@visit-reminder.timer`     | 16:00 VST daily | `0 9 * * *` UTC |
| `seoul-aqua-cron@cash-handover-alert.timer`| 01:30 VST daily | `30 18 * * *` UTC |
| `seoul-aqua-cron@recurring-payments.timer` | 07:00 VST 1st of month | `0 0 1 * *` UTC |
| `seoul-aqua-backup.timer`                  | 02:30 VST daily | (Vercel had none — added per H.3) |

When you change a schedule, edit the matching `.timer` file in
`deploy/systemd/`, push to `main`, and the next deploy will install the
new schedule (you also need to bump it on the host: `sudo systemctl
daemon-reload && sudo systemctl restart <unit>.timer`).

---

## Switching to a real domain + Let's Encrypt

Once `staging.seoulaqua.com.vn` DNS A-record points at this server:

1. Replace the `:443` block in `Caddyfile` with the domain hostname.
2. Remove `tls internal`.
3. Update `NEXT_PUBLIC_APP_URL` in `/opt/seoul-aqua-soms/.env`.
4. `sudo docker compose -f /opt/seoul-aqua-soms/docker-compose.yml restart caddy`.
5. Drop `-k` from the cron service ExecStart in
   `deploy/systemd/seoul-aqua-cron@.service` (and `daemon-reload`).

Caddy auto-issues from Let's Encrypt on first start. No further config.

---

## Disk hygiene

```bash
# Old Docker layers add up — weekly via cron eventually, manually for now:
docker system prune -af --filter "until=720h"

# Old Postgres WAL — Postgres prunes its own, but `du -sh postgres-data` is
# worth eyeballing every few weeks.
du -sh /opt/seoul-aqua-soms/postgres-data
du -sh /opt/seoul-aqua-soms/uploads
du -sh /opt/seoul-aqua-soms/backups
```

---

## Production migration checklist (for the future vhost.vn prod PR)

Reuse this entire stack. The diff from staging is small:

- [ ] New `prod` GitHub environment with mandatory reviewer
- [ ] New repo Secrets: `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`
- [ ] Copy `deploy-staging.yml` → `deploy-prod.yml`, gate on `tag` push (e.g. `v*`) instead of branch push
- [ ] `Caddyfile`: production domain + drop `tls internal`
- [ ] `.env`: production secrets (rotated, not shared with staging), `SMS_PROVIDER=esms`, `EMAIL_PROVIDER=resend`, real provider credentials
- [ ] Off-site backup target (vhost.vn object store / S3-compat) wired into `backup.sh`
- [ ] Cloudflare proxy in front (optional but recommended) — drop `-k` everywhere, set `trusted_proxies` in Caddy
- [ ] Sentry DSN + monitoring tier (separate plan)
- [ ] Run a full DR drill (restore from backup) on a staging-shape box and document timings
