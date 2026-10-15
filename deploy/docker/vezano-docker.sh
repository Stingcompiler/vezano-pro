#!/usr/bin/env bash
# Operator wrapper for the parallel Vezano Pro container (phase 2 of the
# container plan; deploy/docker/README.md). Run as root.
#
#   vezano-docker.sh pull <ref>   pull ghcr.io/stingcompiler/vezano-pro:<ref>
#                                 (main, sha-<full>, sha-<short> or sha256:<digest>)
#                                 and record its digest in current.env
#   vezano-docker.sh up           start the recorded image on 127.0.0.1:8001
#   vezano-docker.sh status       container state, health and image
#   vezano-docker.sh logs [N]     the last N log lines (default 200)
#   vezano-docker.sh smoke        health + pages through 127.0.0.1:8001
#   vezano-docker.sh down         stop and remove the container
#   vezano-docker.sh prune        keep the 3 newest images (and the recorded one)
#
# Scope: this script only drives the `vezano-docker` compose project. It
# never runs migrations, never calls systemctl, never edits Caddy and refuses
# any bind other than 127.0.0.1:8001, so the systemd release on 8000 and the
# timers stay exactly as they are.
set -euo pipefail

REPO=ghcr.io/stingcompiler/vezano-pro
BIND=127.0.0.1:8001
BASE="http://$BIND"
STATE_DIR=/var/lib/vezano-docker
STATE_FILE="$STATE_DIR/current.env"
ENV_FILE=/etc/vezano/vezano.env
MEDIA_DIR=/var/lib/vezano/media
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${VEZANO_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.prod.yml}"
SMOKE_HOST="${SMOKE_HOST:-vezano.app}"
KEEP_IMAGES=3

log() { printf '[vezano-docker] %s\n' "$*"; }
die() { printf '[vezano-docker] ERROR: %s\n' "$*" >&2; exit 1; }

usage() { sed -n '5,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

require_root() { [ "$(id -u)" -eq 0 ] || die "run as root"; }
require_docker() { docker compose version >/dev/null 2>&1 || die "docker compose is missing; run install-docker.sh"; }

load_ids() {
    id vezano >/dev/null 2>&1 || die "the host user 'vezano' does not exist"
    VEZANO_UID="$(id -u vezano)"
    VEZANO_GID="$(id -g vezano)"
    export VEZANO_UID VEZANO_GID
}

load_state() {
    [ -f "$STATE_FILE" ] || die "no image recorded; run: vezano-docker.sh pull main"
    VEZANO_IMAGE="$(sed -n 's/^VEZANO_IMAGE=//p' "$STATE_FILE" | tail -n 1)"
    VEZANO_COMMIT="$(sed -n 's/^VEZANO_COMMIT=//p' "$STATE_FILE" | tail -n 1)"
    case "$VEZANO_IMAGE" in
        "$REPO"@sha256:*) ;;
        *) die "$STATE_FILE does not hold a $REPO@sha256 digest" ;;
    esac
    export VEZANO_IMAGE
}

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Refuse to run anything that could reach port 8000 or listen beyond loopback.
check_config() {
    [ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
    local rendered bind network
    rendered="$(compose config)" || die "docker compose config failed"
    bind="$(sed -n 's/^ *GUNICORN_BIND: *//p' <<<"$rendered" | tr -d "\"'" | head -n 1)"
    network="$(sed -n 's/^ *network_mode: *//p' <<<"$rendered" | tr -d "\"'" | head -n 1)"
    [ "$bind" = "$BIND" ] || die "refusing: GUNICORN_BIND is '$bind', only $BIND is allowed"
    [ "$network" = host ] || die "refusing: network_mode must be host"
    if grep -qE '^ *(ports|published):' <<<"$rendered"; then
        die "refusing: the compose file publishes ports"
    fi
}

# Compose expands $ in unquoted and double-quoted env-file values; systemd does
# not. Such a value (a Django secret often contains $) would differ inside the
# container, so stop and name the key (never the value).
check_env_file() {
    [ -r "$ENV_FILE" ] || die "$ENV_FILE is missing or unreadable"
    local keys
    keys="$(awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ { v = substr($0, length($1) + 2); if (substr(v, 1, 1) != "\047" && index(v, "$") > 0) print $1 }' "$ENV_FILE")"
    if [ -n "$keys" ]; then
        die "$(printf 'these keys in %s contain $ outside single quotes; wrap their values in single quotes (systemd reads that the same way): %s' "$ENV_FILE" "$(tr '\n' ' ' <<<"$keys")")"
    fi
}

port_in_use_by_other() {
    # True when something other than our container listens on 8001.
    command -v ss >/dev/null 2>&1 || return 1
    ss -ltnH "sport = :8001" 2>/dev/null | grep -q . || return 1
    [ "$(docker inspect -f '{{.State.Running}}' vezano-docker-web 2>/dev/null)" = true ] && return 1
    return 0
}

