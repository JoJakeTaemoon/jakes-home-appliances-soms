# Staging 서버 셋업 가이드 — 103.27.60.70

PR #6 (`feat/staging-deploy`) 머지 후 vhost.vn Ubuntu 22.04 박스에 staging 환경을
처음부터 끝까지 셋업하는 step-by-step 가이드. 각 단계마다 "어디서 실행하는지"
와 "기대 결과" 를 명시.

상위 운영 런북은 [INFRA.md](INFRA.md) 참고.

---

## 사전 준비 (로컬 노트북)

PR 머지 후 시작. 머지 안 됐으면 먼저 `gh pr merge 6 --squash` 또는 GitHub UI 에서
squash merge.

```bash
# 로컬에서 deploy 용 SSH 키 생성 (이미 있으면 skip)
ssh-keygen -t ed25519 -f ~/.ssh/seoulaqua_staging_deploy -C "deploy@seoulaqua-staging"

# 결과: ~/.ssh/seoulaqua_staging_deploy (private), .pub (public)
# private key 는 나중에 GitHub Secret 으로 등록
```

또한 4 개 시크릿을 미리 생성해서 별도 안전한 곳 (1Password 등) 에 백업:

```bash
for k in POSTGRES_PASSWORD JWT_SECRET REFRESH_SECRET CRON_SECRET; do
  printf '%s=%s\n' "$k" "$(openssl rand -hex 64)"
done
```

이 4 줄을 별도 파일로 저장해두면 나중에 Phase 3 에서 그대로 붙여 넣음.

---

## Phase 1 — 서버 부트스트랩 (root 로 1 회, ~15 분)

### 1-1. bootstrap 스크립트 업로드 + 실행

vhost.vn 에서 받은 root 접속 정보로:

```bash
# 로컬에서 실행
scp deploy/scripts/bootstrap.sh root@103.27.60.70:/tmp/bootstrap.sh
ssh root@103.27.60.70 'bash /tmp/bootstrap.sh'
```

스크립트가 자동으로 처리:
- 패키지 업데이트 + Docker Engine + Compose plugin 설치
- 타임존 → Asia/Ho_Chi_Minh
- `deploy` 사용자 생성 + docker 그룹 추가
- sudoers 파편 (`/etc/sudoers.d/seoul-aqua-deploy`) — docker 명령 + `seoul-aqua-*`
  systemctl 만 NOPASSWD
- UFW (`22/80/443/tcp`, `443/udp`) + fail2ban + unattended-upgrades
- SSH 하드닝 (`PasswordAuthentication no`, `PermitRootLogin no`)
- `/opt/seoul-aqua-soms/` 디렉토리 트리 (`postgres-data`, `uploads`, `backups`,
  `caddy-data`, `caddy-config`)

**기대 출력**: 마지막에 `[bootstrap] Done. Next:` 가 보이면 성공.

### 1-2. deploy 사용자 SSH 키 등록

```bash
# 로컬에서 — Phase 1-0 에서 만든 public 키를 deploy 계정에 추가
ssh-copy-id -i ~/.ssh/seoulaqua_staging_deploy.pub deploy@103.27.60.70
```

만약 위가 password prompt 로 막히면 (root 접속만 가능한 상태) 임시로 paste:

```bash
# 로컬에서
cat ~/.ssh/seoulaqua_staging_deploy.pub
# 출력을 클립보드에 복사

# 서버에서 (root 로 SSH)
ssh root@103.27.60.70
mkdir -p /home/deploy/.ssh
echo 'ssh-ed25519 AAAA...붙여넣기...' >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
exit
```

### 1-3. deploy 로그인 검증

```bash
ssh -i ~/.ssh/seoulaqua_staging_deploy deploy@103.27.60.70 'docker --version && docker compose version'
```

**기대 출력**: `Docker version 27.x ...` + `Docker Compose version v2.x ...`

만약 `docker: permission denied` 가 뜨면 `sudo usermod -aG docker deploy` + 재로그인.

---

## Phase 2 — GitHub Secrets 등록 (1 회, ~3 분)

