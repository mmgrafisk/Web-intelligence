from __future__ import annotations

import unittest
from collections.abc import Sequence

from web_intelligence import (
    BrowserCrawlAdmission,
    CrawlBudgetExceeded,
    CrawlBudgetTracker,
    CrawlLimits,
    CrawlPolicyError,
    DecisionReason,
    HttpCrawlAdmission,
    MemoryAuditSink,
    SharedCrawlAdmission,
    SourcePolicy,
    SourcePolicyGuard,
)


class FakeResolver:
    def __init__(self, answers: dict[str, Sequence[Sequence[str]] | Sequence[str]]) -> None:
        self.answers = answers
        self.calls: dict[str, int] = {}

    def resolve(self, hostname: str, port: int) -> Sequence[str]:
        del port
        answer = self.answers[hostname]
        if answer and isinstance(answer[0], (list, tuple)):
            sequences = answer
            index = min(self.calls.get(hostname, 0), len(sequences) - 1)
            self.calls[hostname] = index + 1
            return sequences[index]
        return answer


def guard_for(
    answers: dict[str, Sequence[Sequence[str]] | Sequence[str]],
    **policy_overrides: object,
) -> tuple[SourcePolicyGuard, MemoryAuditSink]:
    audit = MemoryAuditSink()
    policy = SourcePolicy(**policy_overrides)
    return SourcePolicyGuard(policy, resolver=FakeResolver(answers), audit_sink=audit), audit


class SourcePolicyGuardTests(unittest.TestCase):
    def assert_blocked(
        self,
        guard: SourcePolicyGuard,
        url: str,
        reason: DecisionReason,
    ) -> None:
        with self.assertRaises(CrawlPolicyError) as raised:
            guard.authorize(url)
        self.assertEqual(raised.exception.reason, reason)

    def test_normalizes_public_http_url_and_records_policy(self) -> None:
        guard, audit = guard_for({"example.com": ["93.184.216.34"]}, policy_id="trade-sources")

        target = guard.authorize("HTTPS://Example.COM./pricing?q=1#fragment")

        self.assertEqual(target.normalized_url, "https://example.com/pricing?q=1")
        self.assertEqual(target.addresses, ("93.184.216.34",))
        self.assertEqual(target.policy_id, "trade-sources")
        self.assertTrue(audit.decisions[-1].allowed)
        self.assertNotIn("q=1", audit.decisions[-1].normalized_url or "")

    def test_rejects_scheme_credentials_missing_host_and_nonstandard_port(self) -> None:
        guard, audit = guard_for({})

        self.assert_blocked(guard, "file:///etc/passwd", DecisionReason.UNSUPPORTED_SCHEME)
        self.assert_blocked(
            guard,
            "https://user:secret@example.com/private?token=secret",
            DecisionReason.EMBEDDED_CREDENTIALS,
        )
        self.assert_blocked(guard, "https:///missing", DecisionReason.MISSING_HOST)
        self.assert_blocked(guard, "https://example.com:8443/", DecisionReason.PORT_NOT_ALLOWED)
        self.assertNotIn("secret", audit.decisions[-3].requested_url)

    def test_rejects_local_private_link_local_multicast_and_reserved_addresses(self) -> None:
        answers = {
            "localhost": ["127.0.0.1"],
            "private.test": ["10.0.0.4"],
            "metadata.test": ["169.254.169.254"],
            "multicast.test": ["224.0.0.1"],
            "reserved.test": ["240.0.0.1"],
        }
        guard, _audit = guard_for(answers)
        for url in (
            "http://localhost/",
            "http://127.0.0.1/",
            "http://[::1]/",
            "http://private.test/",
            "http://metadata.test/latest/meta-data/",
            "http://multicast.test/",
            "http://reserved.test/",
        ):
            with self.subTest(url=url):
                self.assert_blocked(guard, url, DecisionReason.UNSAFE_ADDRESS)

    def test_rejects_encoded_and_legacy_ip_forms(self) -> None:
        guard, _audit = guard_for({})
        for hostname in (
            "127.1",
            "2130706433",
            "0x7f000001",
            "0177.0.0.1",
            "09",
            "999.999.999.999",
        ):
            with self.subTest(hostname=hostname):
                self.assert_blocked(
                    guard,
                    f"http://{hostname}/",
                    DecisionReason.NON_CANONICAL_IP,
                )

    def test_denylist_overrides_allowlist_and_subdomains_match(self) -> None:
        guard, _audit = guard_for(
            {"safe.example.com": ["93.184.216.34"]},
            allow_domains=frozenset({"example.com"}),
            deny_domains=frozenset({"blocked.example.com"}),
        )

        self.assertEqual(guard.authorize("https://safe.example.com/").hostname, "safe.example.com")
        self.assert_blocked(
            guard,
            "https://deep.blocked.example.com/",
            DecisionReason.DOMAIN_DENIED,
        )
        self.assert_blocked(
            guard,
            "https://outside.test/",
            DecisionReason.DOMAIN_NOT_ALLOWED,
        )

    def test_redirects_are_revalidated_and_limited(self) -> None:
        guard, _audit = guard_for(
            {
                "first.test": ["93.184.216.34"],
                "second.test": ["169.254.169.254"],
            },
            limits=CrawlLimits(max_redirects=1),
        )
        first = guard.authorize("https://first.test/")

        with self.assertRaises(CrawlPolicyError) as private_redirect:
            guard.authorize_redirect(first, "https://second.test/", redirect_count=1)
        self.assertEqual(private_redirect.exception.reason, DecisionReason.UNSAFE_ADDRESS)
        with self.assertRaises(CrawlPolicyError) as too_many:
            guard.authorize_redirect(first, "https://first.test/next", redirect_count=2)
        self.assertEqual(too_many.exception.reason, DecisionReason.REDIRECT_LIMIT)

    def test_dns_change_to_private_address_fails_connection_revalidation(self) -> None:
        guard, audit = guard_for(
            {"rebind.test": [("93.184.216.34",), ("127.0.0.1",)]}
        )
        target = guard.authorize("https://rebind.test/")

        with self.assertRaises(CrawlPolicyError) as raised:
            guard.revalidate_for_connection(target)

        self.assertEqual(raised.exception.reason, DecisionReason.UNSAFE_ADDRESS)
        self.assertFalse(audit.decisions[-1].allowed)

    def test_http_browser_and_subresources_share_the_same_guard(self) -> None:
        guard, audit = guard_for(
            {
                "public.test": ["93.184.216.34"],
                "internal.test": ["10.0.0.8"],
            }
        )
        shared = SharedCrawlAdmission(
            guard,
            CrawlBudgetTracker(monotonic=lambda: 10.0),
        )
        http = HttpCrawlAdmission(shared)
        browser = BrowserCrawlAdmission(shared)

        http_admission = http.admit("https://public.test/")
        http_admission.lease.close()
        with self.assertRaises(CrawlPolicyError):
            browser.admit("https://internal.test/")
        with self.assertRaises(CrawlPolicyError):
            browser.admit_subresource("https://internal.test/script.js")

        self.assertEqual(http_admission.channel, "http")
        self.assertEqual([decision.allowed for decision in audit.decisions[-2:]], [False, False])


