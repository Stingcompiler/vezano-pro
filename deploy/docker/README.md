# Production container on the VPS — phase 2 (parallel run)

Phase 2 of the approved container plan: Docker Engine on the OVH VPS and the
production image (`ghcr.io/stingcompiler/vezano-pro`, phase 1, #244) running
**next to** the systemd release, on `127.0.0.1:8001`. Production traffic does
not change: Caddy still proxies to the systemd gunicorn on `127.0.0.1:8000`,
and the `vezano-web` service and the `vezano-backup`, `vezano-daily-scans`
and `vezano-healthcheck` timers are not touched.

| File | Purpose |
|---|---|
| `install-docker.sh` | installs Docker Engine + compose plugin (Docker's apt repo when it publishes the host codename, else Ubuntu's `docker.io` + `docker-compose-v2`), writes `/etc/docker/daemon.json` (journald logs, `live-restore`), enables Docker. Idempotent. |
| `docker-compose.prod.yml` | service `web`: image by digest (`VEZANO_IMAGE`), host network, gunicorn on `127.0.0.1:8001`, `/etc/vezano/vezano.env`, media bind mount, read-only rootfs, healthcheck, 1 GiB / 1.5 CPU limits. |
| `vezano-docker.sh` | operator wrapper: `pull`, `up`, `status`, `logs`, `smoke`, `down`, `prune`. |

## Run phase 2 on the VPS

As root, from a checkout or copy of this directory:

```bash
install -d -m 0755 /opt/vezano-docker
install -m 0755 deploy/docker/install-docker.sh deploy/docker/vezano-docker.sh /opt/vezano-docker/
install -m 0644 deploy/docker/docker-compose.prod.yml /opt/vezano-docker/
/opt/vezano-docker/install-docker.sh
/opt/vezano-docker/vezano-docker.sh pull main
/opt/vezano-docker/vezano-docker.sh up
/opt/vezano-docker/vezano-docker.sh smoke
```

- `pull <ref>` accepts `main`, `sha-<short|full>` or `sha256:<digest>`,
  resolves the digest and records it in `/var/lib/vezano-docker/current.env`
  (the previous record is kept as `previous.env`). `up` always runs that
  digest, never a moving tag. It refuses an image that has an `ENTRYPOINT`.
- `up` runs as the host `vezano` user's uid/gid (`id vezano`), so uploads in
  `/var/lib/vezano/media` keep their owner, and waits for the healthcheck.
- `smoke` sends `GET /api/health/` to `127.0.0.1:8001` with
  `Host: vezano.app` (override with `SMOKE_HOST=...`) and checks `status`,
  `database` and that `commit` equals the image's commit, then `/` and `/en/`.
- `status`, `logs [N]` (also `journalctl CONTAINER_TAG=vezano-docker-web`),
  `prune` (keeps the 3 newest images and the recorded one).

`up` stops with a clear message, naming only the key, if
`/etc/vezano/vezano.env` has a value with `$` outside single quotes: compose
expands `$` there and systemd does not. Single-quote that value (systemd reads
`KEY='va$lue'` the same way) and run `up` again. Any setting in the env file
that points at a host path other than the media directory is not visible in
the container; the smoke test shows whether that matters.

## Stop it

```bash
/opt/vezano-docker/vezano-docker.sh down
```

That removes the container only. To remove Docker entirely as well:
`apt-get purge docker-ce docker-ce-cli containerd.io docker-compose-plugin`
(or `docker.io docker-compose-v2`); the systemd release never depended on it.

## Why it is safe

- **Not reachable from outside.** Gunicorn binds `127.0.0.1:8001`
  (`GUNICORN_BIND`); no ports are published, and Caddy has no route to 8001.
  The wrapper refuses any other bind and never calls `systemctl` or edits Caddy.
- **No migrations, no start-up writes.** The production image has no
  entrypoint; the compose command is gunicorn only. Migrations, backups and
  the deploy gate stay with the systemd release and its deploy controller.
- **Same database, used only when asked.** The container uses the production
  PostgreSQL through `DATABASE_URL` from the env file, like the systemd
  release. It reads or writes only when a request reaches it, and nothing
  reaches 8001 except `smoke` (and the container's own healthcheck, which only opens a
  database connection and checks that media is writable). Neither creates business data.
- **Bounded.** 1 GiB memory, 1.5 CPUs, 256 processes, 2 workers; logs go to
  journald; read-only root filesystem, all capabilities dropped,
  `no-new-privileges`.
- Installing Docker adds its iptables chains; with host networking and no
  published ports no container port is opened.

## Phases 3–4 (later, not in this change)

- **Phase 3:** the deploy controller (`vezano-deploy` gateway kept) pulls the
  new image by digest, runs the migration check inside it, takes the backup,
  then switches Caddy blue/green between two loopback ports, with instant
  rollback. The timers run their commands inside the image.
- **Phase 4:** after parallel runs and smoke tests, Caddy is switched to the
  container. The systemd release stays installed for 2 weeks as the rollback.

---

## بالعربية (مختصر)

المرحلة 2: تشغيل حاوية الإنتاج **بالتوازي** مع إصدار systemd على
`127.0.0.1:8001` فقط. لا تغيير على حركة الإنتاج: Caddy يبقى على المنفذ 8000،
وخدمة `vezano-web` والمؤقتات كما هي.

التشغيل (بصلاحية root): انسخ الملفات إلى `/opt/vezano-docker` ثم
`install-docker.sh` ← `vezano-docker.sh pull main` ← `up` ← `smoke`.
الإيقاف: `vezano-docker.sh down`.

لماذا هو آمن: المنفذ محلي فقط ولا يصل إليه أحد غير اختبار `smoke`، والحاوية لا
تشغّل الترحيلات (migrations) ولا تكتب شيئًا عند الإقلاع، وتستخدم قاعدة البيانات
نفسها فقط عند وصول طلب إليها.

المرحلتان 3–4 لاحقًا: نشر بالـ digest مع فحص الترحيلات والنسخ الاحتياطي ثم تبديل
Caddy (أزرق/أخضر) مع رجوع فوري، وإبقاء إصدار systemd أسبوعين للرجوع.
