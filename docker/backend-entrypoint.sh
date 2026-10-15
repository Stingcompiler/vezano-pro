#!/bin/sh
# Entrypoint of the LOCAL DEVELOPMENT backend image (backend/Dockerfile).
# Production does not use Docker; see deploy/ovh/README.md.
#
#   serve (default)  wait for Postgres, migrate, createcachetable, then
#                    runserver 0.0.0.0:8000, or gunicorn when
#                    VEZANO_DOCKER_MODE=gunicorn
#   anything else    wait for Postgres, then run that command
#                    (pytest, python manage.py shell, bash, ...)
set -eu

wait_for_db() {
    case "${DATABASE_URL:-}" in
        postgres://*|postgresql://*) ;;
        *) return 0 ;;  # SQLite or unset: nothing to wait for
    esac
    python - <<'PY'
import os
import sys
import time

import psycopg

url = os.environ["DATABASE_URL"]
deadline = time.monotonic() + int(os.environ.get("DB_WAIT_SECONDS", "60"))
while True:
    try:
        psycopg.connect(url, connect_timeout=3).close()
        break
    except psycopg.OperationalError as exc:
        if time.monotonic() > deadline:
            sys.exit(f"Postgres is not reachable: {exc}")
        print("waiting for Postgres...", flush=True)
        time.sleep(1)
PY
}

if [ "${1:-serve}" = "serve" ]; then
    wait_for_db
    python manage.py migrate --noinput
    python manage.py createcachetable
    if [ "${VEZANO_DOCKER_MODE:-runserver}" = "gunicorn" ]; then
        exec gunicorn config.wsgi:application -c gunicorn.conf.py
    fi
    exec python manage.py runserver 0.0.0.0:8000
fi

wait_for_db
exec "$@"
