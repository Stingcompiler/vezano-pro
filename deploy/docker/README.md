# Production containers on the VPS — phase 3 (blue/green, parallel run)

Phase 3 of the approved container plan (`docs/docker.md`). Every push to
`main` can now start the new production image
(`ghcr.io/stingcompiler/vezano-pro`, pinned by digest) in one of two
container slots on the OVH VPS, **next to** the systemd release:

| Slot | Bind | Container |
|---|---|---|
| `blue` | `127.0.0.1:8001` | `vezano-docker-blue` |
| `green` | `127.0.0.1:8002` | `vezano-docker-green` |

**Production traffic does not change in this phase.** Caddy still proxies to
the systemd gunicorn on `127.0.0.1:8000`; `deploy-ovh`, `upgrade.sh`, the
`vezano-web` service and the timers work exactly as before. The mechanism to
switch Caddy exists and is tested, but nothing runs it automatically: the
switch is phase 4 and needs the owner's approval.

| File | Purpose |
|---|---|
| `install-docker.sh` | Docker Engine + compose plugin, journald logs, `live-restore` (phase 2). Idempotent. |
| `docker-compose.prod.yml` | services `blue` and `green`: identical except for the port and image variable; host network, gunicorn on loopback, `/etc/vezano/vezano.env`, media bind mount, read-only rootfs, healthcheck, 1 GiB / 1.5 CPU each. No published ports. |
| `vezano-docker.sh` | `deploy`, `rollback`, `caddy-mode`, `status`, `logs`, `smoke`, `pull`, `prune`. |

## The deploy flow

`vezano-docker.sh deploy <ghcr.io/stingcompiler/vezano-pro@sha256:…> <commit40>`
(as root; CI calls it through the restricted gateway, see below):

1. **Refuse** anything not pinned by digest in that one repository, or a
   commit that is not 40 hex characters (exit 3).
2. **Pull** the digest; check that the image carries that digest, has no
   `ENTRYPOINT`, and that its `org.opencontainers.image.revision` label
   equals the commit (exit 4 otherwise).
3. **Migration gate:** `python manage.py migrate --check` in a one-off
   container of the **new** image against the shared database (read-only).
   If migrations are pending it stops with exit **10** and
   `pending migrations — apply via the manual upgrade path`; nothing is
   started or changed. Schema changes keep going through `upgrade.sh` while
   systemd is primary.
4. **Backup:** `/usr/local/libexec/vezano/backup.sh --env-file
   /etc/vezano/vezano.env --label pre-docker-<commit12>` (the same reviewed
   script the systemd deploy uses), into `/var/backups/vezano`.
5. **Start** the image in the **inactive** slot (the first deploy uses
   `green`, so the phase-2 container on 8001 keeps running until then) and
   wait for the healthcheck.
6. **Smoke** that slot's port: `/api/health/` (`status`, `database` ok,
   `commit` = the commit), `/` and `/en/`.
7. **Mark it active** in `/var/lib/vezano-docker/state.json`.
8. **Caddy:** only when `caddy_mode` is `docker` (phase 4): point
   `/etc/caddy/vezano-upstream.caddy` at the new slot, `caddy validate`, then
   `caddy reload`. In this phase the mode is `systemd`, so Caddy is not touched.
9. **Stop the old slot** (after a 20 s grace period in docker mode). It is
   kept stopped, not removed, for instant rollback. After the first deploy
   the phase-2 `vezano-docker-web` container is stopped too.
10. **Prune** images, keeping the 3 newest and the two slot images.

Any failure before step 8 removes the new slot and leaves the active slot,
`state.json` and Caddy untouched. A failed Caddy switch restores the previous
snippet and `state.json` as well.

## How the owner enables it (one time)

On the VPS, from a checkout of the merged commit:

```bash
sed 's/^[^ ]* //' /var/lib/vezano-deploy/.ssh/authorized_keys > /tmp/vezano-deploy.pub
sudo bash deploy/ovh/install.sh /tmp/vezano-deploy.pub /usr/bin/python3.12
sudo /usr/local/libexec/vezano/vezano-docker.sh status
```

The first line reuses the deploy key that is already installed. `install.sh`
is idempotent: it installs the updated `gateway.py`, `deploy_release.py`,
`vezano-docker.sh` and `docker-compose.prod.yml` into
`/usr/local/libexec/vezano` (and refreshes `/opt/vezano-docker` when it
exists), and adds `image_repository` and `docker_lock` to
`/etc/vezano-deploy.json`. It does not restart anything or touch Caddy.

Then, from your machine, enable the CI job:

```bash
gh variable set OVH_DOCKER_DEPLOY_ENABLED --body true
```

The job `deploy-docker-parallel` runs after `prod-image` on `main`, in the
`ovh-production` environment with the same secrets and stale-`main` check as
`deploy-ovh`. It waits for `deploy-ovh` to finish (so the two backups never
overlap) but runs whatever its result, and `deploy-ovh` never waits for it. It
sends `deploy-image <commit> sha256:<digest>`; the gateway accepts only that
exact shape, and the controller builds the image name from the repository
fixed in `/etc/vezano-deploy.json`. To turn it off: delete the variable.

## Watching it

