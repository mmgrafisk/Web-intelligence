"""Build and adversarially verify the checked-in container isolation model."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).parents[1]
COMPOSE_FILE = SERVICE_ROOT / "compose.isolation.json"


def _find_executable(name: str) -> str | None:
    executable = shutil.which(name)
    if executable:
        return executable
    if os.name == "nt" and name == "docker":
        desktop_cli = Path("C:/Program Files/Docker/Docker/resources/bin/docker.exe")
        if desktop_cli.is_file():
            return str(desktop_cli)
    return None


def _run(command: list[str], *, timeout: int = 300) -> None:
    # Commands are assembled only from fixed arguments and engine paths resolved by shutil.which.
    runtime_environment = os.environ.copy()
    engine_directory = str(Path(command[0]).parent)
    runtime_environment["PATH"] = os.pathsep.join(
        (engine_directory, runtime_environment.get("PATH", ""))
    )
    subprocess.run(  # noqa: S603
        command,
        cwd=SERVICE_ROOT,
        check=True,
        timeout=timeout,
        env=runtime_environment,
    )


def _select_engine(requested: str | None) -> tuple[str, list[str]]:
    if requested == "podman" or (requested is None and _find_executable("podman")):
        executable = _find_executable("podman")
        if not executable:
            raise RuntimeError("Podman was requested but is not installed")
        return "podman", [executable, "compose"]
    if requested == "docker" or (requested is None and _find_executable("docker")):
        executable = _find_executable("docker")
        if not executable:
            raise RuntimeError("Docker was requested but is not installed")
        return "docker", [executable, "compose"]
    raise RuntimeError("Install rootless Podman or Docker with Compose to run isolation tests")


def _podman_is_rootless(executable: str) -> bool:
    result = subprocess.run(  # noqa: S603
        [executable, "info", "--format", "json"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    info = json.loads(result.stdout)
    return bool(info.get("host", {}).get("security", {}).get("rootless"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=("podman", "docker"))
    parser.add_argument(
        "--allow-rootful-test",
        action="store_true",
        help="Allow a rootful CI/test engine; production launch remains rootless-only.",
    )
    args = parser.parse_args()
    engine, compose = _select_engine(args.engine)
    if engine == "podman" and not _podman_is_rootless(compose[0]) and not args.allow_rootful_test:
        raise RuntimeError("Podman must run rootless outside the explicit CI test mode")

    base = [*compose, "-f", str(COMPOSE_FILE), "--profile", "isolation-test"]
    _run([*base, "config", "--quiet"], timeout=60)
    try:
        _run([*base, "build"], timeout=600)
        _run(
            [
                *base,
                "up",
                "--detach",
                "egress-gateway",
                "publisher-sentinel",
                "control-sentinel",
            ],
            timeout=120,
        )
        _run(
            [
                *base,
                "run",
                "--rm",
                "--no-deps",
                "crawler",
                "python",
                "-m",
                "web_intelligence.isolation_probe",
                "--gateway",
                "egress-gateway",
                "--blocked-dns",
                "publisher-sentinel",
                "--blocked-dns",
                "control-sentinel",
            ],
            timeout=120,
        )
    finally:
        _run([*base, "down", "--volumes", "--remove-orphans"], timeout=120)
    print(f"container isolation verified with {engine}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f"isolation runtime verification failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
