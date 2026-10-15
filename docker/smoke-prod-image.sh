#!/usr/bin/env bash
#
# Smoke test of the production image (backend/Dockerfile, target production).
#
#   docker/smoke-prod-image.sh IMAGE EXPECTED_COMMIT
#
# Needs Docker and a throwaway PostgreSQL reachable from the host network at
# SMOKE_DATABASE_URL (CI: the job's postgres service on 127.0.0.1:5432).
# Port 8000 on the host must be free. Every container runs exactly as
# production will: --read-only, a tmpfs /tmp, a volume on MEDIA_ROOT and
# settings from an env file only.
#
# Checks: migrate + createcachetable in one-off containers; the container
# turns healthy (the image's HEALTHCHECK); /api/health/ is 200 with database
# ok, media writable and commit = EXPECTED_COMMIT[:8]; / and /en/ serve the
# static export; the process is non-root and the root filesystem is read-only.

set -euo pipefail

IMAGE="${1:?usage: smoke-prod-image.sh IMAGE EXPECTED_COMMIT}"
EXPECTED="${2:?usage: smoke-prod-image.sh IMAGE EXPECTED_COMMIT}"
EXPECTED="${EXPECTED:0:8}"
DB_URL="${SMOKE_DATABASE_URL:-postgres://ci:ci@127.0.0.1:5432/vezano_smoke}"
NAME=vezano-prod-smoke
VOLUME=vezano-prod-smoke-media
BASE=http://localhost:8000

log() { printf '[smoke] %s\n' "$*"; }
fail() { printf '[smoke] FAIL: %s\n' "$*" >&2; exit 1; }

ENV_FILE="$(mktemp)"
cleanup() {
    status=$?
    if [ "$status" -ne 0 ] && docker inspect "$NAME" >/dev/null 2>&1; then
        docker logs --tail 80 "$NAME" >&2 || true
    fi
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
    rm -f "$ENV_FILE"
    exit "$status"
}
trap cleanup EXIT

# Minimal production-shaped settings. The secret is a throwaway test value.
cat > "$ENV_FILE" <<EOF
DEBUG=False
DJANGO_SECRET_KEY=prod-image-smoke-test-only-not-a-secret
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=$DB_URL
VEZANO_DEPLOYMENT_MODE=saas
EOF

RUN_FLAGS=(--network host --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m
           --env-file "$ENV_FILE" -v "$VOLUME:/var/lib/vezano/media")

log "image: $IMAGE"
log "migrate (one-off container)"
docker run --rm "${RUN_FLAGS[@]}" "$IMAGE" python manage.py migrate --noinput -v0
log "createcachetable (one-off container)"
docker run --rm "${RUN_FLAGS[@]}" "$IMAGE" python manage.py createcachetable

log "start gunicorn"
docker run -d --name "$NAME" "${RUN_FLAGS[@]}" "$IMAGE" >/dev/null

log "wait for the HEALTHCHECK to report healthy"
health=""
for _ in $(seq 1 45); do
    health="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo gone)"
    [ "$health" = healthy ] && break
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = true ] \
        || fail "the container exited"
    sleep 2
done
[ "$health" = healthy ] || fail "container health is '$health' after 90s"

# Caddy terminates TLS and forwards the scheme; without the header Django's
# SECURE_SSL_REDIRECT answers 301, as it should.
CURL=(curl --fail --silent --show-error --max-time 10 -H 'X-Forwarded-Proto: https')

log "GET /api/health/"
body="$("${CURL[@]}" "$BASE/api/health/")"
printf '%s\n' "$body"
EXPECTED="$EXPECTED" python3 -c '
import json, os, sys
data = json.loads(sys.stdin.read())
expected = os.environ["EXPECTED"]
errors = []
for key, want in (("status", "ok"), ("database", "ok"), ("commit", expected)):
    if data.get(key) != want:
        errors.append("%s=%r, expected %r" % (key, data.get(key), want))
if not (data.get("media") or {}).get("writable"):
    errors.append("media is not writable")
if errors:
    sys.exit("health: " + "; ".join(errors))
' <<<"$body" || fail "health payload"

for path in / /en/; do
    log "GET $path (static export)"
    page="$("${CURL[@]}" "$BASE$path")"
    grep -qi '<html' <<<"$page" || fail "$path did not return the exported HTML"
done

log "runs as non-root"
uid="$(docker exec "$NAME" id -u)"
[ "$uid" != 0 ] || fail "the process runs as root"
log "uid=$uid gid=$(docker exec "$NAME" id -g)"

log "root filesystem is read-only"
[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$NAME")" = true ] \
    || fail "the container was not started with --read-only"
if docker exec "$NAME" sh -c 'touch /srv/vezano/backend/.write-probe' 2>/dev/null; then
    fail "the code directory is writable"
fi
docker exec "$NAME" sh -c 'touch /tmp/.probe && rm /tmp/.probe' \
    || fail "/tmp is not writable"

log "image size: $(docker image inspect -f '{{.Size}}' "$IMAGE" | awk '{printf "%.0f MB", $1/1000/1000}')"
log "all checks passed"
