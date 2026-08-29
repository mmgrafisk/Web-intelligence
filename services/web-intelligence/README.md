# Web Intelligence service

This directory is the Python runtime boundary for the reusable Web Intelligence
Platform. It is separate from the Bookmark web/extension clients.

## HEL-59 secure crawl admission

Every HTTP request, browser navigation, browser subresource and redirect must
pass through `SharedCrawlAdmission`. The guard:

- permits HTTP/HTTPS only and rejects URL credentials;
- normalizes hosts and rejects non-canonical numeric IP forms;
- applies source allowlists, denylists, ports, robots behavior and budgets;
- resolves and rejects non-global addresses before a request;
- re-resolves immediately before connection and validates every redirect;
- gives transports only an `AuthorizedTarget` with validated connect addresses;
- records allowed/blocked decisions without queries or URL credentials; and
- enforces concurrency, delay, page, depth, response and total byte limits.

The application guard is one layer. Rootless crawler/browser containers must
also deny loopback, private, link-local, metadata and control-plane egress at
the network layer. Browser route interception must call `admit_subresource` for
every request. Publisher credentials must never exist in these containers.

## HEL-60 worker isolation

`compose.isolation.json` is the enforced rootless-Podman/Docker Compose model.
It keeps crawler, browser, AI, control and publisher zones on separate
networks. Crawler and browser traffic can leave their internal networks only
through an allowlisted proxy that repeats the HEL-59 global-address checks and
connects to the validated IP address. The AI worker has no egress path.

The model is checked by `isolation_policy.py` and an adversarial container
probe. Operational details and the complete credential/network map are in
`docs/web-intelligence/worker-isolation.md`.

## Run tests

From this directory:

```powershell
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
```

With rootless Podman (preferred) or Docker Compose installed, run the actual
container boundary test from the repository root:

```powershell
python services/web-intelligence/scripts/verify_isolation_runtime.py
```
