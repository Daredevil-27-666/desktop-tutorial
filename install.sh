#!/usr/bin/env bash
set -euo pipefail

# Jarvis bot install script — Debian 13 (trixie).
# Run as root from the repo root:
#     sudo ./install.sh
#
# Prerequisites:
#   - .env must exist in the repo root (copy from .env.example and fill in).
#   - Running on Debian 13 or compatible.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JARVIS_HOME="/home/jarvis"
BOT_DIR="${JARVIS_HOME}/bot"
WORK_DIR="${JARVIS_HOME}/workspace"
SERVICE_NAME="jarvis-bot"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log() { printf '[install] %s\n' "$*"; }
die() { printf '[error] %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo ./install.sh"
[[ -f /etc/debian_version ]] || die "This script targets Debian. Detected non-Debian system."
[[ -f "${REPO_DIR}/.env" ]] || die ".env not found in ${REPO_DIR}. Copy .env.example to .env and fill it in first."
[[ -f "${REPO_DIR}/bot/index.ts" ]] || die "bot/index.ts not found. Run from the repo root."
[[ -f "${REPO_DIR}/bot/package.json" ]] || die "bot/package.json not found."
[[ -f "${REPO_DIR}/systemd/jarvis-bot.service" ]] || die "systemd/jarvis-bot.service not found."

log "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates curl git unzip nodejs npm

log "Installing @anthropic-ai/claude-code globally..."
npm install -g @anthropic-ai/claude-code

if ! id -u jarvis >/dev/null 2>&1; then
  log "Creating jarvis user (no sudo)..."
  adduser --disabled-password --gecos "" jarvis
else
  log "jarvis user already exists."
fi

log "Ensuring ${WORK_DIR} exists..."
install -d -o jarvis -g jarvis "${WORK_DIR}"

BUN_BIN="${JARVIS_HOME}/.bun/bin/bun"
if [[ ! -x "${BUN_BIN}" ]]; then
  log "Installing Bun into ${JARVIS_HOME}/.bun as jarvis..."
  sudo -u jarvis bash -lc 'curl -fsSL https://bun.sh/install | bash'
else
  log "Bun already installed at ${BUN_BIN}"
fi
[[ -x "${BUN_BIN}" ]] || die "Bun install failed: ${BUN_BIN} not found"

log "Copying bot files to ${BOT_DIR}..."
install -d -o jarvis -g jarvis "${BOT_DIR}"
cp "${REPO_DIR}/bot/index.ts" "${BOT_DIR}/index.ts"
cp "${REPO_DIR}/bot/package.json" "${BOT_DIR}/package.json"
[[ -f "${REPO_DIR}/bot/bun.lock" ]] && cp "${REPO_DIR}/bot/bun.lock" "${BOT_DIR}/bun.lock"
cp "${REPO_DIR}/.env" "${BOT_DIR}/.env"
chown -R jarvis:jarvis "${BOT_DIR}"
chmod 600 "${BOT_DIR}/.env"

log "Installing bot dependencies with bun..."
sudo -u jarvis env HOME="${JARVIS_HOME}" bash -c "cd '${BOT_DIR}' && '${BUN_BIN}' install"

log "Installing systemd unit ${SERVICE_FILE}..."
cp "${REPO_DIR}/systemd/jarvis-bot.service" "${SERVICE_FILE}"
chmod 644 "${SERVICE_FILE}"

log "Reloading systemd and (re)starting ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

sleep 1
systemctl --no-pager --lines=20 status "${SERVICE_NAME}" || true

log "Done. Tail logs with: journalctl -u ${SERVICE_NAME} -f"
