# Vezano Pro backend image: LOCAL DEVELOPMENT AND TEST PARITY ONLY.
#
# Production does NOT run in Docker. It runs on an OVH VPS under systemd from
# a packaged release (deploy/ovh/README.md, deploy/standalone/). Nothing here
# is used by CI's deploy job or by render.yaml.
#
# The build context is the repository root, because Django also serves the
# Next.js export (frontend/out, see backend/core/frontend.py) and reads the
# root VERSION file:
#
#   docker build -f backend/Dockerfile -t vezano-backend .              # runtime
#   docker build -f backend/Dockerfile --target dev -t vezano-backend:dev .
#
# Stages:
#   builder  installs the pinned runtime wheels (requirements.lock) into /opt/venv
#   app      slim runtime: venv + code + collectstatic, non-root user
#   dev      app + pytest / pytest-django / flake8 (what CI installs on top)
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

# ---------------------------------------------------------------- runtime
FROM app AS runtime
