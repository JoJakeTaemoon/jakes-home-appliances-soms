#!/usr/bin/env bash
# Jake's Home Appliances SOMS — one-time server bootstrap.
#
# Run as root on a fresh Ubuntu 22.04 box (103.27.60.70 staging or any
# future vhost.vn prod box). Idempotent — re-running is safe.
#
#   curl -fsS https://raw.githubusercontent.com/.../main/deploy/scripts/bootstrap.sh | sudo bash
# (or rsync the file once and: sudo bash bootstrap.sh)
#
# Phase 1 of the staging plan — see docs/INFRA.md.

set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_HOME=/opt/jakes-home-appliances-soms

echo "[bootstrap] OS update"
apt-get update -y
apt-get upgrade -y

echo "[bootstrap] Base packages"
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban unattended-upgrades \
  rsync gzip

echo "[bootstrap] Timezone → Asia/Ho_Chi_Minh"
timedatectl set-timezone Asia/Ho_Chi_Minh

echo "[bootstrap] Docker engine + compose plugin"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi
cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable
EOF
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "[bootstrap] Deploy user '${DEPLOY_USER}'"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G docker "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

echo "[bootstrap] sudoers — docker + restart of jakes-home-appliances-* units only"
cat >/etc/sudoers.d/jakes-home-appliances-deploy <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, \
  /bin/systemctl daemon-reload, \
  /bin/systemctl restart jakes-home-appliances-*, \
  /bin/systemctl start jakes-home-appliances-*, \
  /bin/systemctl stop jakes-home-appliances-*, \
  /bin/systemctl enable jakes-home-appliances-*, \
  /bin/systemctl status jakes-home-appliances-*
EOF
chmod 0440 /etc/sudoers.d/jakes-home-appliances-deploy
visudo -cf /etc/sudoers.d/jakes-home-appliances-deploy

echo "[bootstrap] App directory layout"
mkdir -p "${APP_HOME}/postgres-data" \
         "${APP_HOME}/uploads" \
         "${APP_HOME}/backups" \
         "${APP_HOME}/caddy-data" \
         "${APP_HOME}/caddy-config" \
         "${APP_HOME}/scripts"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_HOME}"
chmod 700 "${APP_HOME}"           # secrets-bearing root, restrict listing
chmod 700 "${APP_HOME}/postgres-data"

echo "[bootstrap] UFW — allow SSH + HTTP/HTTPS only"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp  # HTTP/3
ufw --force enable

echo "[bootstrap] Harden sshd — keys only, no root login"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

echo "[bootstrap] fail2ban + unattended-upgrades"
systemctl enable --now fail2ban
dpkg-reconfigure --priority=low --frontend=noninteractive unattended-upgrades

echo "[bootstrap] Done. Next:"
echo "  1. sudo -u ${DEPLOY_USER} ssh-copy-id from your laptop (or paste keys)"
echo "  2. Fill /opt/jakes-home-appliances-soms/.env (use .env.staging.example as template)"
echo "  3. Trigger the GitHub Actions 'deploy-staging' workflow (workflow_dispatch)"
