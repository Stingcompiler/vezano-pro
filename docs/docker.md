# Docker (local development)

Docker is the project's standard environment (owner decision, 2026-10-15).
This stack is for local development and test parity.

> **Production today** runs on an OVH VPS under systemd from a packaged release
> (`deploy/ovh/README.md`); moving it into containers is a planned, separate
> change. Nothing below is used by CI's deploy job yet, and none of the values
> here are production settings.

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

---

## ملخص بالعربية

Docker في هذا المستودع **للتطوير المحلي والاختبار فقط**. **الإنتاج لا يستخدم Docker**:
يعمل على خادم OVH عبر systemd من حزمة إصدار موقّعة — راجع
[`deploy/ovh/README.md`](../deploy/ovh/README.md).

- `make up` يشغّل قاعدة PostgreSQL 16 والخادم الخلفي (Django مع إعادة تحميل تلقائية) والواجهة (`next dev`).
- الفحص: `http://localhost:8000/api/health/` والواجهة على `http://localhost:3000/`.
- `make seed` ينشئ شركة تجريبية ومالكًا بكلمة مرور عشوائية تُعرض مرة واحدة فقط.
- `make test` يشغّل اختبارات الخادم على PostgreSQL كما في CI، ويمكن تمرير مجموعة: `make test ARGS="core website accounts"`.
- البريد لا يُرسل؛ يظهر في `make logs`. كل القيم السرية هنا للتطوير فقط.
