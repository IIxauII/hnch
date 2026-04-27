#!/usr/bin/env bash
#
# bootstrap-vps.sh — provision a fresh Debian VPS for hnch (ADR-0029).
#
# Tested on Debian 13 (trixie). Idempotent: re-running on an already-
# provisioned host is safe.
#
# Installs: Node 22 LTS, Caddy, UFW, gnupg, rsync.
# Creates:  deploy user (key-only auth), /opt/hnch-relay/{releases,},
#           /var/www/hnch-client, systemd unit, Caddyfile, sudoers drop-in,
#           1 GB swap.
# Enables:  caddy + hnch-relay (relay enabled but not started — first deploy
#           starts it once /opt/hnch-relay/current symlink points at a release).
#
# Run on the VPS as root:
#     sudo bash infra/bootstrap-vps.sh
#
# Required: a deploy public key at infra/deploy.pub (or set DEPLOY_PUBKEY env).
#           The script aborts if no pubkey is available — passwordless sudo
#           with no SSH key would lock you out of the deploy user.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "must run as root (try: sudo bash $0)" >&2
	exit 1
fi

# --- OS sanity check -------------------------------------------------------
if [[ ! -f /etc/os-release ]] || ! grep -q '^ID=debian' /etc/os-release; then
	echo "this script targets Debian (tested on 13 trixie); aborting" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
RELAY_BASE="/opt/hnch-relay"
RELAY_RELEASES="${RELAY_BASE}/releases"
CLIENT_DIR="/var/www/hnch-client"

# --- Resolve deploy pubkey -------------------------------------------------
PUBKEY="${DEPLOY_PUBKEY:-}"
if [[ -z "${PUBKEY}" && -f "${SCRIPT_DIR}/deploy.pub" ]]; then
	PUBKEY="$(cat "${SCRIPT_DIR}/deploy.pub")"
fi
if [[ -z "${PUBKEY}" ]]; then
	echo "no deploy pubkey found (expected ${SCRIPT_DIR}/deploy.pub or DEPLOY_PUBKEY env)" >&2
	exit 1
fi

# --- Apt + base packages ---------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
	curl ca-certificates gnupg debian-keyring debian-archive-keyring \
	apt-transport-https ufw rsync

# --- Node 22 LTS via nodesource -------------------------------------------
if ! command -v node >/dev/null || ! node --version | grep -q '^v22\.'; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
fi

# --- Caddy via official cloudsmith apt repo -------------------------------
if ! command -v caddy >/dev/null; then
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
		| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		-o /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y
	apt-get install -y caddy
fi

# --- Deploy user (key-only) ------------------------------------------------
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
	adduser --disabled-password --gecos "" "${DEPLOY_USER}"
	# `--disabled-password` leaves the password unset; `passwd -l` makes the
	# locked state explicit and prevents `passwd` from later creating one.
	passwd -l "${DEPLOY_USER}"
fi

install -d -m 0700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
if ! grep -qF "${PUBKEY}" "${AUTH_KEYS}" 2>/dev/null; then
	echo "${PUBKEY}" >> "${AUTH_KEYS}"
fi
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"
chmod 0600 "${AUTH_KEYS}"

# --- Service + content directories ----------------------------------------
# Layout:
#   /opt/hnch-relay/             (deploy-owned, deploy can write inside)
#   /opt/hnch-relay/releases/    (deploy writes new release dirs here)
#   /opt/hnch-relay/current      (symlink → releases/release-<stamp>, set by deploy)
#
# The systemd unit's WorkingDirectory + ExecStart point at /opt/hnch-relay/current,
# which doesn't exist yet — that's fine; the unit is `enabled` but not `started`
# until the first deploy creates the symlink.
install -d -m 0755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${RELAY_BASE}"
install -d -m 0755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${RELAY_RELEASES}"
install -d -m 0755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${CLIENT_DIR}"

# --- systemd unit + Caddyfile ---------------------------------------------
install -m 0644 "${SCRIPT_DIR}/hnch-relay.service" /etc/systemd/system/hnch-relay.service
install -m 0644 "${SCRIPT_DIR}/Caddyfile" /etc/caddy/Caddyfile

# --- Sudoers drop-in: deploy can restart only the relay, reload only caddy
SUDOERS_FILE=/etc/sudoers.d/hnch-deploy
cat > "${SUDOERS_FILE}" <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart hnch-relay, /usr/bin/systemctl reload caddy
EOF
chmod 0440 "${SUDOERS_FILE}"
visudo -cf "${SUDOERS_FILE}" >/dev/null

# --- UFW (allow SSH first, then enable to avoid lockout) ------------------
ufw allow 22/tcp comment 'ssh'
ufw allow 80/tcp comment 'http (acme + redirect)'
ufw allow 443/tcp comment 'https + wss'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable

# --- Swap (1 GB cushion on the 1 GB box) ----------------------------------
if [[ ! -f /swapfile ]]; then
	fallocate -l 1G /swapfile
	chmod 0600 /swapfile
	mkswap /swapfile
	swapon /swapfile
	echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Enable services ------------------------------------------------------
systemctl daemon-reload
systemctl enable --now caddy
systemctl reload caddy
# Relay is enabled but not started — no /opt/hnch-relay/current symlink yet.
# First CI deploy creates the symlink and `systemctl restart hnch-relay`.
systemctl enable hnch-relay

echo
echo "bootstrap complete. next steps:"
echo "  1. confirm DNS:   dig +short hnch.dev   (should resolve to this VPS IP)"
echo "  2. test Caddy:    curl -I https://hnch.dev/health   (502 expected — relay not deployed yet)"
echo "  3. trigger first relay deploy via the deploy-relay.yml workflow"
