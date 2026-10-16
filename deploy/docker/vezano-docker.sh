#!/usr/bin/env bash
# Blue/green deploys of the Vezano Pro container (phase 3 of the container
# plan; deploy/docker/README.md). Run as root.
#
#   vezano-docker.sh deploy <image@sha256:digest> <commit40>
#                                    pull, verify, migration gate, backup, start
#                                    the inactive slot, smoke, mark it active
#   vezano-docker.sh rollback [systemd]  back to the previous slot (or Caddy to systemd)
#   vezano-docker.sh caddy-mode systemd|docker   owner-approved Caddy switch (phase 4)
#   vezano-docker.sh status          state.json, Caddy mode and slot containers
#   vezano-docker.sh logs [slot] [N] the last N log lines (default: active, 200)
#   vezano-docker.sh smoke [slot]    health + pages through the slot's port
#   vezano-docker.sh pull <ref>      pull and print digest + commit (no state change)
#   vezano-docker.sh prune           keep the 3 newest images and those in state
#
# Slots: blue = 127.0.0.1:8001, green = 127.0.0.1:8002 (docker-compose.prod.yml).
# This script never applies migrations and never calls systemctl. Caddy is
# changed only when caddy_mode in state.json is "docker", which only the
# explicit `caddy-mode docker` command sets.
set -euo pipefail

REPO=ghcr.io/stingcompiler/vezano-pro
STATE_DIR=/var/lib/vezano-docker
STATE_FILE="$STATE_DIR/state.json"
LOCK_FILE=/run/lock/vezano-docker.lock
ENV_FILE=/etc/vezano/vezano.env
MEDIA_DIR=/var/lib/vezano/media
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${VEZANO_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.prod.yml}"
SMOKE_HOST="${SMOKE_HOST:-vezano.app}"
# The same reviewed backup the systemd deploy controller uses.
BACKUP_SCRIPT=/usr/local/libexec/vezano/backup.sh
BACKUP_HOME=/opt/vezano/current
BACKUP_DIR=/var/backups/vezano
CADDYFILE=/etc/caddy/Caddyfile
CADDY_SNIPPET=/etc/caddy/vezano-upstream.caddy
SYSTEMD_UPSTREAM=127.0.0.1:8000
LEGACY_CONTAINER=vezano-docker-web   # the phase-2 container on 8001
GRACE_SECONDS=20                     # in-flight requests before the old slot stops
KEEP_IMAGES=3

EXIT_REFUSED=3
EXIT_IMAGE=4
EXIT_PENDING_MIGRATIONS=10
PENDING_MESSAGE="pending migrations — apply via the manual upgrade path"

log() { printf '[vezano-docker] %s\n' "$*"; }
die() { printf '[vezano-docker] ERROR: %s\n' "$*" >&2; exit 1; }
die_code() { local code="$1"; shift; printf '[vezano-docker] ERROR: %s\n' "$*" >&2; exit "$code"; }

usage() { sed -n '5,18p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

require_root() { [ "$(id -u)" -eq 0 ] || die "run as root"; }
require_docker() { docker compose version >/dev/null 2>&1 || die "docker compose is missing; run install-docker.sh"; }

acquire_lock() {
    exec 8>>"$LOCK_FILE"
    flock -n 8 || die "another vezano-docker operation is running"
}

load_ids() {
    id vezano >/dev/null 2>&1 || die "the host user 'vezano' does not exist"
    VEZANO_UID="$(id -u vezano)"
    VEZANO_GID="$(id -g vezano)"
    export VEZANO_UID VEZANO_GID
}

# --- state.json ------------------------------------------------------------
# {"active": "blue|green", "previous": "...", "caddy_mode": "systemd|docker",
#  "slots": {"blue": {"image", "commit", "deployed_at", "activated_at"}, ...},
#  "updated_at": "..."}
STATE_PY='
import datetime, json, os, sys, tempfile
path, op, *args = sys.argv[1:]
try:
    with open(path) as handle:
        state = json.load(handle)
except FileNotFoundError:
    state = {}
if op == "get":
    node = state
    for part in args[0].split("."):
        node = node.get(part) if isinstance(node, dict) else None
    print("" if node is None else node)
elif op == "set":
    for pair in args:
        key, _, value = pair.partition("=")
        node = state
        *parents, leaf = key.split(".")
        for part in parents:
            node = node.setdefault(part, {})
        if value:
            node[leaf] = value
        else:
            node.pop(leaf, None)
    state["updated_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".state.")
    with os.fdopen(fd, "w") as handle:
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
else:
    sys.exit("unknown state operation")
'
state_get() { python3 -I -c "$STATE_PY" "$STATE_FILE" get "$1"; }
state_set() { python3 -I -c "$STATE_PY" "$STATE_FILE" set "$@"; }
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

caddy_mode() {
    local mode
    mode="$(state_get caddy_mode)"
    printf '%s\n' "${mode:-systemd}"
}

# --- slots -----------------------------------------------------------------
slot_port() {
    case "$1" in
        blue) echo 8001 ;;
        green) echo 8002 ;;
        *) die "unknown slot '$1' (blue or green)" ;;
    esac
}
container_of() { slot_port "$1" >/dev/null; printf 'vezano-docker-%s\n' "$1"; }