cmd_pull() {
    local ref="${1:-}"
    [ -n "$ref" ] || die "usage: vezano-docker.sh pull <main|sha-...|sha256:...>"
    [[ "$ref" =~ ^(main|sha-[0-9a-f]{7,40}|sha256:[0-9a-f]{64})$ ]] || die "unsupported ref '$ref'"
    local source="$REPO:$ref"
    [[ "$ref" == sha256:* ]] && source="$REPO@$ref"
    log "pulling $source"
    timeout 600 docker pull --quiet "$source" >/dev/null
    local digest entrypoint commit
    digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$source" | grep -m1 "^$REPO@sha256:")" \
        || die "could not resolve the digest of $source"
    entrypoint="$(docker image inspect --format '{{json .Config.Entrypoint}}' "$digest")"
    case "$entrypoint" in
        null|"[]") ;;
        *) die "refusing: the image has an ENTRYPOINT ($entrypoint); phase 2 runs gunicorn only" ;;
    esac
    commit="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$digest")"
    install -d -m 0755 "$STATE_DIR"
    local tmp
    tmp="$(mktemp "$STATE_DIR/.current.XXXXXX")"
    {
        printf 'VEZANO_IMAGE=%s\n' "$digest"
        printf 'VEZANO_REF=%s\n' "$ref"
        printf 'VEZANO_COMMIT=%s\n' "$commit"
        printf 'PULLED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$tmp"
    chmod 0644 "$tmp"
    if [ -f "$STATE_FILE" ]; then cp -p "$STATE_FILE" "$STATE_DIR/previous.env"; fi
    mv "$tmp" "$STATE_FILE"
    log "recorded $digest (commit ${commit:0:8}) in $STATE_FILE"
}

cmd_up() {
    load_ids; load_state; check_env_file; check_config
    [ -d "$MEDIA_DIR" ] || die "$MEDIA_DIR does not exist"
    if port_in_use_by_other; then die "127.0.0.1:8001 is already used by another process"; fi
    log "starting $VEZANO_IMAGE as uid $VEZANO_UID:$VEZANO_GID on $BIND"
    compose up -d --wait --wait-timeout 120 web || {
        compose ps web || true
        die "the container did not become healthy; see: vezano-docker.sh logs"
    }
    log "healthy; next: vezano-docker.sh smoke"
}

cmd_status() {
    load_ids
    if [ -f "$STATE_FILE" ]; then
        log "recorded image:"; sed 's/^/  /' "$STATE_FILE"
        load_state
    else
        log "no image recorded"; export VEZANO_IMAGE="$REPO:none"
    fi
    compose ps -a web
    docker inspect -f 'state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} started={{.State.StartedAt}} image={{.Config.Image}}' \
        vezano-docker-web 2>/dev/null || log "container vezano-docker-web does not exist"
}

cmd_logs() {
    local lines="${1:-200}"
    [[ "$lines" =~ ^[0-9]+$ ]] || die "logs takes a line count"
    docker logs --tail "$lines" --timestamps vezano-docker-web
}

cmd_smoke() {
    load_state
    local expected="${VEZANO_COMMIT:0:8}" body
    local curl_args=(curl --fail --silent --show-error --max-time 15 -H "Host: $SMOKE_HOST" -H 'X-Forwarded-Proto: https')
    log "GET $BASE/api/health/ (Host: $SMOKE_HOST)"
    body="$("${curl_args[@]}" "$BASE/api/health/")" || die "health request failed"
    printf '%s\n' "$body"
    EXPECTED="$expected" python3 -c '
import json, os, sys
data = json.loads(sys.stdin.read())
expected = os.environ["EXPECTED"]
errors = []
for key, want in (("status", "ok"), ("database", "ok")):
    if data.get(key) != want:
        errors.append("%s=%r, expected %r" % (key, data.get(key), want))
if expected and data.get("commit") != expected:
    errors.append("commit=%r, expected %r" % (data.get("commit"), expected))
if errors:
    sys.exit("health: " + "; ".join(errors))
' <<<"$body" || die "health payload check failed"
    local path page
    for path in / /en/; do
        log "GET $path"
        page="$("${curl_args[@]}" "$BASE$path")" || die "$path request failed"
        grep -qi '<html' <<<"$page" || die "$path did not return HTML"
    done
    log "smoke passed (commit $expected)"
}

cmd_down() {
    load_ids
    if [ -f "$STATE_FILE" ]; then load_state; else export VEZANO_IMAGE="$REPO:none"; fi
    compose down --timeout 30
    log "stopped; the systemd release was left as it is"
}

cmd_prune() {
    local current="" ids
    if [ -f "$STATE_FILE" ]; then
        load_state
        current="$(docker image inspect --format '{{.Id}}' "$VEZANO_IMAGE" 2>/dev/null || true)"
    fi
    # Newest first; one line per image id.
    ids="$(docker image ls --no-trunc --format '{{.CreatedAt}}\t{{.ID}}' "$REPO" | sort -r | cut -f2 | awk '!seen[$0]++')"
    local n=0 id
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        n=$((n + 1))
        if [ "$n" -le "$KEEP_IMAGES" ] || [ "$id" = "$current" ]; then
            continue
        fi
        log "removing $id"
        docker image rm "$id" >/dev/null 2>&1 || log "kept $id (in use)"
    done <<<"$ids"
    log "kept the $KEEP_IMAGES newest $REPO images${current:+ and the recorded one}"
}

main() {
    local sub="${1:-}"
    [ -n "$sub" ] || usage
    shift
    require_root
    require_docker
    case "$sub" in
        pull) cmd_pull "$@" ;;
        up) cmd_up ;;
        status) cmd_status ;;
        logs) cmd_logs "$@" ;;
        smoke) cmd_smoke ;;
        down) cmd_down ;;
        prune) cmd_prune ;;
        *) usage ;;
    esac
}

# Sourcing (deploy/tests/test_docker.py) defines the functions only.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