GitHub 웹 UI:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value |
|---|---|
| `STAGING_HOST` | `103.27.60.70` |
| `STAGING_USER` | `deploy` |
| `STAGING_SSH_KEY` | `~/.ssh/seoulaqua_staging_deploy` 의 **전체 내용** (`-----BEGIN OPENSSH PRIVATE KEY-----` 포함) |

그리고 **Settings → Environments → New environment → `staging`** 도 생성 (필수).
머지 후 자동 배포가 이 environment 를 사용. 이때 protection rule (required reviewer
등) 은 일단 비워두고, 나중에 prod 환경 만들 때만 추가하면 됨.

private key 복사 명령:

```bash
# macOS
pbcopy < ~/.ssh/seoulaqua_staging_deploy
```

---

## Phase 3 — `.env` 작성 + 첫 배포 (1 회, ~10 분)

### 3-1. `/opt/seoul-aqua-soms/.env` 작성

```bash
ssh -i ~/.ssh/seoulaqua_staging_deploy deploy@103.27.60.70
cd /opt/seoul-aqua-soms

# 템플릿이 워크플로가 rsync 하기 전엔 없으므로 직접 작성
cat > .env <<'EOF'
POSTGRES_USER=soms
POSTGRES_DB=soms
POSTGRES_PASSWORD=<사전준비에서 생성한 값 붙여넣기>

JWT_SECRET=<사전준비에서 생성한 값>
REFRESH_SECRET=<사전준비에서 생성한 값>
CRON_SECRET=<사전준비에서 생성한 값>

NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://103.27.60.70

SMS_PROVIDER=mock
EMAIL_PROVIDER=mock

APP_IMAGE=ghcr.io/jojaketaemoon/seoulaqua-soms:staging
EOF

chmod 600 .env
ls -la .env
# 기대: -rw------- deploy:deploy
```

> `DATABASE_URL` / `DIRECT_URL` 은 `docker-compose.yml` 안에서 override 되므로
> `.env` 에 안 넣어도 됨. (compose 가 `postgres:5432` 로 자동 설정)

### 3-2. 첫 배포 워크플로 트리거

GitHub → Actions → **"Deploy to staging"** → `Run workflow` → branch `main` →
녹색 버튼.

진행:
1. **wait-for-ci** (~10 초) — CI 가 이미 그린이라 통과
2. **build-and-push** (~5-7 분, cold) — Docker 이미지 빌드 + GHCR push
3. **deploy** (~2-3 분) — rsync compose/Caddyfile + SSH 로 systemd 유닛 설치 +
   `deploy-staging.sh` 실행
4. **smoke-check** — `curl https://localhost/api/health` 가 `{"db":"ok"}` 반환

워크플로 출력을 보면서 각 단계 그린 확인.

### 3-3. DB 시드 (1 회만)

워크플로가 `prisma migrate deploy` 까지는 자동으로 돌리지만, `db seed` 는
파괴적이라 수동:

```bash
ssh -i ~/.ssh/seoulaqua_staging_deploy deploy@103.27.60.70
cd /opt/seoul-aqua-soms
docker compose exec app npx prisma db seed
```

**기대 출력**: `🌱 Seoul Aqua dev seed completed` 비슷한 메시지 + 사용자 /
카탈로그 row 수.

### 3-4. 동작 검증

```bash
# 로컬에서
curl -k https://103.27.60.70/api/health
# 기대: {"status":"ok","db":"ok","version":"0.1.x","uptime":...}
```

브라우저:
1. `https://103.27.60.70/vi/login` 열기
2. self-signed 경고 → "고급" → "안전하지 않음으로 진행"
3. 로그인: phone `012345678` / password `12341234`
4. 대시보드 진입 확인
5. `/vi/admin/products` 6 개 탭 클릭 → 모두 렌더링 + 콘솔 에러 없음

---

## Phase 4 — 운영 검증 (1 회, ~10 분)

### 4-1. Cron 타이머 등록 확인

```bash
ssh -i ~/.ssh/seoulaqua_staging_deploy deploy@103.27.60.70
systemctl list-timers --all | grep seoul-aqua
```