# The slot a deploy starts. With no active slot the first deploy uses green,
# so the phase-2 container (vezano-docker-web on 8001) keeps running until
# the new slot is healthy.
inactive_slot() {
    case "${1:-}" in
        blue) echo green ;;
        green) echo blue ;;
        *) echo green ;;
    esac
}

# Compose interpolates both services, so both image variables must be set.
# An empty slot gets a placeholder that compose is never asked to run.
export_images() {
    local override_slot="${1:-}" override_image="${2:-}" slot image var
    for slot in blue green; do
        if [ "$slot" = "$override_slot" ]; then image="$override_image"; else image="$(state_get "slots.$slot.image")"; fi
        var="VEZANO_IMAGE_$(tr '[:lower:]' '[:upper:]' <<<"$slot")"
        export "$var=${image:-$REPO:unset}"
    done
}

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Refuse anything that could reach port 8000 or listen beyond loopback.
check_config() {
    [ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
    local rendered binds networks
    rendered="$(compose config)" || die "docker compose config failed"
    binds="$(sed -n 's/^ *GUNICORN_BIND: *//p' <<<"$rendered" | tr -d "\"'" | sort | tr '\n' ' ')"
    networks="$(sed -n 's/^ *network_mode: *//p' <<<"$rendered" | tr -d "\"'" | sort | tr '\n' ' ')"
    [ "$binds" = "127.0.0.1:8001 127.0.0.1:8002 " ] \
        || die "refusing: the slots must bind 127.0.0.1:8001 and 127.0.0.1:8002 only (got: $binds)"
    [ "$networks" = "host host " ] || die "refusing: network_mode must be host for both slots"
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

container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }

# True when something other than the slot's own container listens on its port.
port_in_use_by_other() {
    local slot="$1" port
    port="$(slot_port "$slot")"
    command -v ss >/dev/null 2>&1 || return 1
    ss -ltnH "sport = :$port" 2>/dev/null | grep -q . || return 1
    container_running "$(container_of "$slot")" && return 1
    return 0
}

# --- image checks ----------------------------------------------------------
valid_image_ref() { [[ "$1" =~ ^ghcr\.io/stingcompiler/vezano-pro@sha256:[0-9a-f]{64}$ ]]; }
valid_commit() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# a + b: pinned digest only, no ENTRYPOINT, revision label equals the commit.
verify_image() {
    local image="$1" commit="$2" entrypoint revision
    log "pulling $image"
    timeout 600 docker pull --quiet "$image" >/dev/null || die_code "$EXIT_IMAGE" "could not pull $image"
    docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" | grep -qxF "$image" \
        || die_code "$EXIT_IMAGE" "the pulled image does not carry the digest $image"
    entrypoint="$(docker image inspect --format '{{json .Config.Entrypoint}}' "$image")"
    case "$entrypoint" in
        null|"[]") ;;
        *) die_code "$EXIT_IMAGE" "refusing: the image has an ENTRYPOINT ($entrypoint); slots run gunicorn only" ;;
    esac
    revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
    [ "$revision" = "$commit" ] \
        || die_code "$EXIT_IMAGE" "refusing: the image revision label is '${revision:-<none>}', expected $commit"
    log "image verified (commit ${commit:0:8})"
}

