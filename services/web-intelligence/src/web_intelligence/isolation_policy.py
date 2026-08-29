"""Fail-closed checks for the worker isolation Compose model."""

from __future__ import annotations

import json
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any

UNTRUSTED_WORKERS = ("crawler", "browser-worker", "ai-worker")
SENSITIVE_MARKERS = (
    "api_key",
    "secret",
    "token",
    "password",
    "publisher",
    "ssh_auth_sock",
    "docker_host",
)
FORBIDDEN_TEXT = ("docker.sock", "podman.sock", "/var/run/", "/run/user/", ".ssh")


class IsolationPolicyError(ValueError):
    """The container model grants a forbidden worker capability."""


def load_compose(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as compose_file:
        value = json.load(compose_file)
    if not isinstance(value, dict):
        raise IsolationPolicyError("Compose document must be an object")
    return value


def _environment(service: Mapping[str, Any]) -> dict[str, str]:
    raw = service.get("environment", {})
    if isinstance(raw, dict):
        return {str(key): str(value) for key, value in raw.items()}
    if isinstance(raw, list):
        result: dict[str, str] = {}
        for item in raw:
            key, _, value = str(item).partition("=")
            result[key] = value
        return result
    raise IsolationPolicyError("Service environment must be an object or list")


def _volume_source(mount: object) -> str:
    if isinstance(mount, str):
        return mount.split(":", 1)[0]
    if isinstance(mount, dict):
        return str(mount.get("source", ""))
    return ""


def _is_named_volume(source: str, declared: set[str]) -> bool:
    return (
        bool(source)
        and source in declared
        and not any(marker in source.lower() for marker in FORBIDDEN_TEXT)
    )


def validate_isolation_model(model: Mapping[str, Any]) -> None:
    services = model.get("services")
    networks = model.get("networks")
    if not isinstance(services, dict) or not isinstance(networks, dict):
        raise IsolationPolicyError("Compose model requires explicit services and networks")

    missing = set(UNTRUSTED_WORKERS) - set(services)
    if missing:
        raise IsolationPolicyError(f"Missing untrusted worker services: {sorted(missing)}")

    declared_volumes = set(model.get("volumes", {}))
    privileged_networks: set[str] = set()
    for name in ("publisher-sentinel", "control-sentinel"):
        privileged_networks.update(services.get(name, {}).get("networks", []))

    for name in UNTRUSTED_WORKERS:
        service = services[name]
        if not isinstance(service, dict):
            raise IsolationPolicyError(f"{name} must be a service object")
        user = str(service.get("user", "")).split(":", 1)[0]
        if not user or user == "0" or user.lower() == "root":
            raise IsolationPolicyError(f"{name} must run as a non-root user")
        if service.get("read_only") is not True:
            raise IsolationPolicyError(f"{name} root filesystem must be read-only")
        if "ALL" not in service.get("cap_drop", []):
            raise IsolationPolicyError(f"{name} must drop all Linux capabilities")
        security_options = [str(value).lower() for value in service.get("security_opt", [])]
        if not any(value.startswith("no-new-privileges") for value in security_options):
            raise IsolationPolicyError(f"{name} must deny new privileges")
        if service.get("privileged") is not False:
            raise IsolationPolicyError(f"{name} must explicitly disable privileged mode")
        if any(key in service for key in ("ports", "devices", "pid", "ipc", "network_mode")):
            raise IsolationPolicyError(f"{name} exposes a forbidden host or namespace surface")
        if service.get("use_api_socket"):
            raise IsolationPolicyError(f"{name} must not receive a container engine socket")
        if service.get("secrets"):
            raise IsolationPolicyError(f"{name} must not receive runtime secrets")

        environment = _environment(service)
        sensitive = [
            key for key in environment if any(marker in key.lower() for marker in SENSITIVE_MARKERS)
        ]
        if sensitive:
            raise IsolationPolicyError(f"{name} contains sensitive environment keys: {sensitive}")

        worker_networks = set(service.get("networks", []))
        if not worker_networks:
            raise IsolationPolicyError(f"{name} requires an explicit isolated network")
        if worker_networks & privileged_networks:
            raise IsolationPolicyError(f"{name} shares a privileged network")
        for network_name in worker_networks:
            if network_name not in networks or networks[network_name].get("internal") is not True:
                raise IsolationPolicyError(f"{name} network {network_name} must be internal")

        for mount in service.get("volumes", []):
            source = _volume_source(mount)
            if not _is_named_volume(source, declared_volumes):
                raise IsolationPolicyError(f"{name} mount {source!r} is not a dedicated volume")

        serialized = json.dumps(service, sort_keys=True).lower()
        if any(marker in serialized for marker in FORBIDDEN_TEXT):
            raise IsolationPolicyError(f"{name} references a host/container-engine path")

    crawler_proxy = _environment(services["crawler"]).get("HTTPS_PROXY", "")
    browser_proxy = _environment(services["browser-worker"]).get("HTTPS_PROXY", "")
    if "egress-gateway:8080" not in crawler_proxy or "egress-gateway:8080" not in browser_proxy:
        raise IsolationPolicyError("Networked workers must use the policy egress gateway")
    if any(
        key.endswith("PROXY") and value
        for key, value in _environment(services["ai-worker"]).items()
        if key != "NO_PROXY"
    ):
        raise IsolationPolicyError("AI worker must not have arbitrary network egress")

    gateway_networks = set(services.get("egress-gateway", {}).get("networks", []))
    if "public-egress" not in gateway_networks:
        raise IsolationPolicyError("Only the egress gateway may bridge workers to public egress")
    for name in UNTRUSTED_WORKERS:
        if "public-egress" in services[name].get("networks", []):
            raise IsolationPolicyError(f"{name} must not join public egress directly")


def validated_copy(model: Mapping[str, Any]) -> dict[str, Any]:
    """Return a validated detached model for launchers and tests."""

    copied = deepcopy(model)
    validate_isolation_model(copied)
    return copied
