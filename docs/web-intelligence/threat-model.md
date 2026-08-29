# Web Intelligence Platform Threat Model

Status: accepted implementation boundary for HEL-58; HEL-60 isolation mapped

## Assets

| Asset                               | Security property                                      |
| ----------------------------------- | ------------------------------------------------------ |
| Source policy and crawl budgets     | Only approved, bounded destinations are reachable      |
| Raw snapshots and extracted content | Integrity, provenance and separation from instructions |
| Product facts, claims and evidence  | Traceability, freshness and conflict visibility        |
| Publisher credentials               | Confidentiality and least-privilege use                |
| Publication objects and audit logs  | Integrity, idempotency and recoverability              |
| Operator controls and kill switches | Authenticated, authorized and auditable changes        |
| Local model prompts and outputs     | No secrets; typed, untrusted proposals only            |

## Trust-boundary threats and mitigations

| Threat                                | Boundary                           | Required mitigation                                                                                                | Verification fixture/test                                                   |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| SSRF to loopback/private network      | API -> crawler                     | HTTP/HTTPS only; resolve and reject loopback, private, link-local, multicast, reserved and metadata ranges         | localhost, 127.0.0.1, encoded IPv4, IPv6 loopback and RFC1918 cases         |
| Redirect-based SSRF                   | Crawler -> next URL                | Resolve and apply the same policy to every redirect; cap redirect count                                            | public URL redirecting to private/metadata address                          |
| DNS rebinding                         | URL guard -> network               | Resolve at decision and connection boundaries where possible; pin/recheck permitted address; enforce egress policy | host changes from public to private between checks                          |
| Embedded credentials                  | API -> crawler                     | Reject userinfo in URLs and redact sensitive URL material from logs                                                | `https://user:pass@example.test/`                                           |
| Resource exhaustion                   | Source -> workers                  | Per-domain concurrency/delay, page/byte/depth/time budgets and bounded queues                                      | large response, deep link graph and retry storm                             |
| Malicious HTML, files or rendered DOM | Internet -> extractor/browser      | Sandboxed/rootless workers, bounded parsing, no execution of extracted instructions and isolated temp volumes      | hostile HTML/PDF fixtures with scripts and oversized payloads               |
| Indirect prompt injection             | Snapshot -> AI worker              | Label all content untrusted; keep policy outside content; no tools/network/shell/filesystem; typed output only     | hidden text, fake tool calls, base64 instructions and exfiltration requests |
| Secret leakage                        | Secret store -> workers/model/logs | Credentials only in the least-privileged service; redaction and no secrets in prompts/logs                         | canary secret in page content and model context test                        |
| Model-triggered privileged action     | AI -> publisher/control plane      | Allowlisted schema; deterministic validation; explicit human approval; no direct tool authority                    | proposal with publish, shell, URL or policy mutation fields                 |
| Poisoned/conflicting source data      | Sources -> facts                   | Preserve source/evidence links, confidence, verification state and conflict records                                | two sources disagree on price or feature                                    |
| Publisher credential abuse            | Worker -> publisher                | Separate service/container/account; publisher accepts validated objects only; rate limits and kill switch          | compromised-worker integration test attempts publish                        |
| Duplicate or partial publication      | Publisher -> destination           | Stable external IDs, idempotency keys, dry-run diff, before/after audit and rollback state                         | repeat same request and inject partial destination failure                  |
| Supply-chain compromise               | Dependencies/build -> runtime      | Pinned lockfiles/images, license inventory, Bandit, pip-audit, Trivy, Gitleaks and SBOM gates                      | CI security fixtures and dependency exception expiry                        |

## Privilege matrix

| Component             | Network                             | Database                                                 | Filesystem                                | Secrets                              | Publication                                          |
| --------------------- | ----------------------------------- | -------------------------------------------------------- | ----------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| API/control plane     | Control/API endpoints only          | Read/write job/control records through service boundary  | No raw host access                        | Auth/session configuration only      | Requests approval; never publishes directly          |
| HTTP crawler          | Approved external destinations only | Append crawl result through constrained interface        | Temporary workspace and snapshot volume   | None                                 | None                                                 |
| Browser worker        | Approved destinations only          | No direct authoritative writes                           | Read-only image plus isolated temp volume | None                                 | None                                                 |
| Extractor             | No arbitrary egress                 | Candidate writes through constrained interface           | Read snapshot, write candidate output     | None                                 | None                                                 |
| AI worker             | No arbitrary egress by default      | Read approved evidence/proposals; no unrestricted writes | No host filesystem                        | No publisher or cloud credentials    | None                                                 |
| Quality/security gate | No destination publishing           | Validate and stage records                               | No host access                            | No publisher secret                  | Can reject; cannot approve alone                     |
| Publisher             | Destination allowlist only          | Read approved publication/audit records                  | Temporary render/diff volume              | Destination-specific least privilege | Only component allowed to apply approved publication |
| Admin UI              | Talks to API only                   | No direct database access                                | No host access                            | Browser session only                 | No bypass of approval policy                         |

The concrete network and credential grants are enforced by
`services/web-intelligence/compose.isolation.json` and documented in
`docs/web-intelligence/worker-isolation.md`. Untrusted workers have no shared
network with the control or publisher zones. Crawler and browser public egress
is possible only through the allowlisted gateway; the AI worker has no public
egress. No untrusted worker receives a Compose secret, publisher/control
environment variable, host bind mount, engine socket or SSH agent.

## Required security tests before release

1. URL policy rejects unsafe schemes, embedded credentials, private address
   forms, redirect targets and DNS-rebinding transitions.
2. Worker integration tests demonstrate that a compromised crawler/browser/AI
   process cannot read publisher credentials, reach host-private services or
   invoke publication.
3. Adversarial content tests demonstrate that prompt injection remains data
   and cannot alter policy, reveal secrets or create actions.
4. Model proposal parsing fails closed on unknown fields, invalid provenance,
   publication without approval and actions outside the allowlist.
5. Publication tests demonstrate idempotent retries, dry-run differences,
   audit completeness and rollback after partial failure.
6. CI blocks committed secrets and unaccepted high/critical dependency or
   container findings, with expiring exceptions only.
