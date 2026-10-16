"""Blue/green deploy logic of deploy/docker/vezano-docker.sh (phase 3).

No Docker needed: the script is sourced with its paths pointed at a temporary
directory, and docker, curl, caddy, flock, ss, sleep and timeout are fakes on
PATH that record every call. The tests check the order of the steps and that
any failure leaves the active slot, state.json and Caddy untouched.
"""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "docker" / "vezano-docker.sh"
REPO = "ghcr.io/stingcompiler/vezano-pro"
COMMIT = "c" * 40
OLD_COMMIT = "d" * 40
IMAGE = f"{REPO}@sha256:{'a' * 64}"
OLD_IMAGE = f"{REPO}@sha256:{'b' * 64}"

FAKES = {
    "docker": r"""
        printf 'docker %s\n' "$*" >> "$FAKE_CALLS"
        case "$1" in
            pull) exit "${FAKE_PULL:-0}" ;;
            image)
                if [ "$2" = inspect ]; then
                    case "$4" in
                        *RepoDigests*) printf '%s\n' "${FAKE_REPO_DIGEST:-$5}" ;;
                        *Entrypoint*) printf '%s\n' "${FAKE_ENTRYPOINT:-null}" ;;
                        *revision*) printf '%s\n' "${FAKE_REVISION:-}" ;;
                        *.Id*) printf 'sha256:id-%s\n' "${5##*:}" ;;
                    esac
                fi
                exit 0 ;;
            inspect)
                for name; do :; done
                case " ${FAKE_RUNNING:-} " in *" $name "*) echo true ;; *) echo false ;; esac
                exit 0 ;;
            compose)
                shift 3
                case "$1" in
                    config) printf '%s\n' "$FAKE_RENDERED" ;;
                    run)
                        case "$*" in
                            *"migrate --check"*) exit "${FAKE_MIGRATE_CHECK:-0}" ;;
                            *showmigrations*) printf '%b' "${FAKE_PLAN:-}"; exit "${FAKE_PLAN_EXIT:-0}" ;;
                        esac ;;
                    up) exit "${FAKE_UP:-0}" ;;
                esac
                exit 0 ;;
        esac
        exit 0
    """,
    "curl": r"""
        printf 'curl %s\n' "${@: -1}" >> "$FAKE_CALLS"
        case "${@: -1}" in
            */api/health/) printf '{"status": "ok", "database": "ok", "commit": "%s"}\n' "$FAKE_HEALTH_COMMIT" ;;
            *) printf '<html lang="ar"></html>\n' ;;
        esac
        exit "${FAKE_CURL:-0}"
    """,
    "caddy": r"""
        printf 'caddy %s\n' "$*" >> "$FAKE_CALLS"
        case "$1" in
            validate) exit "${FAKE_CADDY_VALIDATE:-0}" ;;
            reload) exit "${FAKE_CADDY_RELOAD:-0}" ;;
        esac
    """,
    "timeout": 'shift; exec "$@"',
    "flock": "exit 0",
    "ss": "exit 0",
    "sleep": 'printf "sleep %s\\n" "$*" >> "$FAKE_CALLS"',
}

RENDERED = textwrap.dedent("""\
    name: vezano-docker
    services:
      blue:
        environment:
          GUNICORN_BIND: 127.0.0.1:8001
        network_mode: host
      green:
        environment:
          GUNICORN_BIND: 127.0.0.1:8002
        network_mode: host
""")