# c: read-only migration gate in a one-off container of the NEW image (same
# env file parsing, user, network and read-only rootfs as the slot service).
# It never applies migrations: during the parallel phase schema changes go
# through deploy/standalone/upgrade.sh.
migration_gate() {
    local slot="$1" plan
    log "migration check (read-only) in the new image"
    docker rm -f vezano-docker-migrate-check vezano-docker-migrate-plan >/dev/null 2>&1 || true
    if timeout 300 docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T --name vezano-docker-migrate-check "$slot" \
        python manage.py migrate --check --verbosity 0; then
        log "no pending migrations"
        return 0
    fi
    plan="$(timeout 300 docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T --name vezano-docker-migrate-plan "$slot" \
        python manage.py showmigrations --plan 2>/dev/null)" \
        || die "the migration check failed and the plan could not be read (is the database reachable?)"
    if grep -q '^\[ \]' <<<"$plan"; then
        die_code "$EXIT_PENDING_MIGRATIONS" "$PENDING_MESSAGE"
    fi
    die "the migration check failed but no pending migration is listed"
}

# d: the same full backup the systemd deploy takes before an upgrade.
run_backup() {
    local commit="$1"
    [ -f "$BACKUP_SCRIPT" ] || die "backup script not found: $BACKUP_SCRIPT (re-run deploy/ovh/install.sh)"
    log "taking a protected pre-deploy backup"
    VEZANO_HOME="$BACKUP_HOME" VEZANO_BACKUP_DIR="$BACKUP_DIR" \
        timeout 3600 bash "$BACKUP_SCRIPT" --env-file "$ENV_FILE" --label "pre-docker-${commit:0:12}" \
        || die "the backup failed; nothing was started"
}

# f: health (status, database, commit) and the static pages on the slot port.
smoke_slot() {
    local slot="$1" commit="$2" base body path page
    base="http://127.0.0.1:$(slot_port "$slot")"
    local curl_args=(curl --fail --silent --show-error --max-time 15 -H "Host: $SMOKE_HOST" -H 'X-Forwarded-Proto: https')
    log "GET $base/api/health/ (Host: $SMOKE_HOST)"
    body="$("${curl_args[@]}" "$base/api/health/")" || { log "health request failed"; return 1; }
    printf '%s\n' "$body"
    EXPECTED="${commit:0:8}" python3 -I -c '
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
' <<<"$body" || { log "health payload check failed"; return 1; }
    for path in / /en/; do
        log "GET $path"
        page="$("${curl_args[@]}" "$base$path")" || { log "$path request failed"; return 1; }
        grep -qi '<html' <<<"$page" || { log "$path did not return HTML"; return 1; }
    done
    log "smoke passed on $slot (commit ${commit:0:8})"
}

start_slot() {
    local slot="$1" image="$2"
    export_images "$slot" "$image"
    # The slot may hold an older stopped release; replace it.
    compose rm --stop --force "$slot" >/dev/null 2>&1 || true
    if port_in_use_by_other "$slot"; then
        log "127.0.0.1:$(slot_port "$slot") is already used by another process"
        return 1
    fi
    log "starting $image in slot $slot (127.0.0.1:$(slot_port "$slot"))"
    compose up -d --wait --wait-timeout 120 --no-deps --force-recreate "$slot"
}

# Remove a slot that failed to start or smoke; the active slot is never touched.
discard_slot() {
    local slot="$1"
    log "removing the failed slot $slot"
    compose logs --no-color --tail 80 "$slot" >&2 || true
    compose rm --stop --force "$slot" >/dev/null 2>&1 || true
}

stop_slot() {
    local slot="$1"
    log "stopping slot $slot (kept for rollback)"
    compose stop --timeout 30 "$slot" >/dev/null || log "WARNING: could not stop slot $slot"
}

# --- Caddy -------------------------------------------------------------------
caddy_imports_snippet() {
    [ -f "$CADDYFILE" ] && grep -qE "^[[:space:]]*import[[:space:]]+${CADDY_SNIPPET//./\\.}[[:space:]]*$" "$CADDYFILE"
}

