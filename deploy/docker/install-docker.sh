#!/usr/bin/env bash
# Install Docker Engine + the compose plugin on the Vezano Pro VPS (Ubuntu).
# Phase 2 of the container plan; see deploy/docker/README.md.
#
# Run as root. Idempotent: re-running keeps an existing installation, only
# rewrites /etc/docker/daemon.json when it differs, and restarts Docker only
# then. It never touches Caddy, PostgreSQL or the vezano-* systemd units.
#
# Source: Docker's official apt repository when it publishes the host's
# codename; otherwise Ubuntu's own docker.io + docker-compose-v2 packages.
set -euo pipefail

log() { printf '[install-docker] %s\n' "$*"; }
die() { printf '[install-docker] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root"
[ -r /etc/os-release ] || die "/etc/os-release is missing"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "this script supports Ubuntu only (found ${ID:-unknown})"
CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
[ -n "$CODENAME" ] || die "cannot read the Ubuntu codename"
ARCH="$(dpkg --print-architecture)"
DOCKER_REPO=https://download.docker.com/linux/ubuntu
KEYRING=/etc/apt/keyrings/docker.asc
SOURCES=/etc/apt/sources.list.d/docker.list
export DEBIAN_FRONTEND=noninteractive

have_engine() { command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }

install_official() {
    log "installing from Docker's apt repository ($CODENAME, $ARCH)"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL --max-time 30 "$DOCKER_REPO/gpg" -o "$KEYRING.tmp"
    chmod a+r "$KEYRING.tmp"
    mv "$KEYRING.tmp" "$KEYRING"
    printf 'deb [arch=%s signed-by=%s] %s %s stable\n' "$ARCH" "$KEYRING" "$DOCKER_REPO" "$CODENAME" > "$SOURCES"
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_ubuntu() {
    log "using Ubuntu's docker.io + docker-compose-v2 ('$CODENAME')"
    apt-get update -qq
    apt-get install -y -qq docker.io docker-compose-v2
}

if have_engine; then
    log "Docker Engine and the compose plugin are already installed; keeping them"
else
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl
    if dpkg -s docker.io >/dev/null 2>&1; then
        # Ubuntu's engine is already here; mixing in docker-ce would conflict.
        install_ubuntu
    elif curl -fsSI --max-time 15 "$DOCKER_REPO/dists/$CODENAME/Release" >/dev/null 2>&1; then
        install_official
    else
        # Do not leave a broken source behind from an earlier attempt.
        rm -f "$SOURCES"
        install_ubuntu
    fi
    have_engine || die "docker or 'docker compose' is still missing after the install"
fi

# Daemon settings: logs go to journald (journalctl -u docker / CONTAINER_TAG=),
# whose own size limits apply; live-restore keeps containers running while
# dockerd restarts or upgrades.
install -m 0755 -d /etc/docker
DAEMON_JSON=/etc/docker/daemon.json
WANT="$(mktemp)"
trap 'rm -f "$WANT"' EXIT
cat > "$WANT" <<'JSON'
{
  "log-driver": "journald",
  "log-opts": {
    "tag": "{{.Name}}"
  },
  "live-restore": true,
  "userland-proxy": false
}
JSON
CHANGED=0
if [ -f "$DAEMON_JSON" ] && cmp -s "$WANT" "$DAEMON_JSON"; then
    log "$DAEMON_JSON is already up to date"
else
    if [ -f "$DAEMON_JSON" ]; then
        BACKUP="$DAEMON_JSON.bak.$(date +%Y%m%d%H%M%S)"
        cp -p "$DAEMON_JSON" "$BACKUP"
        log "previous $DAEMON_JSON saved as $BACKUP"
    fi
    install -m 0644 "$WANT" "$DAEMON_JSON"
    CHANGED=1
    log "wrote $DAEMON_JSON"
fi

systemctl enable --now containerd.service >/dev/null 2>&1 || true
systemctl enable --now docker.service
if [ "$CHANGED" -eq 1 ]; then
    log "restarting Docker to apply the daemon settings"
    systemctl restart docker.service
fi

systemctl is-active --quiet docker.service || die "docker.service is not active"
log "docker: $(docker version --format '{{.Server.Version}}')"
log "compose: $(docker compose version --short)"
log "logging driver: $(docker info --format '{{.LoggingDriver}}'), live-restore: $(docker info --format '{{.LiveRestoreEnabled}}')"
log "done; next: vezano-docker.sh pull main"