class DeployHarness(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        bindir = self.tmp / "bin"
        bindir.mkdir()
        for name, body in FAKES.items():
            path = bindir / name
            path.write_text("#!/bin/bash\n" + textwrap.dedent(body).strip() + "\n")
            path.chmod(0o755)
        backup = self.tmp / "backup.sh"
        backup.write_text('printf "backup %s\\n" "$*" >> "$FAKE_CALLS"\nexit "${FAKE_BACKUP:-0}"\n')
        (self.tmp / "vezano.env").write_text("DEBUG=False\n")
        (self.tmp / "media").mkdir()
        (self.tmp / "state").mkdir()
        self.calls_file = self.tmp / "calls.log"
        self.calls_file.write_text("")
        self.state_file = self.tmp / "state" / "state.json"
        self.snippet = self.tmp / "vezano-upstream.caddy"
        self.caddyfile = self.tmp / "Caddyfile"
        self.env = dict(
            os.environ,
            PATH=f"{bindir}:{os.environ['PATH']}",
            FAKE_CALLS=str(self.calls_file),
            FAKE_RENDERED=RENDERED,
            FAKE_REVISION=COMMIT,
            FAKE_HEALTH_COMMIT=COMMIT[:8],
        )

    def tearDown(self):
        self._tmp.cleanup()

    def run_script(self, body, **fake_env):
        prelude = f"""
            source "{SCRIPT}"
            T="{self.tmp}"
            STATE_DIR="$T/state"; STATE_FILE="$STATE_DIR/state.json"; LOCK_FILE="$T/lock"
            ENV_FILE="$T/vezano.env"; MEDIA_DIR="$T/media"; BACKUP_SCRIPT="$T/backup.sh"
            CADDYFILE="$T/Caddyfile"; CADDY_SNIPPET="$T/vezano-upstream.caddy"; GRACE_SECONDS=0
            load_ids() {{ export VEZANO_UID=999 VEZANO_GID=982; }}
        """
        env = dict(self.env, **{key: str(value) for key, value in fake_env.items()})
        return subprocess.run(["bash", "-c", textwrap.dedent(prelude) + body],
                              capture_output=True, text=True, env=env, timeout=60)

    def calls(self):
        return self.calls_file.read_text().splitlines()

    def index(self, needle):
        for number, line in enumerate(self.calls()):
            if needle in line:
                return number
        self.fail(f"{needle!r} was not called:\n" + "\n".join(self.calls()))

    def called(self, needle):
        return any(needle in line for line in self.calls())

    def write_state(self, **state):
        self.state_file.write_text(json.dumps(state))

    def state(self):
        return json.loads(self.state_file.read_text()) if self.state_file.exists() else None

    def two_slot_state(self, **extra):
        state = {
            "active": "blue",
            "slots": {"blue": {"image": OLD_IMAGE, "commit": OLD_COMMIT}},
        }
        state.update(extra)
        self.write_state(**state)
        return state

    def import_snippet(self):
        self.caddyfile.write_text(f"pro.vezano.app {{\n    encode gzip\n    import {self.snippet}\n}}\n")


class RefusalTests(DeployHarness):
    def test_refuses_anything_not_pinned_by_digest(self):
        for image, commit in (
            (f"{REPO}:main", COMMIT),
            (f"{REPO}:sha-{COMMIT}", COMMIT),
            (f"{REPO}@sha256:{'a' * 63}", COMMIT),
            (f"{REPO}@sha256:{'A' * 64}", COMMIT),
            (f"ghcr.io/someone/vezano-pro@sha256:{'a' * 64}", COMMIT),
            (f"docker.io/stingcompiler/vezano-pro@sha256:{'a' * 64}", COMMIT),
            (f"sha256:{'a' * 64}", COMMIT),
            (IMAGE, COMMIT[:12]),
            (IMAGE, "../" + COMMIT[3:]),
        ):
            with self.subTest(image=image, commit=commit):
                result = self.run_script(f'cmd_deploy "{image}" "{commit}"')
                self.assertEqual(result.returncode, 3, result.stderr)
                self.assertEqual(self.calls(), [])

    def test_unknown_option_is_refused(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}" --force')
        self.assertEqual(result.returncode, 3)
        self.assertEqual(self.calls(), [])

    def test_revision_label_must_equal_commit(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_REVISION="e" * 40)
        self.assertEqual(result.returncode, 4)
        self.assertIn("revision label", result.stderr)
        self.assertFalse(self.called("compose -f") and self.called(" run "))
        self.assertFalse(self.called("backup"))
        self.assertFalse(self.called(" up "))
        self.assertIsNone(self.state())

    def test_image_with_entrypoint_is_refused(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_ENTRYPOINT='["vezano-entrypoint"]')
        self.assertEqual(result.returncode, 4)
        self.assertIn("ENTRYPOINT", result.stderr)
        self.assertFalse(self.called("backup"))

    def test_pulled_image_must_carry_the_digest(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_REPO_DIGEST=OLD_IMAGE)
        self.assertEqual(result.returncode, 4)
        self.assertFalse(self.called("backup"))

    def test_config_with_another_bind_is_refused(self):
        rendered = RENDERED.replace("127.0.0.1:8002", "0.0.0.0:8000")
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_RENDERED=rendered)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.called("docker pull"))