write_snippet() {
    local upstream="$1" label="$2" tmp
    tmp="$(mktemp "$(dirname "$CADDY_SNIPPET")/.vezano-upstream.XXXXXX")"
    {
        printf '# Managed by vezano-docker.sh (caddy-mode, deploy, rollback). Do not edit.\n'
        printf '# %s\n' "$label"
        printf 'reverse_proxy %s\n' "$upstream"
    } > "$tmp"
    chmod 0644 "$tmp"
    mv -f "$tmp" "$CADDY_SNIPPET"
}

# Point the imported snippet at an upstream: validate first, then reload;
# restore the previous snippet when either fails (Caddy keeps its old config).
caddy_switch() {
    local upstream="$1" label="$2" saved=""
    caddy_imports_snippet || die "$CADDYFILE does not import $CADDY_SNIPPET (see deploy/docker/README.md, phase 4)"
    command -v caddy >/dev/null 2>&1 || die "caddy is not on PATH"
    if [ -f "$CADDY_SNIPPET" ]; then
        saved="$CADDY_SNIPPET.previous"
        cp -p "$CADDY_SNIPPET" "$saved"
    fi
    write_snippet "$upstream" "$label"
    if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
        restore_snippet "$saved"
        log "caddy validate rejected the new upstream; snippet restored"
        return 1
    fi
    if ! caddy reload --config "$CADDYFILE" --adapter caddyfile; then
        restore_snippet "$saved"
        log "caddy reload failed; snippet restored (Caddy keeps its running config)"
        return 1
    fi
    log "Caddy now proxies to $upstream"
}

restore_snippet() {
    if [ -n "$1" ]; then mv -f "$1" "$CADDY_SNIPPET"; else rm -f "$CADDY_SNIPPET"; fi
}

# --- commands ----------------------------------------------------------------
cmd_deploy() {
    local image="${1:-}" commit="${2:-}" skip_backup=0
    case "${3:-}" in
        "") ;;
        --skip-backup) skip_backup=1 ;;   # tests only; the controller never passes it
        *) die_code "$EXIT_REFUSED" "unknown option '${3}'" ;;
    esac
    [ "$#" -le 3 ] || die_code "$EXIT_REFUSED" "too many arguments"
    valid_image_ref "$image" || die_code "$EXIT_REFUSED" "refusing: only $REPO@sha256:<64 hex> is accepted"
    valid_commit "$commit" || die_code "$EXIT_REFUSED" "refusing: the commit must be 40 lowercase hex characters"
    acquire_lock
    load_ids
    check_env_file
    [ -d "$MEDIA_DIR" ] || die "$MEDIA_DIR does not exist"

    local active target port mode
    active="$(state_get active)"
    if [ -n "$active" ] && [ "$(state_get "slots.$active.image")" = "$image" ] \
        && container_running "$(container_of "$active")"; then
        log "$image is already active in slot $active"
        return 0
    fi
    target="$(inactive_slot "$active")"
    port="$(slot_port "$target")"
    mode="$(caddy_mode)"
    log "active slot: ${active:-none}; deploying to $target (127.0.0.1:$port); Caddy mode: $mode"

    export_images "$target" "$image"
    check_config
    verify_image "$image" "$commit"                    # a, b
    migration_gate "$target"                           # c
    if [ "$skip_backup" -eq 1 ]; then                  # d
        log "WARNING: backup skipped (--skip-backup)"
    else
        run_backup "$commit"
    fi
    start_slot "$target" "$image" || { discard_slot "$target"; die "slot $target did not become healthy; the active slot is unchanged"; }   # e
    smoke_slot "$target" "$commit" || { discard_slot "$target"; die "smoke failed on $target; the active slot is unchanged"; }            # f

    # g: mark active (state kept to undo a failed Caddy switch).
    local saved_state=""
    if [ -f "$STATE_FILE" ]; then
        saved_state="$(mktemp "$STATE_DIR/.state-before.XXXXXX")"
        cp -p "$STATE_FILE" "$saved_state"
    fi
    local stamp
    stamp="$(now_utc)"
    state_set "active=$target" "previous=$active" \
        "slots.$target.image=$image" "slots.$target.commit=$commit" \
        "slots.$target.deployed_at=$stamp" "slots.$target.activated_at=$stamp"
    log "slot $target is active"

    # h: only when the owner switched Caddy to docker mode (phase 4).
    if [ "$mode" = docker ]; then
        if ! caddy_switch "127.0.0.1:$port" "mode=docker slot=$target commit=${commit:0:8}"; then
            if [ -n "$saved_state" ]; then mv -f "$saved_state" "$STATE_FILE"; else rm -f "$STATE_FILE"; fi
            discard_slot "$target"
            die "the Caddy switch failed; Caddy and the active slot ${active:-none} are unchanged"
        fi
    else
        log "Caddy left as it is (mode $mode)"
    fi
    [ -z "$saved_state" ] || rm -f "$saved_state"

    # i: the old slot stops after a grace period and stays for rollback.
    if [ "$mode" = docker ]; then sleep "$GRACE_SECONDS"; fi
    if [ -n "$active" ]; then
        stop_slot "$active"
    elif container_running "$LEGACY_CONTAINER"; then
        log "stopping the phase-2 container $LEGACY_CONTAINER (kept; remove it with: docker rm $LEGACY_CONTAINER)"
        docker stop --time 30 "$LEGACY_CONTAINER" >/dev/null || log "WARNING: could not stop $LEGACY_CONTAINER"
    fi
    cmd_prune || log "WARNING: image prune failed"          # j
    log "deployed commit ${commit:0:8} to slot $target"
}

