from __future__ import annotations

import os
import unittest
from collections.abc import Sequence
from unittest.mock import patch

from web_intelligence.egress_gateway import EgressPolicy, GatewaySettings
from web_intelligence.source_policy import CrawlPolicyError, SourcePolicy, SourcePolicyGuard


class Resolver:
    def __init__(self, addresses: dict[str, Sequence[str]]) -> None:
        self.addresses = addresses

    def resolve(self, hostname: str, port: int) -> Sequence[str]:
        del port
        return self.addresses[hostname]


class EgressPolicyTests(unittest.TestCase):
    def test_environment_requires_explicit_allowlist(self) -> None:
        with patch.dict(os.environ, {"WI_EGRESS_ALLOW_DOMAINS": ""}, clear=True):
            with self.assertRaises(ValueError):
                GatewaySettings.from_environment()
        with patch.dict(os.environ, {"WI_EGRESS_ALLOW_DOMAINS": "*"}, clear=True):
            with self.assertRaises(ValueError):
                GatewaySettings.from_environment()

    def test_allows_configured_public_target_and_pins_address(self) -> None:
        settings = GatewaySettings(frozenset({"example.com"}), frozenset({80, 443}))
        guard = SourcePolicyGuard(
            SourcePolicy(allow_domains=settings.allow_domains),
            resolver=Resolver({"example.com": ["93.184.216.34"]}),
        )
        address, port, hostname = EgressPolicy(settings, guard=guard).authorize(
            "https://example.com/"
        )
        self.assertEqual((address, port, hostname), ("93.184.216.34", 443, "example.com"))

    def test_rejects_unlisted_and_private_targets(self) -> None:
        settings = GatewaySettings(frozenset({"example.com"}), frozenset({80, 443}))
        guard = SourcePolicyGuard(
            SourcePolicy(allow_domains=settings.allow_domains),
            resolver=Resolver({"example.com": ["10.0.0.5"], "example.net": ["93.184.216.34"]}),
        )
        policy = EgressPolicy(settings, guard=guard)
        with self.assertRaises(CrawlPolicyError):
            policy.authorize("https://example.net/")
        with self.assertRaises(CrawlPolicyError):
            policy.authorize("https://example.com/")


if __name__ == "__main__":
    unittest.main()