class MigrationGateTests(DeployHarness):
    def test_pending_migrations_stop_with_distinct_code(self):
        state = self.two_slot_state()
        result = self.run_script(
            f'cmd_deploy "{IMAGE}" "{COMMIT}"',
            FAKE_MIGRATE_CHECK=1, FAKE_PLAN="[X]  sales.0041_a\\n[ ]  sales.0042_b\\n",
        )
        self.assertEqual(result.returncode, 10, result.stderr)
        self.assertIn("pending migrations — apply via the manual upgrade path", result.stderr)
        self.assertFalse(self.called("backup"))
        self.assertFalse(self.called(" up "))
        self.assertFalse(any("compose" in line and (" rm " in line or " stop " in line) for line in self.calls()))
        self.assertEqual(self.state(), state)

    def test_gate_runs_read_only_check_in_the_new_image_slot(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}" --skip-backup')
        self.assertEqual(result.returncode, 0, result.stderr)
        check = self.calls()[self.index("migrate --check")]
        self.assertIn("run --rm --no-deps -T", check)
        self.assertIn(" green python manage.py migrate --check", check)
        self.assertFalse(any("manage.py migrate" in line and "--check" not in line for line in self.calls()))

    def test_unreadable_plan_is_a_plain_failure_not_pending(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_MIGRATE_CHECK=1, FAKE_PLAN_EXIT=1)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("pending migrations", result.stderr)
        self.assertFalse(self.called("backup"))

    def test_failed_check_without_pending_is_a_plain_failure(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_MIGRATE_CHECK=1, FAKE_PLAN="[X]  sales.0041_a\\n")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.called(" up "))


class DeployFlowTests(DeployHarness):
    def test_first_deploy_uses_green_and_stops_the_phase2_container(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_RUNNING="vezano-docker-web")
        self.assertEqual(result.returncode, 0, result.stderr)
        # a/b pull, c gate, d backup, e start, f smoke, in that order.
        order = [self.index("docker pull"), self.index("migrate --check"), self.index("backup "),
                 self.index(" up -d --wait"), self.index("/api/health/"), self.index("docker stop")]
        self.assertEqual(order, sorted(order))
        self.assertIn("up -d --wait --wait-timeout 120 --no-deps --force-recreate green", self.calls()[self.index(" up -d")])
        self.assertIn("--env-file", self.calls()[self.index("backup ")])
        self.assertIn(f"--label pre-docker-{COMMIT[:12]}", self.calls()[self.index("backup ")])
        self.assertIn("curl http://127.0.0.1:8002/api/health/", self.calls())
        state = self.state()
        self.assertEqual(state["active"], "green")
        self.assertNotIn("previous", state)
        self.assertEqual(state["slots"]["green"]["image"], IMAGE)
        self.assertEqual(state["slots"]["green"]["commit"], COMMIT)
        self.assertIn("docker stop --time 30 vezano-docker-web", self.calls())

    def test_backup_runs_before_the_slot_starts(self):
        self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(self.index("backup "), self.index(" up -d"))
        self.assertLess(self.index("migrate --check"), self.index("backup "))

    def test_inactive_slot_is_selected_and_old_slot_kept_stopped(self):
        self.write_state(active="green", slots={"green": {"image": OLD_IMAGE, "commit": OLD_COMMIT}})
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_RUNNING="vezano-docker-green")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--force-recreate blue", self.calls()[self.index(" up -d")])
        self.assertIn("curl http://127.0.0.1:8001/api/health/", self.calls())
        state = self.state()
        self.assertEqual((state["active"], state["previous"]), ("blue", "green"))
        self.assertEqual(state["slots"]["green"]["image"], OLD_IMAGE)
        stop = self.calls()[self.index(" stop --timeout 30 ")]
        self.assertTrue(stop.endswith(" green"))
        self.assertFalse(any(" rm " in line and line.endswith(" green") for line in self.calls()))
        self.assertTrue(self.called("image ls"))  # j: prune

    def test_same_image_already_active_is_a_no_op(self):
        self.write_state(active="blue", slots={"blue": {"image": IMAGE, "commit": COMMIT}})
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_RUNNING="vezano-docker-blue")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.called("docker pull"))

    def test_skip_backup_flag(self):
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}" --skip-backup')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.called("backup "))
        self.assertIn("backup skipped", result.stdout)

    def test_failed_backup_starts_nothing(self):
        state = self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_BACKUP=1)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.called(" up "))
        self.assertEqual(self.state(), state)