cmd_rollback() {
    local to="${1:-}"
    acquire_lock
    if [ "$to" = systemd ]; then
        switch_caddy_mode systemd
        return
    fi
    [ -z "$to" ] || die "usage: vezano-docker.sh rollback [systemd]"
    load_ids
    local active previous image commit mode
    active="$(state_get active)"
    previous="$(state_get previous)"
    mode="$(caddy_mode)"
    image="$( [ -n "$previous" ] && state_get "slots.$previous.image" || true)"
    if [ -z "$previous" ] || [ -z "$image" ]; then
        if [ "$mode" = docker ]; then
            log "no previous slot; rolling Caddy back to systemd"
            switch_caddy_mode systemd
            return
        fi
        die "no previous slot recorded in $STATE_FILE"
    fi
    commit="$(state_get "slots.$previous.commit")"
    log "rolling back from ${active:-none} to $previous (commit ${commit:0:8})"
    export_images
    compose up -d --wait --wait-timeout 120 --no-deps "$previous" \
        || { stop_slot "$previous"; die "slot $previous did not become healthy; nothing changed"; }
    smoke_slot "$previous" "$commit" || { stop_slot "$previous"; die "smoke failed on $previous; nothing changed"; }
    if [ "$mode" = docker ]; then
        caddy_switch "127.0.0.1:$(slot_port "$previous")" "mode=docker slot=$previous commit=${commit:0:8}" \
            || { stop_slot "$previous"; die "the Caddy switch failed; nothing changed"; }
    fi
    state_set "active=$previous" "previous=$active" "slots.$previous.activated_at=$(now_utc)"
    if [ -n "$active" ]; then
        if [ "$mode" = docker ]; then sleep "$GRACE_SECONDS"; fi
        stop_slot "$active"
    fi
    log "slot $previous is active again"
}

# Owner-approved only (phase 4). Never called by deploy or the controller.
switch_caddy_mode() {
    local mode="$1" active commit
    case "$mode" in
        systemd)
            if caddy_imports_snippet; then
                caddy_switch "$SYSTEMD_UPSTREAM" "mode=systemd" || die "Caddy was not changed"
            else
                write_snippet "$SYSTEMD_UPSTREAM" "mode=systemd"
                log "wrote $CADDY_SNIPPET; $CADDYFILE does not import it yet, so Caddy was not reloaded"
            fi ;;
        docker)
            caddy_imports_snippet || die "$CADDYFILE does not import $CADDY_SNIPPET (see deploy/docker/README.md, phase 4)"
            load_ids
            active="$(state_get active)"
            [ -n "$active" ] || die "no active slot; deploy one first"
            commit="$(state_get "slots.$active.commit")"
            container_running "$(container_of "$active")" || die "slot $active is not running"
            smoke_slot "$active" "$commit" || die "smoke failed on $active; Caddy was not changed"
            caddy_switch "127.0.0.1:$(slot_port "$active")" "mode=docker slot=$active commit=${commit:0:8}" \
                || die "Caddy was not changed" ;;
        *) die "usage: vezano-docker.sh caddy-mode systemd|docker" ;;
    esac
    state_set "caddy_mode=$mode"
    log "Caddy mode: $mode"
}