**기대**: 8 개 timer 가 보이고 (`overdue-escalation`, `filter-due`, `rental-renewal`,
`rental-completion`, `visit-reminder`, `cash-handover-alert`, `recurring-payments`,
`backup`) 다음 발화 시각이 VST 로 표시.

### 4-2. Cron 수동 실행 1 회

```bash
sudo systemctl start seoul-aqua-cron@filter-due.service
journalctl -u seoul-aqua-cron@filter-due -n 30
```

**기대**: `curl ... 200 OK` + JSON 응답. 401 이 나오면 `.env` 의 `CRON_SECRET` 이
빠진 것.

### 4-3. 백업 수동 실행

```bash
sudo systemctl start seoul-aqua-backup.service
ls -la /opt/seoul-aqua-soms/backups/
```

**기대**: 오늘 날짜 `.sql.gz` 파일 (~1MB), 0 byte 아님.

### 4-4. DR 드라이런 (선택, 권장)

[INFRA.md](INFRA.md) 의 "Restore (DR drill)" 섹션 따라서 1 회 복원 테스트.

---

## Phase 5 — 자동 배포 회귀 (앞으로 PR 머지마다)

이제 `main` 푸시 → 자동 배포가 동작. 다음 PR 머지 후:

1. GitHub Actions → "Deploy to staging" 자동 트리거 확인 (~3 분 warm cache)
2. `curl -k https://103.27.60.70/api/health` 의 `version` 필드 갱신 확인
3. 변경된 페이지 1-2 개 브라우저 확인

문제 생기면:

```bash
ssh -i ~/.ssh/seoulaqua_staging_deploy deploy@103.27.60.70
cd /opt/seoul-aqua-soms
docker compose logs --tail 100 app
docker compose logs --tail 100 postgres
docker compose logs --tail 100 caddy
```

---

## 자주 만날 함정 + 대응

| 증상 | 원인 | 대응 |
|---|---|---|
| `Permission denied (publickey)` 워크플로에서 | GitHub Secret `STAGING_SSH_KEY` 가 public 키 (실수) | private key (`-----BEGIN OPENSSH PRIVATE KEY-----`) 로 재등록 |
| `/api/health` → 503 + `db:"error"` | postgres 컨테이너가 healthy 안 됨 | `docker compose logs postgres` — 보통 `POSTGRES_PASSWORD` 불일치 또는 `postgres-data` 권한 |
| 브라우저 self-signed 경고가 안 닫힘 | Chrome 의 HSTS 가 다른 도메인 거 캐시 | 시크릿 창에서 테스트 |
| 워크플로 build 단계 OOM | GHCR 캐시 cold + Docker BuildKit 메모리 | 재실행하면 보통 통과 (cache-from gha 효과) |
| cron 401 | `.env` 의 `CRON_SECRET` 불일치 또는 시스템 환경에 안 실림 | `deploy/systemd/seoul-aqua-cron@.service` 의 `EnvironmentFile=/opt/seoul-aqua-soms/.env` 확인 |
| 디스크 가득 | Docker layer + Postgres WAL + 백업 누적 | `docker system prune -af --filter "until=720h"` + `du -sh /opt/seoul-aqua-soms/*` |

---

## 요약 체크리스트

- [ ] **Phase 1**: `scp bootstrap.sh root@103.27.60.70:/tmp/ && ssh root@... 'bash /tmp/bootstrap.sh'`
- [ ] **Phase 1**: deploy 사용자 SSH 키 등록 + `ssh deploy@... docker --version` 검증
- [ ] **Phase 2**: GitHub Secrets 3 개 (`STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`) + `staging` environment 생성
- [ ] **Phase 3**: `/opt/seoul-aqua-soms/.env` 작성 (chmod 600) + 워크플로 수동 트리거 + `db seed`
- [ ] **Phase 4**: `curl /api/health` + 브라우저 로그인 + `systemctl list-timers | grep seoul-aqua` + cron 1 회 수동 실행 + 백업 1 회 수동 실행
- [ ] **Phase 5**: 다음 PR 머지 → 자동 배포 동작 확인

전체 ~40 분이면 끝.