class FailureCleanupTests(DeployHarness):
    def assert_active_untouched(self, state):
        self.assertEqual(self.state(), state)
        for line in self.calls():
            if " rm " in line or " stop " in line:
                self.assertFalse(line.endswith(" blue"), line)
        self.assertTrue(any(" rm --stop --force green" in line for line in self.calls()))
        self.assertFalse(self.called("caddy"))

    def test_unhealthy_new_slot_is_removed_and_active_kept(self):
        state = self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_UP=1, FAKE_RUNNING="vezano-docker-blue")
        self.assertEqual(result.returncode, 1)
        self.assertIn("active slot is unchanged", result.stderr)
        self.assert_active_untouched(state)

    def test_smoke_commit_mismatch_removes_new_slot(self):
        state = self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_HEALTH_COMMIT=OLD_COMMIT[:8])
        self.assertEqual(result.returncode, 1)
        self.assertIn("smoke failed", result.stderr)
        self.assert_active_untouched(state)

    def test_smoke_page_failure_removes_new_slot(self):
        state = self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_CURL=22)
        self.assertEqual(result.returncode, 1)
        self.assert_active_untouched(state)


class CaddyTests(DeployHarness):
    def test_caddy_untouched_by_default(self):
        self.import_snippet()
        self.two_slot_state()
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.called("caddy"))
        self.assertFalse(self.snippet.exists())
        self.assertFalse(self.called("sleep"))
        self.assertNotIn("caddy_mode", self.state())

    def test_docker_mode_validates_before_reload_and_points_at_new_slot(self):
        self.import_snippet()
        self.snippet.write_text("reverse_proxy 127.0.0.1:8001\n")
        self.two_slot_state(caddy_mode="docker")
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_RUNNING="vezano-docker-blue")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(self.index("caddy validate"), self.index("caddy reload"))
        self.assertIn(f"--config {self.caddyfile} --adapter caddyfile", self.calls()[self.index("caddy reload")])
        self.assertIn("reverse_proxy 127.0.0.1:8002\n", self.snippet.read_text())
        # The old slot stops only after the switch and the grace period.
        self.assertLess(self.index("caddy reload"), self.index("sleep 0"))
        self.assertLess(self.index("sleep 0"), self.index(" stop --timeout 30 "))
        self.assertEqual(self.state()["active"], "green")

    def test_failed_validate_restores_snippet_state_and_slot(self):
        self.import_snippet()
        self.snippet.write_text("reverse_proxy 127.0.0.1:8001\n")
        state = self.two_slot_state(caddy_mode="docker")
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_CADDY_VALIDATE=1)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.called("caddy reload"))
        self.assertEqual(self.snippet.read_text(), "reverse_proxy 127.0.0.1:8001\n")
        self.assertEqual(self.state()["active"], state["active"])
        self.assertNotIn("green", self.state().get("slots", {}))
        self.assertTrue(any(" rm --stop --force green" in line for line in self.calls()))

    def test_failed_reload_restores_snippet(self):
        self.import_snippet()
        self.snippet.write_text("reverse_proxy 127.0.0.1:8001\n")
        self.two_slot_state(caddy_mode="docker")
        result = self.run_script(f'cmd_deploy "{IMAGE}" "{COMMIT}"', FAKE_CADDY_RELOAD=1)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.snippet.read_text(), "reverse_proxy 127.0.0.1:8001\n")
        self.assertEqual(self.state()["active"], "blue")

    def test_caddy_mode_systemd_without_import_only_writes_snippet(self):
        result = self.run_script("cmd_caddy_mode systemd")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("reverse_proxy 127.0.0.1:8000\n", self.snippet.read_text())
        self.assertFalse(self.called("caddy"))
        self.assertEqual(self.state()["caddy_mode"], "systemd")

    def test_caddy_mode_docker_requires_the_import(self):
        self.two_slot_state()
        result = self.run_script("cmd_caddy_mode docker", FAKE_RUNNING="vezano-docker-blue")
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not import", result.stderr)
        self.assertFalse(self.called("caddy"))
        self.assertNotIn("caddy_mode", self.state())

    def test_caddy_mode_docker_smokes_then_switches(self):
        self.import_snippet()
        self.two_slot_state()
        result = self.run_script("cmd_caddy_mode docker", FAKE_RUNNING="vezano-docker-blue",
                                 FAKE_HEALTH_COMMIT=OLD_COMMIT[:8])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(self.index("/api/health/"), self.index("caddy validate"))
        self.assertLess(self.index("caddy validate"), self.index("caddy reload"))
        self.assertIn("reverse_proxy 127.0.0.1:8001\n", self.snippet.read_text())
        self.assertEqual(self.state()["caddy_mode"], "docker")

    def test_caddy_mode_rejects_other_values(self):
        result = self.run_script("cmd_caddy_mode both")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.snippet.exists())

    def test_no_automatic_path_calls_caddy_mode(self):
        code = SCRIPT.read_text()
        body = code[code.index("cmd_deploy() {"):code.index("cmd_rollback() {")]
        self.assertNotIn("caddy_mode=", body)
        self.assertNotIn("switch_caddy_mode", body)


