"""SSRF-safe source policy, DNS validation and crawl budgets.

The module deliberately does not perform HTTP requests. Network clients receive an
``AuthorizedTarget`` only after this guard has validated the URL and resolved addresses.
They must revalidate immediately before connecting and on every redirect.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from enum import StrEnum
from typing import Protocol, Self
from urllib.parse import SplitResult, urlsplit, urlunsplit


class DecisionReason(StrEnum):
    ALLOWED = "allowed"
    CONNECTION_REVALIDATED = "connection_revalidated"
    INVALID_URL = "invalid_url"
    UNSUPPORTED_SCHEME = "unsupported_scheme"
    MISSING_HOST = "missing_host"
    EMBEDDED_CREDENTIALS = "embedded_credentials"
    NON_CANONICAL_IP = "non_canonical_ip"
    PORT_NOT_ALLOWED = "port_not_allowed"
    DOMAIN_DENIED = "domain_denied"
    DOMAIN_NOT_ALLOWED = "domain_not_allowed"
    RESOLUTION_FAILED = "resolution_failed"
    UNSAFE_ADDRESS = "unsafe_address"
    REDIRECT_LIMIT = "redirect_limit"


class RobotsBehavior(StrEnum):
    RESPECT = "respect"
    DENY = "deny"
    IGNORE_EXPLICIT = "ignore_explicit"


class CrawlPolicyError(ValueError):
    """A fail-closed policy decision safe to expose in an audit log."""

    def __init__(self, reason: DecisionReason, detail: str) -> None:
        super().__init__(detail)
        self.reason = reason
        self.detail = detail


class CrawlBudgetExceeded(RuntimeError):
    """A source exceeded a configured resource boundary."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class CrawlLimits:
    max_concurrency: int = 2
    min_delay_seconds: float = 1.0
    max_pages: int = 100
    max_total_bytes: int = 100 * 1024 * 1024
    max_response_bytes: int = 10 * 1024 * 1024
    max_depth: int = 3
    max_redirects: int = 5

    def __post_init__(self) -> None:
        positive = {
            "max_concurrency": self.max_concurrency,
            "max_pages": self.max_pages,
            "max_total_bytes": self.max_total_bytes,
            "max_response_bytes": self.max_response_bytes,
        }
        if any(value <= 0 for value in positive.values()):
            raise ValueError("Crawl count and byte limits must be positive")
        if self.min_delay_seconds < 0 or self.max_depth < 0 or self.max_redirects < 0:
            raise ValueError("Delay, depth and redirect limits cannot be negative")
        if self.max_response_bytes > self.max_total_bytes:
            raise ValueError("Response byte limit cannot exceed the total byte budget")


def _normalize_domain_pattern(value: str) -> str:
    value = value.strip().lower().rstrip(".")
    if value.startswith("*."):
        value = value[2:]
    if value.startswith("."):
        value = value[1:]
    if not value or "/" in value or "@" in value:
        raise ValueError("Domain policies must contain hostnames only")
    try:
        return value.encode("idna").decode("ascii")
    except UnicodeError as error:
        raise ValueError("Domain policy contains an invalid hostname") from error


@dataclass(frozen=True, slots=True)
class SourcePolicy:
    policy_id: str = "default"
    allow_domains: frozenset[str] = field(default_factory=frozenset)
    deny_domains: frozenset[str] = field(default_factory=frozenset)
    allowed_ports: frozenset[int] = field(default_factory=lambda: frozenset({80, 443}))
    robots_behavior: RobotsBehavior = RobotsBehavior.RESPECT
    limits: CrawlLimits = field(default_factory=CrawlLimits)

    def __post_init__(self) -> None:
        if not self.policy_id.strip():
            raise ValueError("Source policy requires an identifier")
        object.__setattr__(
            self,
            "allow_domains",
            frozenset(_normalize_domain_pattern(item) for item in self.allow_domains),
        )
        object.__setattr__(
            self,
            "deny_domains",
            frozenset(_normalize_domain_pattern(item) for item in self.deny_domains),
        )
        if not self.allowed_ports or any(port < 1 or port > 65535 for port in self.allowed_ports):
            raise ValueError("Allowed ports must be between 1 and 65535")


@dataclass(frozen=True, slots=True)
class AuthorizedTarget:
    requested_url: str
    normalized_url: str
    scheme: str
    hostname: str
    port: int
    addresses: tuple[str, ...]
    policy_id: str
    robots_behavior: RobotsBehavior
    limits: CrawlLimits


@dataclass(frozen=True, slots=True)
class AuditDecision:
    allowed: bool
    reason: DecisionReason
    requested_url: str
    normalized_url: str | None
    hostname: str | None
    addresses: tuple[str, ...]
    policy_id: str
    decided_at: datetime
    detail: str


