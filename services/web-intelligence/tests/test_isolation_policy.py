from __future__ import annotations

import unittest
from copy import deepcopy
from pathlib import Path

from web_intelligence.isolation_policy import (
    IsolationPolicyError,
    load_compose,
    validate_isolation_model,
)

COMPOSE_PATH = Path(__file__).parents[1] / "compose.isolation.json"


class IsolationPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.model = load_compose(COMPOSE_PATH)

    def assert_rejected(self, mutate) -> None:  # type: ignore[no-untyped-def]
        model = deepcopy(self.model)
        mutate(model)
        with self.assertRaises(IsolationPolicyError):
            validate_isolation_model(model)

    def test_checked_in_model_is_fail_closed(self) -> None:
        validate_isolation_model(self.model)

    def test_rejects_root_privileged_or_writable_worker(self) -> None:
        self.assert_rejected(lambda model: model["services"]["crawler"].update(user="0:0"))
        self.assert_rejected(lambda model: model["services"]["crawler"].update(privileged=True))
        self.assert_rejected(lambda model: model["services"]["crawler"].update(read_only=False))

    def test_rejects_secret_socket_and_host_mount_exposure(self) -> None:
        self.assert_rejected(
            lambda model: model["services"]["crawler"].update(secrets=["publisher-token"])
        )
        self.assert_rejected(
            lambda model: model["services"]["crawler"]["environment"].__setitem__(
                "PUBLISHER_TOKEN", str(1)
            )
        )
        self.assert_rejected(
            lambda model: model["services"]["crawler"]["volumes"].append(
                "/var/run/docker.sock:/var/run/docker.sock"
            )
        )

    def test_rejects_privileged_or_direct_egress_network(self) -> None:
        self.assert_rejected(
            lambda model: model["services"]["crawler"]["networks"].append("publisher-zone")
        )
        self.assert_rejected(
            lambda model: model["services"]["crawler"]["networks"].append("public-egress")
        )

    def test_rejects_missing_proxy_or_ai_egress(self) -> None:
        self.assert_rejected(
            lambda model: model["services"]["crawler"]["environment"].update(HTTPS_PROXY="")
        )
        self.assert_rejected(
            lambda model: model["services"]["ai-worker"]["environment"].update(
                HTTPS_PROXY="http://egress-gateway:8080"
            )
        )


if __name__ == "__main__":
    unittest.main()
