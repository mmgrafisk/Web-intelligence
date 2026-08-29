"""Adversarial runtime probe executed from an untrusted worker container."""

from __future__ import annotations

import argparse
import os
import socket
import sys
from pathlib import Path

SENSITIVE_MARKERS = ("publisher", "control_canary", "api_key", "secret", "password", "token")


def _assert_no_unrelated_secrets() -> None:
    leaked = [
        key for key in os.environ if any(marker in key.lower() for marker in SENSITIVE_MARKERS)
    ]
    if leaked:
        raise AssertionError(f"worker received sensitive environment keys: {leaked}")
    secret_dir = Path("/run/secrets")
    if secret_dir.exists() and any(secret_dir.iterdir()):
        raise AssertionError("worker received mounted runtime secrets")


def _assert_dns_isolated(hostname: str) -> None:
    try:
        socket.getaddrinfo(hostname, 8080, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return
    raise AssertionError(f"worker resolved privileged service {hostname}")


def _assert_gateway_denies(gateway: str, authority: str) -> None:
    with socket.create_connection((gateway, 8080), timeout=5) as connection:
        request = f"CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n\r\n".encode("ascii")
        connection.sendall(request)
        response = connection.recv(1024)
    if not response.startswith(b"HTTP/1.1 403"):
        raise AssertionError(f"egress gateway allowed {authority}: {response[:80]!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway", default="egress-gateway")
    parser.add_argument("--blocked-dns", action="append", default=[])
    args = parser.parse_args()
    _assert_no_unrelated_secrets()
    for hostname in args.blocked_dns:
        _assert_dns_isolated(hostname)
    for authority in ("127.0.0.1:80", "169.254.169.254:80", "example.net:443"):
        _assert_gateway_denies(args.gateway, authority)
    print("worker isolation probe passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"worker isolation probe failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