class HostResolver(Protocol):
    def resolve(self, hostname: str, port: int) -> Sequence[str]: ...


class SocketHostResolver:
    """Resolve stream addresses without making an application request."""

    def resolve(self, hostname: str, port: int) -> Sequence[str]:
        records = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        return tuple(dict.fromkeys(record[4][0] for record in records))


class MemoryAuditSink:
    """Thread-safe reference audit sink; production can replace it with durable storage."""

    def __init__(self) -> None:
        self._decisions: list[AuditDecision] = []
        self._lock = threading.Lock()

    def __call__(self, decision: AuditDecision) -> None:
        with self._lock:
            self._decisions.append(decision)

    @property
    def decisions(self) -> tuple[AuditDecision, ...]:
        with self._lock:
            return tuple(self._decisions)


_NUMERIC_HOST = re.compile(
    r"^(?:0[xX][0-9a-fA-F]+|[0-9]+)(?:\.(?:0[xX][0-9a-fA-F]+|[0-9]+)){0,3}$"
)


def _parse_ipv4_component(component: str) -> int:
    if component.lower().startswith("0x"):
        return int(component[2:], 16)
    if len(component) > 1 and component.startswith("0"):
        return int(component, 8)
    return int(component, 10)


def _parse_legacy_ipv4(hostname: str) -> ipaddress.IPv4Address | None:
    if not _NUMERIC_HOST.fullmatch(hostname):
        return None
    try:
        parts = [_parse_ipv4_component(part) for part in hostname.split(".")]
    except ValueError:
        return None
    if len(parts) == 1 and parts[0] <= 0xFFFFFFFF:
        value = parts[0]
    elif len(parts) == 2 and parts[0] <= 0xFF and parts[1] <= 0xFFFFFF:
        value = (parts[0] << 24) | parts[1]
    elif len(parts) == 3 and all(part <= 0xFF for part in parts[:2]) and parts[2] <= 0xFFFF:
        value = (parts[0] << 24) | (parts[1] << 16) | parts[2]
    elif len(parts) == 4 and all(part <= 0xFF for part in parts):
        value = sum(part << shift for part, shift in zip(parts, (24, 16, 8, 0), strict=True))
    else:
        return None
    return ipaddress.IPv4Address(value)


def _safe_url_for_audit(raw_url: str) -> str:
    """Remove userinfo, query and fragment so audit logs cannot collect URL secrets."""

    try:
        parts = urlsplit(raw_url)
        host = parts.hostname or ""
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        port = f":{parts.port}" if parts.port else ""
        return urlunsplit((parts.scheme, f"{host}{port}", parts.path, "", ""))
    except (ValueError, UnicodeError):
        return "<invalid-url>"


def _domain_matches(hostname: str, pattern: str) -> bool:
    return hostname == pattern or hostname.endswith(f".{pattern}")


