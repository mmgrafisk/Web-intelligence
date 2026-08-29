"""Minimal lifecycle boundary used until role-specific queues are introduced."""

from __future__ import annotations

import signal
import sys
import threading

ALLOWED_ROLES = {"crawler", "browser", "ai"}


def main() -> int:
    role = sys.argv[1] if len(sys.argv) > 1 else ""
    if role not in ALLOWED_ROLES:
        print("worker role must be crawler, browser or ai", file=sys.stderr)
        return 2
    stopped = threading.Event()

    def stop(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"{role} isolation boundary ready", flush=True)
    stopped.wait()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