class RollbackTests(DeployHarness):
    def test_rollback_restarts_previous_slot_and_stops_current(self):
        self.write_state(active="green", previous="blue", slots={
            "blue": {"image": OLD_IMAGE, "commit": OLD_COMMIT},
            "green": {"image": IMAGE, "commit": COMMIT},
        })
        result = self.run_script("cmd_rollback", FAKE_HEALTH_COMMIT=OLD_COMMIT[:8])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("up -d --wait --wait-timeout 120 --no-deps blue", self.calls()[self.index(" up -d")])
        self.assertLess(self.index("/api/health/"), self.index(" stop --timeout 30 "))
        self.assertTrue(self.calls()[self.index(" stop --timeout 30 ")].endswith(" green"))
        state = self.state()
        self.assertEqual((state["active"], state["previous"]), ("blue", "green"))
        self.assertFalse(self.called("caddy"))

    def test_rollback_smoke_failure_changes_nothing(self):
        state = {"active": "green", "previous": "blue", "slots": {
            "blue": {"image": OLD_IMAGE, "commit": OLD_COMMIT},
            "green": {"image": IMAGE, "commit": COMMIT},
        }}
        self.write_state(**state)
        result = self.run_script("cmd_rollback", FAKE_HEALTH_COMMIT="00000000")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state(), state)
        self.assertTrue(self.calls()[self.index(" stop --timeout 30 ")].endswith(" blue"))

    def test_rollback_without_previous_in_docker_mode_goes_to_systemd(self):
        self.import_snippet()
        self.snippet.write_text("reverse_proxy 127.0.0.1:8002\n")
        self.write_state(active="green", caddy_mode="docker", slots={"green": {"image": IMAGE, "commit": COMMIT}})
        result = self.run_script("cmd_rollback")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("reverse_proxy 127.0.0.1:8000\n", self.snippet.read_text())
        self.assertLess(self.index("caddy validate"), self.index("caddy reload"))
        self.assertEqual(self.state()["caddy_mode"], "systemd")

    def test_rollback_without_previous_in_systemd_mode_fails(self):
        self.write_state(active="green", slots={"green": {"image": IMAGE, "commit": COMMIT}})
        result = self.run_script("cmd_rollback")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.called(" up "))


if __name__ == "__main__":
    unittest.main()
