"""Only admitted targets may reach HTTP or browser crawler transports."""

from __future__ import annotations

from dataclasses import dataclass

from .source_policy import (
    AuthorizedTarget,
    CrawlBudgetLease,
    CrawlBudgetTracker,
    SourcePolicyGuard,
)


@dataclass(frozen=True, slots=True)
class AdmittedCrawl:
    channel: str
    target: AuthorizedTarget
    lease: CrawlBudgetLease


class SharedCrawlAdmission:
    """Single mandatory gate shared by every crawler channel."""

    def __init__(self, guard: SourcePolicyGuard, budgets: CrawlBudgetTracker) -> None:
        self.guard = guard
        self.budgets = budgets

    def admit(self, raw_url: str, *, channel: str, depth: int = 0) -> AdmittedCrawl:
        target = self.guard.authorize(raw_url)
        target = self.guard.revalidate_for_connection(target)
        lease = self.budgets.acquire(target, depth=depth)
        return AdmittedCrawl(channel=channel, target=target, lease=lease)

    def admit_redirect(
        self,
        previous: AdmittedCrawl,
        redirect_url: str,
        *,
        redirect_count: int,
    ) -> AuthorizedTarget:
        target = self.guard.authorize_redirect(
            previous.target,
            redirect_url,
            redirect_count=redirect_count,
        )
        return self.guard.revalidate_for_connection(target)


class HttpCrawlAdmission:
    def __init__(self, shared: SharedCrawlAdmission) -> None:
        self._shared = shared

    def admit(self, raw_url: str, *, depth: int = 0) -> AdmittedCrawl:
        return self._shared.admit(raw_url, channel="http", depth=depth)


class BrowserCrawlAdmission:
    def __init__(self, shared: SharedCrawlAdmission) -> None:
        self._shared = shared

    def admit(self, raw_url: str, *, depth: int = 0) -> AdmittedCrawl:
        return self._shared.admit(raw_url, channel="browser", depth=depth)

    def admit_subresource(self, raw_url: str, *, depth: int = 0) -> AdmittedCrawl:
        """Browser route interception must call this for every subresource request."""

        return self._shared.admit(raw_url, channel="browser-subresource", depth=depth)
