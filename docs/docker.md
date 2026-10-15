# Docker (local development)

Docker is the project's standard environment (owner decision, 2026-10-15).
This stack is for local development and test parity.

> **Production today** runs on an OVH VPS under systemd from a packaged release
> (`deploy/ovh/README.md`); moving it into containers is a planned, phased
> change (see [Production image](#production-image)). CI already builds and
> pushes the production image (phase 1), but CI's `deploy-ovh` job still
> ships the systemd release, and none of the local values below are
> production settings.

## What you get

| Service | What it runs | Host port |
|---|---|---|
| `db` | PostgreSQL 16 (same major as production), data in the `pgdata` volume | `5433` |
| `backend` | Django on Python 3.12 with the pinned `requirements.lock`; `runserver` with hot reload (or gunicorn, see below) | `8000` |
| `frontend` | `next dev` (Node 20, as CI) against the backend API | `3000` |
| `seed` *(profile)* | a demo company + owner, via `seed_demo --owner <email> --platform --yes` | — |
| `test` *(profile)* | the backend pytest suite against Postgres 16, as CI's postgres leg | — |
| `frontend-build` *(profile)* | `npm run build`, writing `frontend/out` into your checkout | — |

The backend entrypoint waits for Postgres, runs `migrate` and
`createcachetable` (the `vezano_cache` table the DatabaseCache needs), then
starts the server. Email uses Django's console backend: messages (invitations,
OTP codes, reset codes) are printed in `make logs`, never sent.

## Quick start

Requires Docker with the Compose plugin (`docker compose version`).

```bash
cp .env.docker.example .env   # optional; every value has a default
make up                       # build + start db, backend, frontend
make ps                       # wait until backend is "healthy"
curl http://localhost:8000/api/health/   # {"status":"ok","database":"ok",...}
open http://localhost:3000/
make seed                     # demo company; prints a random owner password once
```

Sign in at `http://localhost:3000/login/` with `dev-owner@vezano.test` and the
printed password. The password is generated on the spot and stored nowhere;
`make seed SEED_RESET_PASSWORD=1` issues a new one. Re-running `make seed`
adds another month of demo sales to the same company.

The backend also serves the committed `frontend/out` export at
`http://localhost:8000/`, exactly like production. `make build-frontend`
rebuilds that export inside a container.

## Commands

| Command | What it does |
|---|---|
| `make up` / `make down` | start / stop the stack (data is kept) |
| `make logs` | follow all logs (console email shows here) |
| `make ps` | services and health |
| `make shell` | bash in the backend container (`python manage.py ...`) |
| `make psql` | psql on the local database |
| `make seed` | demo company + owner |
| `make test` | the full backend suite on Postgres 16 |
| `make test ARGS="core website accounts"` | a subset (any pytest arguments) |
| `make test-smoke` | `core website accounts` |
| `make build-frontend` | `npm run build` → `frontend/out` |
| `make config` | validate `docker-compose.yml` |
| `make clean` | stop and **delete** the local database and media volumes |

Without `make`, use the same `docker compose` commands, e.g.
`docker compose run --rm test pytest -q core`.

## Configuration

All settings come from `.env` (copied from `.env.docker.example`):

- `BACKEND_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT` (defaults 8000, 3000, 5433).
  The frontend's `NEXT_PUBLIC_API_BASE_URL` and the backend's
  `CORS_ALLOWED_ORIGINS` follow these ports automatically.
- `VEZANO_DOCKER_MODE=gunicorn` runs the backend under gunicorn with
  `backend/gunicorn.conf.py`, the process model of the VPS, instead of
  `runserver`.
- `HOST_UID` / `HOST_GID` (Linux): set to `id -u` / `id -g` so files written
  into the bind-mounted checkout stay yours; then `docker compose build`.
- `WATCHPACK_POLLING=true` if `next dev` misses file edits.

The backend's secret is a dev-only value, clearly marked in
`docker-compose.yml`; `VEZANO_ENV_FILE=/dev/null` keeps a `backend/.env` from
your host checkout out of the containers. Never put production secrets in
`.env`.

## Notes

- **Hot reload.** The whole checkout is bind-mounted at `/srv/vezano`, so
  backend edits reload `runserver` and frontend edits reload `next dev`. The
  frontend's `node_modules` lives in a container volume; after changing
  `package-lock.json`, run `docker compose build frontend && docker compose up -d -V frontend`.
  After changing `requirements*`, run `docker compose build backend`.
- **Tests.** The `test` service uses the same env as CI (`DJANGO_SECRET_KEY=ci-test-secret-key`,
  `DEBUG=True`, a Postgres `DATABASE_URL`); pytest-django creates and drops
  its own `test_<db>` database, so it never touches your dev data.
- **Images.** `backend/Dockerfile` is multi-stage (`python:3.12-slim`): the
  default target is a slim runtime (non-root, `collectstatic` at build);
  compose uses the `dev` target, which adds pytest/flake8. Its build context
  is the repository root (`.dockerignore` keeps it to `backend/`, `VERSION`,
  `docker/` and `frontend/out`).
- **Migrations.** The stack only applies the committed migrations; it never
  creates new ones.

## Production image

`backend/Dockerfile --target production` is the image production will run once
the container plan is complete. **Until phases 2–4 land, production is still
the systemd packaged release deployed by CI's `deploy-ovh` job**; nothing pulls
this image yet.

The container plan (owner approved 2026-10-15). PostgreSQL stays native on the
VPS with its backups and R2; Caddy, `/etc/vezano/vezano.env`, the media
directory and the timers stay; images are deployed by digest with blue/green
through Caddy.

| Phase | What | Status |
|---|---|---|
| 1 | production image + GHCR push in CI | **done** (this section) |
| 2 | Docker Engine on the VPS, `docker-compose.prod.yml` (ports on 127.0.0.1, journald logs, image prune) | planned |
| 3 | deploy controller: pull by digest, migration check in the new image, backup, blue/green Caddy switch, instant rollback (the `vezano-deploy` gateway stays) | planned |
| 4 | parallel run on a second port + smoke tests, then the Caddy switch; the systemd release kept 2 weeks for rollback | planned |
| 5 | cleanup | planned |

### Registry, tags and digest

CI's `prod-image` job runs on every push to `main` after `backend`, `frontend`
and `e2e-offline` pass, in parallel with `deploy-ovh` (it never blocks it). It
builds from the tested commit and the frontend job's tested `frontend/out`
artifact and pushes to `ghcr.io/stingcompiler/vezano-pro`:

| Tag | Meaning |
|---|---|
| `sha-<full commit>` | the exact commit (immutable in practice) |
| `sha-<first 8 chars>` | the same, short form (matches `/api/health/` `commit`) |
| `main` | the latest `main` build (moves; never deploy by it) |

The job prints the pushed **digest** (`sha256:…`) in its log and step summary;
deploys will reference `ghcr.io/stingcompiler/vezano-pro@sha256:…`. The push
carries an SBOM and a max-mode provenance attestation
(`docker buildx imagetools inspect <ref> --format '{{json .Provenance}}'`).
After the push the job smoke-tests that digest (below). On pull requests the
`docker-dev` job builds the same target without pushing and runs the same
smoke test against the committed `frontend/out`.

```bash
docker pull ghcr.io/stingcompiler/vezano-pro:sha-<commit>
docker pull ghcr.io/stingcompiler/vezano-pro@sha256:<digest>
```

### What is in it

`python:3.12-slim`, the pinned `requirements.lock` venv (built in a separate
stage), the backend code with the test modules, `pytest.ini`, `scripts/` and
requirements files pruned, `VERSION`, the Next.js export in
`/srv/vezano/frontend/out`, and `collectstatic` output. No `.git`,
`node_modules`, `.venv`, `.env` or media (`.dockerignore`). The smoke test
and the `docker-dev` job's "Image sizes" step print the size (297 MB uncompressed on the first CI build, PR #244).

- **Process:** exec-form `CMD ["gunicorn", "config.wsgi:application", "-c",
  "gunicorn.conf.py"]`, binding `0.0.0.0:$PORT` (`PORT=8000`). Any other
  command replaces it, e.g. `python manage.py migrate`.
- **Commit:** CI passes `--build-arg GIT_COMMIT=<sha>`, baked into the
  `GIT_COMMIT` env, so `/api/health/` reports `commit` = the first 8 chars.
- **Labels:** `org.opencontainers.image.source`, `.revision`, `.created`.
- **Health:** `HEALTHCHECK` runs `vezano-healthcheck` (`docker/healthcheck.py`):
  `GET /api/health/` with `X-Forwarded-Proto: https` and a `Host` from
  `VEZANO_HEALTHCHECK_HOST`, else the first entry of `DJANGO_ALLOWED_HOSTS`,
  else `localhost`. Healthy means 200: database reachable and media writable.

### User, UID and filesystem

- Runs as **UID/GID 10001** (`vezano`), never root. Build args
  `APP_UID`/`APP_GID` change it; phase 2 will set them to the VPS `vezano`
  user's ids so the bind-mounted media keeps its owner.
- The code under `/srv/vezano` is owned by root and not writable by the app.
- **Read-only root filesystem:** run with `--read-only`. The only writable
  paths are a tmpfs `/tmp` (gunicorn's worker heartbeat files, upload temp
  files; `HOME=/tmp`) and `MEDIA_ROOT` (default `/var/lib/vezano/media`), which
  must be a mount writable by the UID above.

```bash
docker run -d --name vezano --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  -v /var/lib/vezano/media:/var/lib/vezano/media \
  --env-file /etc/vezano/vezano.env \
  -p 127.0.0.1:8000:8000 \
  ghcr.io/stingcompiler/vezano-pro@sha256:<digest>
```

### Environment

Settings come only from the environment (`VEZANO_ENV_FILE=/dev/null` in the
image, so no `.env` file is read). Pass the env file as container environment
(`--env-file`, compose `env_file:`), which also lets the HEALTHCHECK see
`DJANGO_ALLOWED_HOSTS`; or mount it read-only and set `VEZANO_ENV_FILE` to its
path. The keys are those of `deploy/standalone/vezano.env.example`; the
minimum to start:

| Variable | Notes |
|---|---|
| `DJANGO_SECRET_KEY` | required; the process refuses to start without it when `DEBUG=False` |
| `DEBUG` | `False` (the default) |
| `DJANGO_ALLOWED_HOSTS` | comma-separated; the SaaS hosts are added in `saas` mode |
| `DATABASE_URL` | `postgres://…`; on the VPS the native PostgreSQL |
| `VEZANO_DEPLOYMENT_MODE` | `saas` for pro.vezano.app |
| `MEDIA_ROOT` | default `/var/lib/vezano/media` |
| `WEB_CONCURRENCY`, `GUNICORN_TIMEOUT`, `PORT` | gunicorn sizing (`backend/gunicorn.conf.py`) |

Behind Caddy, TLS is terminated on the host and `X-Forwarded-Proto` tells
Django the scheme; without it `DEBUG=False` answers 301 to https.
`migrate` and `createcachetable` run in one-off containers from the same image
(phase 3 gates them behind a backup).

### Smoke test

`docker/smoke-prod-image.sh IMAGE COMMIT` (needs Docker and a throwaway
Postgres on `127.0.0.1:5432`, as in CI): `migrate` and `createcachetable` in
one-off containers, then gunicorn with `--read-only`, a tmpfs `/tmp` and a
media volume; it waits for the HEALTHCHECK to turn healthy, expects
`/api/health/` 200 with `database` ok, media writable and `commit` =
`COMMIT[:8]`, `/` and `/en/` to serve the export, a non-root UID and an
unwritable code directory.

---

## ملخص بالعربية

Docker هو بيئة التطوير والاختبار المعتمدة. **الإنتاج ما زال لا يعمل في Docker**:
يعمل على خادم OVH عبر systemd من حزمة إصدار موقّعة — راجع
[`deploy/ovh/README.md`](../deploy/ovh/README.md). نقل الإنتاج إلى الحاويات يتم على مراحل؛
المرحلة الأولى فقط منجزة: يبني CI صورة الإنتاج (`--target production`) ويدفعها إلى
`ghcr.io/stingcompiler/vezano-pro` مع اختبار تشغيل، ولا يستخدمها النشر بعد.

- `make up` يشغّل قاعدة PostgreSQL 16 والخادم الخلفي (Django مع إعادة تحميل تلقائية) والواجهة (`next dev`).
- الفحص: `http://localhost:8000/api/health/` والواجهة على `http://localhost:3000/`.
- `make seed` ينشئ شركة تجريبية ومالكًا بكلمة مرور عشوائية تُعرض مرة واحدة فقط.
- `make test` يشغّل اختبارات الخادم على PostgreSQL كما في CI، ويمكن تمرير مجموعة: `make test ARGS="core website accounts"`.
- البريد لا يُرسل؛ يظهر في `make logs`. كل القيم السرية هنا للتطوير فقط.