def _unsafe_address_reason(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return _unsafe_address_reason(address.ipv4_mapped)
    if address.is_loopback:
        return "loopback"
    if address.is_link_local:
        return "link_local_or_metadata"
    if address.is_private:
        return "private"
    if address.is_multicast:
        return "multicast"
    if address.is_reserved:
        return "reserved"
    if address.is_unspecified:
        return "unspecified"
    if not address.is_global:
        return "non_global"
    return None


class SourcePolicyGuard:
    def __init__(
        self,
        policy: SourcePolicy,
        *,
        resolver: HostResolver | None = None,
        audit_sink: Callable[[AuditDecision], None] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.policy = policy
        self.resolver = resolver or SocketHostResolver()
        self.audit_sink = audit_sink or (lambda _decision: None)
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def authorize(self, raw_url: str) -> AuthorizedTarget:
        normalized_url: str | None = None
        hostname: str | None = None
        addresses: tuple[str, ...] = ()
        try:
            normalized_url, scheme, hostname, port, direct_address = self._normalize(raw_url)
            self._enforce_domain_policy(hostname)
            addresses = self._resolve_and_validate(hostname, port, direct_address)
            target = AuthorizedTarget(
                requested_url=raw_url,
                normalized_url=normalized_url,
                scheme=scheme,
                hostname=hostname,
                port=port,
                addresses=addresses,
                policy_id=self.policy.policy_id,
                robots_behavior=self.policy.robots_behavior,
                limits=self.policy.limits,
            )
        except CrawlPolicyError as error:
            self._audit(
                allowed=False,
                reason=error.reason,
                requested_url=raw_url,
                normalized_url=normalized_url,
                hostname=hostname,
                addresses=addresses,
                detail=error.detail,
            )
            raise
        self._audit(
            allowed=True,
            reason=DecisionReason.ALLOWED,
            requested_url=raw_url,
            normalized_url=normalized_url,
            hostname=hostname,
            addresses=addresses,
            detail="Source target passed URL, domain and address policy",
        )
        return target

    def revalidate_for_connection(self, target: AuthorizedTarget) -> AuthorizedTarget:
        """Re-resolve immediately before connect to catch DNS rebinding."""

        direct_address = self._direct_address(target.hostname)
        try:
            addresses = self._resolve_and_validate(target.hostname, target.port, direct_address)
        except CrawlPolicyError as error:
            self._audit(
                allowed=False,
                reason=error.reason,
                requested_url=target.requested_url,
                normalized_url=target.normalized_url,
                hostname=target.hostname,
                addresses=(),
                detail=f"Connection revalidation failed: {error.detail}",
            )
            raise
        self._audit(
            allowed=True,
            reason=DecisionReason.CONNECTION_REVALIDATED,
            requested_url=target.requested_url,
            normalized_url=target.normalized_url,
            hostname=target.hostname,
            addresses=addresses,
            detail="Target addresses were revalidated before connection",
        )
        return replace(target, addresses=addresses)

    def authorize_redirect(
        self, previous: AuthorizedTarget, redirect_url: str, *, redirect_count: int
    ) -> AuthorizedTarget:
        if redirect_count < 1 or redirect_count > previous.limits.max_redirects:
            error = CrawlPolicyError(
                DecisionReason.REDIRECT_LIMIT,
                f"Redirect count exceeds limit {previous.limits.max_redirects}",
            )
            self._audit(
                allowed=False,
                reason=error.reason,
                requested_url=redirect_url,
                normalized_url=None,
                hostname=None,
                addresses=(),
                detail=error.detail,
            )
            raise error
        return self.authorize(redirect_url)

    def _normalize(
        self, raw_url: str
    ) -> tuple[str, str, str, int, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
        if not isinstance(raw_url, str) or not raw_url.strip():
            raise CrawlPolicyError(DecisionReason.INVALID_URL, "URL must be a non-empty string")
        if any(ord(character) < 0x20 for character in raw_url) or "\\" in raw_url:
            raise CrawlPolicyError(DecisionReason.INVALID_URL, "URL contains unsafe characters")
        try:
            parts = urlsplit(raw_url.strip())
        except ValueError as error:
            raise CrawlPolicyError(DecisionReason.INVALID_URL, "URL could not be parsed") from error
        scheme = parts.scheme.lower()
        if scheme not in {"http", "https"}:
            raise CrawlPolicyError(
                DecisionReason.UNSUPPORTED_SCHEME, "Only HTTP and HTTPS URLs are allowed"
            )
        if parts.username is not None or parts.password is not None:
            raise CrawlPolicyError(
                DecisionReason.EMBEDDED_CREDENTIALS, "Credentials embedded in URLs are forbidden"
            )
        if not parts.hostname:
            raise CrawlPolicyError(DecisionReason.MISSING_HOST, "URL requires a hostname")
        if "%" in parts.hostname:
            raise CrawlPolicyError(
                DecisionReason.INVALID_URL,
                "Encoded or scoped hosts are forbidden",
            )
        try:
            hostname = parts.hostname.rstrip(".").encode("idna").decode("ascii").lower()
            port = parts.port or (443 if scheme == "https" else 80)
        except (UnicodeError, ValueError) as error:
            raise CrawlPolicyError(
                DecisionReason.INVALID_URL,
                "URL host or port is invalid",
            ) from error
        if port not in self.policy.allowed_ports:
            raise CrawlPolicyError(
                DecisionReason.PORT_NOT_ALLOWED, "Destination port is not allowed by source policy"
            )
        direct_address = self._direct_address(hostname)
        legacy_address = _parse_legacy_ipv4(hostname)
        if _NUMERIC_HOST.fullmatch(hostname) and (
            legacy_address is None or str(legacy_address) != hostname
        ):
            raise CrawlPolicyError(
                DecisionReason.NON_CANONICAL_IP,
                "Non-canonical numeric IP forms are forbidden",
            )
        if ":" in hostname:
            display_host = f"[{hostname}]"
        else:
            display_host = hostname
        default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
        netloc = display_host if default_port else f"{display_host}:{port}"
        normalized = urlunsplit(
            SplitResult(scheme, netloc, parts.path or "/", parts.query, "")
        )
        return normalized, scheme, hostname, port, direct_address

    @staticmethod
    def _direct_address(
        hostname: str,
    ) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
        try:
            return ipaddress.ip_address(hostname)
        except ValueError:
            return _parse_legacy_ipv4(hostname)

    def _enforce_domain_policy(self, hostname: str) -> None:
        if any(_domain_matches(hostname, pattern) for pattern in self.policy.deny_domains):
            raise CrawlPolicyError(
                DecisionReason.DOMAIN_DENIED, "Hostname is denied by source policy"
            )
        if self.policy.allow_domains and not any(
            _domain_matches(hostname, pattern) for pattern in self.policy.allow_domains
        ):
            raise CrawlPolicyError(
                DecisionReason.DOMAIN_NOT_ALLOWED, "Hostname is not in the source allowlist"
            )

    def _resolve_and_validate(
        self,
        hostname: str,
        port: int,
        direct_address: ipaddress.IPv4Address | ipaddress.IPv6Address | None,
    ) -> tuple[str, ...]:
        try:
            raw_addresses: Sequence[str] = (
                (str(direct_address),)
                if direct_address is not None
                else self.resolver.resolve(hostname, port)
            )
            addresses = tuple(
                dict.fromkeys(str(ipaddress.ip_address(address)) for address in raw_addresses)
            )
        except (OSError, ValueError) as error:
            raise CrawlPolicyError(
                DecisionReason.RESOLUTION_FAILED, "Hostname resolution failed closed"
            ) from error
        if not addresses:
            raise CrawlPolicyError(
                DecisionReason.RESOLUTION_FAILED, "Hostname resolution returned no addresses"
            )
        for raw_address in addresses:
            address = ipaddress.ip_address(raw_address)
            unsafe_reason = _unsafe_address_reason(address)
            if unsafe_reason:
                raise CrawlPolicyError(
                    DecisionReason.UNSAFE_ADDRESS,
                    f"Resolved address is forbidden by policy ({unsafe_reason})",
                )
        return addresses

    def _audit(
        self,
        *,
        allowed: bool,
        reason: DecisionReason,
        requested_url: str,
        normalized_url: str | None,
        hostname: str | None,
        addresses: tuple[str, ...],
        detail: str,
    ) -> None:
        self.audit_sink(
            AuditDecision(
                allowed=allowed,
                reason=reason,
                requested_url=_safe_url_for_audit(requested_url),
                normalized_url=(
                    _safe_url_for_audit(normalized_url) if normalized_url is not None else None
                ),
                hostname=hostname,
                addresses=addresses,
                policy_id=self.policy.policy_id,
                decided_at=self.clock(),
                detail=detail,
            )
        )


@dataclass(slots=True)
class _DomainBudgetState:
    active: int = 0
    pages_started: int = 0
    bytes_received: int = 0
    last_started_at: float | None = None


class CrawlBudgetLease:
    def __init__(
        self,
        tracker: CrawlBudgetTracker,
        hostname: str,
        limits: CrawlLimits,
    ) -> None:
        self._tracker = tracker
        self.hostname = hostname
        self.limits = limits
        self.response_bytes = 0
        self.closed = False

    def record_chunk(self, size: int) -> None:
        if self.closed:
            raise RuntimeError("Cannot record bytes on a closed crawl lease")
        if size < 0:
            raise ValueError("Chunk size cannot be negative")
        self._tracker._record_bytes(self, size)

    def close(self) -> None:
        if not self.closed:
            self._tracker._release(self.hostname)
            self.closed = True

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


class CrawlBudgetTracker:
    """Process-local reference limiter; shared stores can replace it at scale."""

    def __init__(self, *, monotonic: Callable[[], float] | None = None) -> None:
        self._monotonic = monotonic or time.monotonic
        self._states: dict[str, _DomainBudgetState] = {}
        self._lock = threading.RLock()

    def acquire(self, target: AuthorizedTarget, *, depth: int = 0) -> CrawlBudgetLease:
        if depth < 0 or depth > target.limits.max_depth:
            raise CrawlBudgetExceeded("crawl_depth_exceeded")
        now = self._monotonic()
        with self._lock:
            state = self._states.setdefault(target.hostname, _DomainBudgetState())
            if state.active >= target.limits.max_concurrency:
                raise CrawlBudgetExceeded("domain_concurrency_exceeded")
            if state.pages_started >= target.limits.max_pages:
                raise CrawlBudgetExceeded("domain_page_budget_exceeded")
            if (
                state.last_started_at is not None
                and now - state.last_started_at < target.limits.min_delay_seconds
            ):
                raise CrawlBudgetExceeded("domain_delay_not_elapsed")
            state.active += 1
            state.pages_started += 1
            state.last_started_at = now
        return CrawlBudgetLease(self, target.hostname, target.limits)

    def _record_bytes(self, lease: CrawlBudgetLease, size: int) -> None:
        with self._lock:
            state = self._states[lease.hostname]
            next_response = lease.response_bytes + size
            next_total = state.bytes_received + size
            if next_response > lease.limits.max_response_bytes:
                raise CrawlBudgetExceeded("response_byte_limit_exceeded")
            if next_total > lease.limits.max_total_bytes:
                raise CrawlBudgetExceeded("domain_byte_budget_exceeded")
            lease.response_bytes = next_response
            state.bytes_received = next_total

    def _release(self, hostname: str) -> None:
        with self._lock:
            state = self._states[hostname]
            state.active = max(0, state.active - 1)