class CrawlBudgetTests(unittest.TestCase):
    def target_and_tracker(
        self,
        limits: CrawlLimits,
        times: list[float],
    ) -> tuple[SourcePolicyGuard, CrawlBudgetTracker]:
        guard, _audit = guard_for(
            {"budget.test": ["93.184.216.34"]},
            limits=limits,
        )
        iterator = iter(times)
        return guard, CrawlBudgetTracker(monotonic=lambda: next(iterator))

    def test_enforces_concurrency_delay_page_and_depth_limits(self) -> None:
        limits = CrawlLimits(
            max_concurrency=1,
            min_delay_seconds=2,
            max_pages=2,
            max_depth=1,
        )
        guard, tracker = self.target_and_tracker(limits, [0.0, 0.5, 2.0, 4.0])
        target = guard.authorize("https://budget.test/")
        first = tracker.acquire(target)
        with self.assertRaisesRegex(CrawlBudgetExceeded, "domain_concurrency_exceeded"):
            tracker.acquire(target)
        first.close()
        second = tracker.acquire(target, depth=1)
        second.close()
        with self.assertRaisesRegex(CrawlBudgetExceeded, "domain_page_budget_exceeded"):
            tracker.acquire(target)
        with self.assertRaisesRegex(CrawlBudgetExceeded, "crawl_depth_exceeded"):
            tracker.acquire(target, depth=2)

    def test_enforces_response_and_total_byte_budgets(self) -> None:
        limits = CrawlLimits(
            min_delay_seconds=0,
            max_pages=3,
            max_response_bytes=5,
            max_total_bytes=8,
        )
        guard, tracker = self.target_and_tracker(limits, [0.0, 1.0, 2.0])
        target = guard.authorize("https://budget.test/")

        with tracker.acquire(target) as first:
            first.record_chunk(5)
            with self.assertRaisesRegex(CrawlBudgetExceeded, "response_byte_limit_exceeded"):
                first.record_chunk(1)
        with tracker.acquire(target) as second:
            second.record_chunk(3)
        with tracker.acquire(target) as third:
            with self.assertRaisesRegex(CrawlBudgetExceeded, "domain_byte_budget_exceeded"):
                third.record_chunk(1)


if __name__ == "__main__":
    unittest.main()
