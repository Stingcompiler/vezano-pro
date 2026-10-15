#!/usr/bin/env python3
"""HEALTHCHECK of the production image (backend/Dockerfile, target production).

Exits 0 when GET /api/health/ answers 200 (database reachable, media
writable), 1 otherwise. Standard library only; the slim image has no curl.

The request carries the headers Caddy adds in production: X-Forwarded-Proto
https (so SECURE_SSL_REDIRECT does not answer 301) and a Host Django allows.
The host is VEZANO_HEALTHCHECK_HOST, else the first concrete entry of
DJANGO_ALLOWED_HOSTS, else localhost; pass the env file with --env-file (or
compose's env_file) so the container environment has DJANGO_ALLOWED_HOSTS.
"""

import os
import sys
import urllib.error
import urllib.request


def health_host(environ):
    explicit = environ.get("VEZANO_HEALTHCHECK_HOST", "").strip()
    if explicit:
        return explicit
    for entry in environ.get("DJANGO_ALLOWED_HOSTS", "").split(","):
        entry = entry.strip().lstrip(".")
        if entry and "*" not in entry:
            return entry
    return "localhost"


def main():
    port = os.environ.get("PORT", "8000")
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/health/",
        headers={"Host": health_host(os.environ), "X-Forwarded-Proto": "https"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return 0 if response.status == 200 else 1
    except (urllib.error.URLError, OSError) as exc:
        print(f"health check failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