```bash
sudo /usr/local/libexec/vezano/vezano-docker.sh status       # state.json, Caddy mode, both slots
sudo /usr/local/libexec/vezano/vezano-docker.sh logs          # active slot (or: logs green 500)
sudo /usr/local/libexec/vezano/vezano-docker.sh smoke         # active slot (or: smoke blue)
sudo cat /var/lib/vezano-docker/state.json
sudo ls -t /var/log/vezano-deploy/ | head                    # *-image.log per CI deploy
journalctl CONTAINER_TAG=vezano-docker-green -n 100
```

To deploy by hand: `vezano-docker.sh pull main` prints the digest and commit
and the exact `deploy` command to run.

## Rollback

```bash
sudo /usr/local/libexec/vezano/vezano-docker.sh rollback          # start the previous slot again
sudo /usr/local/libexec/vezano/vezano-docker.sh rollback systemd  # Caddy back to systemd :8000
```

`rollback` starts the stopped previous slot, smokes it, (in docker mode)
switches Caddy to it, marks it active and stops the current one. With no
previous slot in docker mode it puts Caddy back on systemd.

## Why Caddy is untouched until phase 4

In this phase the containers prove themselves on real data while the systemd
release serves every request. Switching traffic is a production change that
needs the owner's approval, so `deploy` only moves Caddy when `caddy_mode` is
`docker`, and only the explicit `caddy-mode docker` command sets that.

The phase 4 step (owner-approved, not done here). The repository has no copy
of the VPS Caddyfile, so this is the minimal edit:

```bash
sudo /usr/local/libexec/vezano/vezano-docker.sh caddy-mode systemd   # writes the snippet (127.0.0.1:8000); no reload yet
# in /etc/caddy/Caddyfile, inside the site block, replace the line
#     reverse_proxy 127.0.0.1:8000
# with
#     import /etc/caddy/vezano-upstream.caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy                                          # still :8000, no behaviour change
sudo /usr/local/libexec/vezano/vezano-docker.sh caddy-mode docker    # the switch
```

The snippet holds a single `reverse_proxy <upstream>` line. If the site's
`reverse_proxy` has an options block, review that before the edit.
`caddy-mode docker` refuses to run unless the Caddyfile imports the snippet.

## Why it is safe

- **Loopback only.** The slots bind `127.0.0.1:8001`/`8002`; no ports are
  published, and the script refuses a rendered config with any other bind.
- **No migrations.** The image has no entrypoint, the slots run gunicorn only,
  and the gate only reads (`migrate --check`, `showmigrations`).
- **Restricted access.** CI still only reaches the `vezano-deploy` forced
  command; the controller and script are root-owned in `/usr/local/libexec/vezano`.
  Their output goes to the protected log, not to public Actions logs.
- **Bounded.** 1 GiB memory, 1.5 CPUs, 256 processes and 2 workers per slot;
  journald logs; read-only root filesystem, all capabilities dropped.

---

## بالعربية (مختصر)

**المرحلة 3:** نشر أزرق/أخضر للحاوية **بالتوازي** مع إصدار systemd. الخانة
`blue` على `127.0.0.1:8001` و`green` على `127.0.0.1:8002`. لا تغيير على حركة
الإنتاج: Caddy يبقى على المنفذ 8000 حتى المرحلة 4 بموافقة المالك.

**تسلسل `deploy`:** رفض أي صورة غير مثبّتة بالـ digest ← سحب الصورة والتحقق من
أن وسم الـ revision يساوي الـ commit ← فحص الترحيلات للقراءة فقط داخل الصورة
الجديدة (إن وُجدت ترحيلات معلّقة: يتوقف برمز 10 ورسالة «طبّقها عبر مسار
الترقية اليدوي») ← نسخة احتياطية بـ `backup.sh` ← تشغيل الخانة غير النشطة ←
فحص الصحة والصفحات ← تسجيلها نشطة في `state.json` ← (فقط في وضع docker)
تبديل Caddy بعد `caddy validate` ← إيقاف الخانة القديمة مع إبقائها للرجوع ←
تنظيف الصور مع إبقاء آخر 3. أي فشل قبل تبديل Caddy يحذف الخانة الجديدة ويترك
الخانة النشطة كما هي.

**التفعيل (مرة واحدة على الخادم):**

```bash
sed 's/^[^ ]* //' /var/lib/vezano-deploy/.ssh/authorized_keys > /tmp/vezano-deploy.pub
sudo bash deploy/ovh/install.sh /tmp/vezano-deploy.pub /usr/bin/python3.12
sudo /usr/local/libexec/vezano/vezano-docker.sh status
```

ثم من جهازك: `gh variable set OVH_DOCKER_DEPLOY_ENABLED --body true`.

**المتابعة:** `vezano-docker.sh status` و`logs` و`smoke` والملف
`/var/lib/vezano-docker/state.json` وسجلات `/var/log/vezano-deploy/*-image.log`.

**الرجوع:** `vezano-docker.sh rollback` (الخانة السابقة) أو
`vezano-docker.sh rollback systemd` (إعادة Caddy إلى systemd).

**لماذا لا يُلمس Caddy الآن:** تحويل الحركة تغيير إنتاجي يحتاج موافقة المالك؛
لذلك لا يغيّر `deploy` إعداد Caddy إلا في وضع `docker`، ولا يضبط هذا الوضع إلا
الأمر الصريح `caddy-mode docker` في المرحلة 4.
