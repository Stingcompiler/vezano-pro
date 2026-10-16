"""deploy/ovh/vezano-healthcheck: retries, the Caddy-aware web check, alerts.

systemctl, curl, pg_isready, df, find, stat, logger and sleep are fakes on
PATH that record every call; the script's paths point at a temporary
directory through its VEZANO_HC_* variables.
"""

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "ovh" / "vezano-healthcheck"

FAKES = {
    "systemctl": r"""
        printf 'systemctl %s\n' "$*" >> "$FAKE_CALLS"
        for unit; do :; done
        case " ${FAKE_DOWN_UNITS:-} " in *" $unit "*) exit 3 ;; esac
        exit 0
    """,
    "curl": r"""
        url="${@: -1}"
        printf 'curl %s\n' "$url" >> "$FAKE_CALLS"
        n=$(grep -c "^curl $url\$" "$FAKE_CALLS")
        case " ${FAKE_BAD_URLS:-} " in
            *" $url "*) [ "$n" -le "${FAKE_BAD_TIMES:-99}" ] && exit 7 ;;
        esac
        printf '{"status":"ok"}\n'
    """,
    "pg_isready": "exit 0",
    "df": r"""printf 'Use%%\n %s%%\n' "${FAKE_DISK:-40}" """,
    "find": r"""printf '1 %s/2026-10-16-nightly\n' "$FAKE_BACKUPS" """,
    "stat": r"""date +%s""",
    "logger": r"""printf 'logger %s\n' "$*" >> "$FAKE_CALLS" """,
    "sleep": r"""printf 'sleep %s\n' "$*" >> "$FAKE_CALLS" """,
}


class HealthcheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        for name, body in FAKES.items():
            path = bin_dir / name
            path.write_text("#!/usr/bin/env bash\n" + textwrap.dedent(body))
            path.chmod(0o755)
        self.calls = self.tmp / "calls"
        self.calls.write_text("")
        self.alerts = self.tmp / "alerts"
        alert = self.tmp / "alert"
        alert.write_text(f'#!/usr/bin/env bash\nprintf "%s\\n---\\n" "$1" >> "{self.alerts}"\n')
        alert.chmod(0o755)
        (self.tmp / "meminfo").write_text("MemTotal: 1000 kB\nMemAvailable: 500 kB\n")
        (self.tmp / "r2").write_text("")
        self.snippet = self.tmp / "vezano-upstream.caddy"
        self.env = {
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "FAKE_CALLS": str(self.calls),
            "FAKE_BACKUPS": str(self.tmp / "backups"),
            "VEZANO_HC_STATE_DIR": str(self.tmp / "state"),
            "VEZANO_HC_ALERT": str(alert),
            "VEZANO_HC_CADDY_SNIPPET": str(self.snippet),
            "VEZANO_HC_BACKUP_DIR": str(self.tmp / "backups"),
            "VEZANO_HC_R2_MARKER": str(self.tmp / "r2"),
            "VEZANO_HC_MEMINFO": str(self.tmp / "meminfo"),
        }

    def run_check(self, **extra):
        env = {**self.env, **{k: str(v) for k, v in extra.items()}}
        return subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True, text=True)

    def docker_mode(self, port=8001):
        self.snippet.write_text(f"# mode=docker slot=blue\nreverse_proxy 127.0.0.1:{port}\n")

    def state(self):
        return (self.tmp / "state" / "health.state").read_text().strip()

    def alert_text(self):
        return self.alerts.read_text() if self.alerts.exists() else ""

    def test_healthy_run_sends_nothing(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state(), "healthy")
        self.assertEqual(self.alert_text(), "")
        self.assertNotIn("sleep", self.calls.read_text())

    def test_short_restart_is_retried_not_reported(self):
        # systemd mode (no snippet): the local upstream fails once, then recovers.
        result = self.run_check(FAKE_BAD_URLS="http://127.0.0.1:8000/api/health/", FAKE_BAD_TIMES=1)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state(), "healthy")
        self.assertEqual(self.alert_text(), "")
        self.assertIn("sleep 20", self.calls.read_text())

    def test_persistent_failure_alerts_once_after_all_attempts(self):
        result = self.run_check(FAKE_DOWN_UNITS="caddy.service")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state(), "failed")
        self.assertEqual(self.calls.read_text().count("sleep 20"), 2)
        self.assertIn("Caddy service is down", self.alert_text())
        self.assertIn("failed 3 checks in a row", self.alert_text())
        # Still failing on the next run: no second alert.
        self.run_check(FAKE_DOWN_UNITS="caddy.service")
        self.assertEqual(self.alert_text().count("PRODUCTION ALERT"), 1)
        # Recovery is reported.
        self.run_check()
        self.assertIn("VEZANO RECOVERED", self.alert_text())

    def test_docker_mode_ignores_the_systemd_fallback(self):
        self.docker_mode()
        result = self.run_check(FAKE_DOWN_UNITS="vezano-web.service")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text()
        self.assertNotIn("vezano-web.service", calls)
        self.assertIn("curl http://127.0.0.1:8001/api/health/", calls)

    def test_docker_mode_reports_the_active_slot(self):
        self.docker_mode(8002)
        result = self.run_check(FAKE_BAD_URLS="http://127.0.0.1:8002/api/health/")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Web upstream 127.0.0.1:8002 is not healthy", self.alert_text())

    def test_systemd_mode_still_checks_the_service(self):
        self.snippet.write_text("# mode=systemd\nreverse_proxy 127.0.0.1:8000\n")
        result = self.run_check(FAKE_DOWN_UNITS="vezano-web.service")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Django/Gunicorn service is down", self.alert_text())

    def test_disk_and_memory_thresholds(self):
        (self.tmp / "meminfo").write_text("MemTotal: 1000 kB\nMemAvailable: 50 kB\n")
        result = self.run_check(FAKE_DISK=85, VEZANO_HC_ATTEMPTS=1)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Root disk usage is 85%", self.alert_text())
        self.assertIn("Available memory is 10% or lower", self.alert_text())

    def test_missing_r2_marker(self):
        (self.tmp / "r2").unlink()
        result = self.run_check(VEZANO_HC_ATTEMPTS=1)
        self.assertEqual(result.returncode, 1)
        self.assertIn("No successful R2 backup marker found", self.alert_text())


if __name__ == "__main__":
    unittest.main()
