"""Allowlisted HTTP proxy for untrusted crawler and browser networks."""

from __future__ import annotations

import os
import select
import socket
import socketserver
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit, urlunsplit

from .source_policy import CrawlPolicyError, SourcePolicy, SourcePolicyGuard

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}
MAX_TUNNEL_SECONDS = 60.0
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class GatewaySettings:
    allow_domains: frozenset[str]
    allowed_ports: frozenset[int]
    listen_host: str = "127.0.0.1"
    listen_port: int = 8080

    @classmethod
    def from_environment(cls) -> GatewaySettings:
        domains = frozenset(
            value.strip().lower()
            for value in os.environ.get("WI_EGRESS_ALLOW_DOMAINS", "").split(",")
            if value.strip()
        )
        if not domains or "*" in domains:
            raise ValueError("WI_EGRESS_ALLOW_DOMAINS requires an explicit domain allowlist")
        ports = frozenset(
            int(value.strip())
            for value in os.environ.get("WI_EGRESS_ALLOWED_PORTS", "80,443").split(",")
            if value.strip()
        )
        return cls(
            allow_domains=domains,
            allowed_ports=ports,
            listen_host=os.environ.get("WI_EGRESS_LISTEN_HOST", "127.0.0.1"),
            listen_port=int(os.environ.get("WI_EGRESS_LISTEN_PORT", "8080")),
        )


class EgressPolicy:
    def __init__(
        self, settings: GatewaySettings, *, guard: SourcePolicyGuard | None = None
    ) -> None:
        self.settings = settings
        self.guard = guard or SourcePolicyGuard(
            SourcePolicy(
                policy_id="container-egress",
                allow_domains=settings.allow_domains,
                allowed_ports=settings.allowed_ports,
            )
        )

    def authorize(self, url: str) -> tuple[str, int, str]:
        target = self.guard.authorize(url)
        target = self.guard.revalidate_for_connection(target)
        return target.addresses[0], target.port, target.hostname


class ThreadingProxyServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, address: tuple[str, int], policy: EgressPolicy) -> None:
        self.policy = policy
        super().__init__(address, ProxyRequestHandler)


class ProxyRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "WebIntelligenceEgress/1"
    timeout = 15

    @property
    def policy(self) -> EgressPolicy:
        return self.server.policy  # type: ignore[attr-defined,no-any-return]

    def do_CONNECT(self) -> None:  # noqa: N802
        try:
            authority = urlsplit(f"//{self.path}")
            if not authority.hostname or authority.username or authority.password:
                raise ValueError("invalid CONNECT authority")
            port = authority.port or 443
            host = authority.hostname
            display_host = f"[{host}]" if ":" in host else host
            address, port, _hostname = self.policy.authorize(f"https://{display_host}:{port}/")
            upstream = socket.create_connection((address, port), timeout=self.timeout)
        except (CrawlPolicyError, OSError, ValueError):
            self.send_error(HTTPStatus.FORBIDDEN, "destination denied by egress policy")
            return

        self.send_response(HTTPStatus.OK, "Connection Established")
        self.end_headers()
        try:
            self._relay(self.connection, upstream)
        finally:
            upstream.close()

    def do_GET(self) -> None:  # noqa: N802
        self._forward_http()

    def do_HEAD(self) -> None:  # noqa: N802
        self._forward_http()

    def do_POST(self) -> None:  # noqa: N802
        self._forward_http()

    def do_PUT(self) -> None:  # noqa: N802
        self._forward_http()

    def do_DELETE(self) -> None:  # noqa: N802
        self._forward_http()

    def _forward_http(self) -> None:
        try:
            parts = urlsplit(self.path)
            if parts.scheme.lower() != "http" or not parts.hostname:
                raise ValueError("proxy requires an absolute HTTP URL")
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length < 0 or content_length > MAX_REQUEST_BODY_BYTES:
                raise ValueError("request body exceeds proxy limit")
            address, port, hostname = self.policy.authorize(self.path)
            upstream = socket.create_connection((address, port), timeout=self.timeout)
            path = urlunsplit(("", "", parts.path or "/", parts.query, ""))
            request_line = f"{self.command} {path} HTTP/1.1\r\n".encode("ascii")
            headers = bytearray(request_line)
            default_port = parts.port in (None, 80)
            host_header = hostname if default_port else f"{hostname}:{port}"
            headers.extend(f"Host: {host_header}\r\n".encode("ascii"))
            for key, value in self.headers.items():
                if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "host":
                    if "\r" in key or "\n" in key or "\r" in value or "\n" in value:
                        raise ValueError("invalid proxy header")
                    headers.extend(f"{key}: {value}\r\n".encode("latin-1"))
            headers.extend(b"Connection: close\r\n\r\n")
            upstream.sendall(headers)
            if content_length:
                upstream.sendall(self.rfile.read(content_length))
            while chunk := upstream.recv(64 * 1024):
                self.connection.sendall(chunk)
        except (CrawlPolicyError, OSError, ValueError):
            self.send_error(HTTPStatus.FORBIDDEN, "destination denied by egress policy")
        finally:
            if "upstream" in locals():
                upstream.close()

    @staticmethod
    def _relay(client: socket.socket, upstream: socket.socket) -> None:
        sockets = (client, upstream)
        while True:
            readable, _, _ = select.select(sockets, (), (), MAX_TUNNEL_SECONDS)
            if not readable:
                return
            for source in readable:
                data = source.recv(64 * 1024)
                if not data:
                    return
                destination = upstream if source is client else client
                destination.sendall(data)

    def log_message(self, format: str, *args: object) -> None:
        del format, args


def main() -> int:
    settings = GatewaySettings.from_environment()
    with ThreadingProxyServer(
        (settings.listen_host, settings.listen_port), EgressPolicy(settings)
    ) as server:
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
