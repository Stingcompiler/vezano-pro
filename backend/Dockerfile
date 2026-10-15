# Vezano Pro backend images.
#
# The app/dev/runtime targets are for LOCAL DEVELOPMENT AND TEST PARITY
# (docker-compose.yml). The `production` target is the image CI pushes to
# ghcr.io/stingcompiler/vezano-pro (docs/docker.md, "Production image").
# Production itself still runs on the OVH VPS under systemd from a packaged
# release (deploy/ovh/README.md) until phases 2-4 of the container plan land;
# nothing here is used by CI's deploy-ovh job or by render.yaml.
#
# The build context is the repository root, because Django also serves the
# Next.js export (frontend/out, see backend/core/frontend.py) and reads the
# root VERSION file:
#
#   docker build -f backend/Dockerfile -t vezano-backend .              # runtime
#   docker build -f backend/Dockerfile --target dev -t vezano-backend:dev .
#   docker build -f backend/Dockerfile --target production \
#       --build-arg GIT_COMMIT=<full sha> -t vezano-pro .
#
# Stages:
#   builder  installs the pinned runtime wheels (requirements.lock) into /opt/venv
#   app      slim runtime: venv + code + collectstatic, non-root user
#   dev      app + pytest / pytest-django / flake8 (what CI installs on top)
#   prod-src    the application tree for production, test modules pruned
#   production  the production image: gunicorn, fixed non-root UID, read-only
#               rootfs friendly, HEALTHCHECK, commit baked in
#   runtime  the default (last) target: the same as app

ARG PYTHON_IMAGE=python:3.12-slim

# ---------------------------------------------------------------- builder
FROM ${PYTHON_IMAGE} AS builder
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
# Every pin in the lock ships a manylinux wheel for x86_64 and aarch64 except
# http_ece, which is pure Python; no compiler is needed.
COPY backend/requirements.lock /tmp/requirements.lock
RUN pip install -r /tmp/requirements.lock

# -------------------------------------------------------------------- app
FROM ${PYTHON_IMAGE} AS app
# Match your host user on Linux so files written into the bind mount stay yours.
ARG APP_UID=1000
ARG APP_GID=1000
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEDIA_ROOT=/srv/vezano-data/media
COPY docker/backend-entrypoint.sh /usr/local/bin/vezano-entrypoint
# The group id may already exist in the base image (macOS's staff gid 20 is
# Debian's dialout), so reuse it instead of failing.
RUN chmod 0755 /usr/local/bin/vezano-entrypoint \
 && (getent group "${APP_GID}" >/dev/null || groupadd --gid "${APP_GID}" vezano) \
 && useradd --uid "${APP_UID}" --gid "${APP_GID}" --no-create-home \
      --home-dir /srv/vezano --shell /bin/bash vezano \
 && mkdir -p /srv/vezano/backend /srv/vezano-data/media \
 && chown -R "${APP_UID}:${APP_GID}" /srv/vezano /srv/vezano-data
COPY --from=builder /opt/venv /opt/venv
COPY --chown=${APP_UID}:${APP_GID} VERSION /srv/vezano/VERSION
COPY --chown=${APP_UID}:${APP_GID} frontend/out /srv/vezano/frontend/out
COPY --chown=${APP_UID}:${APP_GID} backend /srv/vezano/backend
WORKDIR /srv/vezano/backend
USER vezano
# Build-time only key: collectstatic never signs anything. It is not the
# dev secret and never reaches a running container.
RUN DJANGO_SECRET_KEY=collectstatic-build-only VEZANO_ENV_FILE=/dev/null \
    python manage.py collectstatic --noinput -v0
EXPOSE 8000
ENTRYPOINT ["vezano-entrypoint"]
CMD ["serve"]

# -------------------------------------------------------------------- dev
FROM app AS dev
USER root
COPY backend/requirements.txt backend/requirements.lock /tmp/
# Same command as CI: the runtime pins are already installed, so this only
# adds the test/lint tooling (pytest, pytest-django, flake8).
RUN PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    pip install -r /tmp/requirements.txt -c /tmp/requirements.lock
USER vezano

# --------------------------------------------------------------- prod-src
# Only what the production process needs: the code, the Next.js export Django
# serves (CI restores the tested frontend artifact into frontend/out before
# building) and VERSION. Test modules, pytest config, dev scripts and the
# requirements files stay out; nothing outside the tests imports a test module.
FROM ${PYTHON_IMAGE} AS prod-src
COPY VERSION /src/VERSION
COPY frontend/out /src/frontend/out
COPY backend /src/backend
RUN cd /src/backend \
 && find . -type f \( -name 'test_*.py' -o -name 'tests.py' -o -name '*_tests.py' \
      -o -name 'conftest.py' -o -name 'pytest.ini' -o -name 'requirements*' \) -delete \
 && rm -rf scripts \
 && test -f /src/frontend/out/index.html

# ------------------------------------------------------------- production
# Runs gunicorn with backend/gunicorn.conf.py (0.0.0.0:$PORT, default 8000).
# Settings come only from the environment: VEZANO_ENV_FILE=/dev/null means no
# .env file is read unless the operator points it at a mounted one. The code
# is owned by root and read-only to the app user, so the container runs with
# --read-only; the only writable paths are a tmpfs /tmp and MEDIA_ROOT
# (/var/lib/vezano/media, a bind mount in production).
FROM ${PYTHON_IMAGE} AS production
# Fixed ids so the media bind mount has a stable owner. 10001 by default; set
# them to the VPS `vezano` user's uid/gid when the image is deployed there.
ARG APP_UID=10001
ARG APP_GID=10001
# Baked in by CI: /api/health/ reports GIT_COMMIT[:8] (ops/release.py).
ARG GIT_COMMIT=""
ARG BUILD_DATE=""
ARG SOURCE_URL=https://github.com/Stingcompiler/vezano-pro
LABEL org.opencontainers.image.title="Vezano Pro" \
      org.opencontainers.image.description="Vezano Pro ERP: Django API and Next.js export served by gunicorn" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.url="${SOURCE_URL}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    VEZANO_ENV_FILE=/dev/null \
    MEDIA_ROOT=/var/lib/vezano/media \
    PORT=8000 \
    GIT_COMMIT=${GIT_COMMIT}
RUN groupadd --gid "${APP_GID}" vezano \
 && useradd --uid "${APP_UID}" --gid "${APP_GID}" --no-create-home \
      --home-dir /nonexistent --shell /usr/sbin/nologin vezano \
 && mkdir -p /var/lib/vezano/media \
 && chown "${APP_UID}:${APP_GID}" /var/lib/vezano/media
COPY --from=builder /opt/venv /opt/venv
COPY --from=prod-src /src /srv/vezano
COPY docker/healthcheck.py /usr/local/bin/vezano-healthcheck
WORKDIR /srv/vezano/backend
# Built as root so the app user cannot rewrite code or static files at run
# time. The key is build-only: collectstatic never signs anything.
RUN chmod 0755 /usr/local/bin/vezano-healthcheck \
 && DJANGO_SECRET_KEY=collectstatic-build-only \
    python manage.py collectstatic --noinput -v0 \
 && python -m compileall -q -j 0 /srv/vezano/backend
USER ${APP_UID}:${APP_GID}
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["vezano-healthcheck"]
CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]

# ---------------------------------------------------------------- runtime
FROM app AS runtime