cmd_caddy_mode() {
    acquire_lock
    switch_caddy_mode "${1:-}"
}

cmd_status() {
    if [ -f "$STATE_FILE" ]; then
        log "$STATE_FILE:"; sed 's/^/  /' "$STATE_FILE"
    else
        log "no state yet (no deploy has run)"
    fi
    log "Caddy mode: $(caddy_mode)"
    if [ -f "$CADDY_SNIPPET" ]; then
        log "$CADDY_SNIPPET: $(grep -m1 '^reverse_proxy' "$CADDY_SNIPPET" || true)"
    fi
    caddy_imports_snippet && log "$CADDYFILE imports the snippet" || log "$CADDYFILE does not import the snippet (Caddy stays on the systemd upstream)"
    local name
    for name in vezano-docker-blue vezano-docker-green "$LEGACY_CONTAINER"; do
        docker inspect -f "$name: state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} started={{.State.StartedAt}} image={{.Config.Image}}" \
            "$name" 2>/dev/null || log "$name: absent"
    done
}

cmd_logs() {
    local slot="${1:-}" lines="${2:-200}" name
    if [[ "$slot" =~ ^[0-9]+$ ]]; then lines="$slot"; slot=""; fi
    [[ "$lines" =~ ^[0-9]+$ ]] || die "logs takes a slot and/or a line count"
    slot="${slot:-$(state_get active)}"
    if [ -n "$slot" ]; then name="$(container_of "$slot")"; else name="$LEGACY_CONTAINER"; fi
    docker logs --tail "$lines" --timestamps "$name"
}

cmd_smoke() {
    local slot="${1:-$(state_get active)}"
    [ -n "$slot" ] || die "no active slot; name one: smoke blue|green"
    slot_port "$slot" >/dev/null
    smoke_slot "$slot" "$(state_get "slots.$slot.commit")" || die "smoke failed on $slot"
}

cmd_pull() {
    local ref="${1:-}" source digest commit
    [[ "$ref" =~ ^(main|sha-[0-9a-f]{7,40}|sha256:[0-9a-f]{64})$ ]] || die "usage: vezano-docker.sh pull <main|sha-...|sha256:...>"
    source="$REPO:$ref"
    [[ "$ref" == sha256:* ]] && source="$REPO@$ref"
    log "pulling $source"
    timeout 600 docker pull --quiet "$source" >/dev/null
    digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$source" | grep -m1 "^$REPO@sha256:")" \
        || die "could not resolve the digest of $source"
    commit="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$digest")"
    log "image:  $digest"
    log "commit: $commit"
    log "deploy: vezano-docker.sh deploy $digest $commit"
}

cmd_prune() {
    local keep=" " slot image id
    for slot in blue green; do
        image="$(state_get "slots.$slot.image")"
        [ -n "$image" ] || continue
        id="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || true)"
        [ -z "$id" ] || keep="$keep$id "
    done
    local ids n=0
    # Newest first; one line per image id.
    ids="$(docker image ls --no-trunc --format '{{.CreatedAt}}\t{{.ID}}' "$REPO" | sort -r | cut -f2 | awk '!seen[$0]++')"
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        n=$((n + 1))
        if [ "$n" -le "$KEEP_IMAGES" ] || [[ "$keep" == *" $id "* ]]; then
            continue
        fi
        log "removing $id"
        docker image rm "$id" >/dev/null 2>&1 || log "kept $id (in use)"
    done <<<"$ids"
    log "kept the $KEEP_IMAGES newest $REPO images and the slot images"
}

main() {
    local sub="${1:-}"
    [ -n "$sub" ] || usage
    shift
    require_root
    require_docker
    install -d -m 0755 "$STATE_DIR"
    case "$sub" in
        deploy) cmd_deploy "$@" ;;
        rollback) cmd_rollback "$@" ;;
        caddy-mode) cmd_caddy_mode "$@" ;;
        status) cmd_status ;;
        logs) cmd_logs "$@" ;;
        smoke) cmd_smoke "$@" ;;
        pull) cmd_pull "$@" ;;
        prune) cmd_prune ;;
        *) usage ;;
    esac
}

# Sourcing (deploy/tests) defines the functions only.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
