"""Static checks for the parallel production container (deploy/docker, phase 2).

No Docker needed: the compose file is parsed (PyYAML when present, else a
small parser for the subset the file uses), the scripts pass `bash -n`, and
the wrapper's guards are exercised by sourcing it.
"""

from pathlib import Path
import os
import re
import runpy
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DOCKER_DIR = ROOT / "deploy" / "docker"
COMPOSE = DOCKER_DIR / "docker-compose.prod.yml"
SCRIPTS = ("install-docker.sh", "vezano-docker.sh")


def _scalar(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
        return [_scalar(part) for part in inner.split(",")] if inner else []
    if text in ("true", "false"):
        return text == "true"
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    return text


def _strip_comment(line):
    quote = None
    for index, char in enumerate(line):
        if quote:
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == "#" and (index == 0 or line[index - 1] in " \t"):
            return line[:index].rstrip()
    return line.rstrip()


def _parse_block(lines, start, indent):
    """Parse the block at `indent` from lines[start]; return (value, next index)."""
    if lines[start][1].startswith("- "):
        items, i = [], start
        while i < len(lines) and lines[i][0] == indent and lines[i][1].startswith("- "):
            body = lines[i][1][2:]
            if re.match(r"^[A-Za-z_][\w-]*:( |$)", body):
                # A mapping item: re-indent its first key and parse the block.
                lines[i] = (indent + 2, body)
                value, i = _parse_block(lines, i, indent + 2)
                items.append(value)
            else:
                items.append(_scalar(body))
                i += 1
        return items, i
    mapping, i = {}, start
    while i < len(lines) and lines[i][0] == indent:
        key, _, rest = lines[i][1].partition(":")
        rest = rest.strip()
        i += 1
        if rest:
            mapping[key.strip()] = _scalar(rest)
        elif i < len(lines) and lines[i][0] > indent:
            mapping[key.strip()], i = _parse_block(lines, i, lines[i][0])
        else:
            mapping[key.strip()] = None
    return mapping, i


def load_compose():
    text = COMPOSE.read_text()
    try:
        import yaml
    except ImportError:
        lines = []
        for raw in text.splitlines():
            line = _strip_comment(raw)
            if line.strip():
                lines.append((len(line) - len(line.lstrip()), line.strip()))
        return _parse_block(lines, 0, 0)[0]
    return yaml.safe_load(text)


class ComposeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compose = load_compose()
        cls.web = cls.compose["services"]["web"]

    def test_single_web_service(self):
        self.assertEqual(list(self.compose["services"]), ["web"])

    def test_host_network_and_no_published_ports(self):
        self.assertEqual(self.web["network_mode"], "host")
        self.assertNotIn("ports", self.web)
        self.assertNotIn("expose", self.web)

    def test_binds_loopback_8001_never_8000(self):
        env = self.web["environment"]
        self.assertEqual(env["GUNICORN_BIND"], "127.0.0.1:8001")
        self.assertEqual(str(env["PORT"]), "8001")
        self.assertFalse(env["GUNICORN_BIND"].endswith(":8000"))
        code = "\n".join(_strip_comment(line) for line in COMPOSE.read_text().splitlines())
        self.assertNotIn("8000", code)
        self.assertNotIn("0.0.0.0", code)

    def test_env_file_media_and_user(self):
        self.assertEqual(self.web["env_file"], ["/etc/vezano/vezano.env"])
        self.assertEqual(self.web["environment"]["MEDIA_ROOT"], "/var/lib/vezano/media")
        self.assertEqual(self.web["user"], "${VEZANO_UID:?VEZANO_UID is required}:${VEZANO_GID:?VEZANO_GID is required}")
        [volume] = self.web["volumes"]
        self.assertEqual(volume["type"], "bind")
        self.assertEqual(volume["source"], "/var/lib/vezano/media")
        self.assertEqual(volume["target"], "/var/lib/vezano/media")
        self.assertFalse(volume["read_only"])

    def test_image_is_required_variable(self):
        self.assertTrue(self.web["image"].startswith("${VEZANO_IMAGE:?"))

    def test_hardening_restart_and_limits(self):
        self.assertIs(self.web["read_only"], True)
        self.assertTrue(any(entry.startswith("/tmp:") for entry in self.web["tmpfs"]))
        self.assertEqual(self.web["restart"], "unless-stopped")
        self.assertEqual(self.web["stop_grace_period"], "30s")
        self.assertEqual(self.web["cap_drop"], ["ALL"])
        self.assertIn("vezano-healthcheck", self.web["healthcheck"]["test"])
        self.assertEqual(self.web["mem_limit"], "1g")
        self.assertEqual(self.web["logging"]["driver"], "journald")

    def test_runs_gunicorn_only_never_migrates(self):
        self.assertEqual(self.web["command"][0], "gunicorn")
        self.assertNotIn("entrypoint", self.web)
        for path in (COMPOSE, DOCKER_DIR / "vezano-docker.sh"):
            code = "\n".join(l for l in path.read_text().splitlines() if not l.lstrip().startswith("#"))
            self.assertNotRegex(code, r"\bmigrate\b|createcachetable|manage\.py")


class ScriptTests(unittest.TestCase):
    def test_bash_syntax(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                subprocess.run(["bash", "-n", str(DOCKER_DIR / name)], check=True, timeout=30)

    def test_scripts_are_executable_and_quiet(self):
        for name in SCRIPTS:
            path = DOCKER_DIR / name
            with self.subTest(script=name):
                self.assertTrue(os.access(path, os.X_OK))
                text = path.read_text()
                self.assertIn("set -euo pipefail", text)
                self.assertNotRegex(text, r"set -[a-z]*x|set -o xtrace")

    def test_wrapper_never_touches_systemd_caddy_or_8000(self):
        code = "\n".join(
            l for l in (DOCKER_DIR / "vezano-docker.sh").read_text().splitlines()
            if not l.lstrip().startswith("#")
        )
        self.assertNotIn("systemctl", code)
        self.assertNotRegex(code.lower(), r"\bcaddy\b")
        self.assertNotIn(":8000", code)
        self.assertIn("BIND=127.0.0.1:8001", code)

    def _check_env(self, content):
        with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as handle:
            handle.write(content)
        try:
            return subprocess.run(
                ["bash", "-c", 'source "$1"; ENV_FILE="$2"; check_env_file', "_",
                 str(DOCKER_DIR / "vezano-docker.sh"), handle.name],
                capture_output=True, text=True, timeout=30,
            )
        finally:
            os.unlink(handle.name)

    def test_env_check_names_keys_with_dollar_but_never_values(self):
        result = self._check_env("A=plain\nDJANGO_SECRET_KEY=ab$cd-secret\nB='lit$eral'\nC=\"x$y\"\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", result.stderr)
        self.assertRegex(result.stderr, r"\bC\b")
        self.assertNotIn("secret", result.stderr.replace("DJANGO_SECRET_KEY", ""))
        self.assertNotIn(" B", result.stderr)

    def test_env_check_accepts_plain_and_single_quoted(self):
        result = self._check_env("# comment $\nA=plain\nB='lit$eral'\n")
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which("docker"), "docker is not installed")
    def test_compose_config_validates(self):
        env = dict(os.environ, VEZANO_IMAGE="ghcr.io/stingcompiler/vezano-pro@sha256:" + "0" * 64,
                   VEZANO_UID="1000", VEZANO_GID="1000")
        with tempfile.TemporaryDirectory() as tmp:
            # The real env file lives on the VPS; point the check at an empty one.
            text = COMPOSE.read_text().replace("/etc/vezano/vezano.env", str(Path(tmp) / "vezano.env"))
            (Path(tmp) / "vezano.env").write_text("DEBUG=False\n")
            (Path(tmp) / "compose.yml").write_text(text)
            subprocess.run(["docker", "compose", "-f", str(Path(tmp) / "compose.yml"), "config", "--quiet"],
                           check=True, env=env, timeout=60)


class GunicornBindTests(unittest.TestCase):
    CONF = ROOT / "backend" / "gunicorn.conf.py"

    def _bind(self, **env):
        saved = {key: os.environ.pop(key, None) for key in ("GUNICORN_BIND", "PORT")}
        try:
            os.environ.update(env)
            return runpy.run_path(str(self.CONF))["bind"]
        finally:
            for key in ("GUNICORN_BIND", "PORT"):
                os.environ.pop(key, None)
                if saved[key] is not None:
                    os.environ[key] = saved[key]

    def test_default_is_unchanged(self):
        self.assertEqual(self._bind(), "0.0.0.0:8000")
        self.assertEqual(self._bind(PORT="9000"), "0.0.0.0:9000")

    def test_explicit_bind_wins(self):
        self.assertEqual(self._bind(GUNICORN_BIND="127.0.0.1:8001", PORT="8001"), "127.0.0.1:8001")
        self.assertEqual(self._bind(GUNICORN_BIND="  "), "0.0.0.0:8000")


if __name__ == "__main__":
    unittest.main()
