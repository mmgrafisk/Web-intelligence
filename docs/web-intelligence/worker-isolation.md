# Worker isolation runbook

Status: HEL-60 implementation boundary

The crawler, browser and AI roles process hostile content. They run on
internal-only networks with non-root users, read-only root filesystems, all
Linux capabilities dropped and `no-new-privileges` enabled. They receive no
publisher, control-plane or container-engine credentials.

## Enforced paths

| Role           | Networks                                     | Writable storage                 | Credentials                     | Permitted outbound path                    |
| -------------- | -------------------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------ |
| HTTP crawler   | `crawler-zone`                               | named snapshot volume and `/tmp` | none                            | allowlisted proxy at `egress-gateway:8080` |
| Browser worker | `browser-zone`                               | named snapshot volume and `/tmp` | none                            | allowlisted proxy at `egress-gateway:8080` |
| AI worker      | `ai-zone`                                    | `/tmp` only                      | none                            | none                                       |
| Egress gateway | crawler/browser zones plus `public-egress`   | `/tmp` only                      | none                            | configured public domains on ports 80/443  |
| Control plane  | `control-zone`                               | service-owned storage            | auth only                       | never shares a worker network              |
| Publisher      | `publisher-zone` and destination-only egress | service-owned audit/diff storage | destination-specific credential | validated publication objects only         |

The current Compose model includes control and publisher sentinels only under
the `isolation-test` profile. HEL-63 owns the real publisher implementation.
The sentinels prove that untrusted workers cannot resolve or connect to either
privileged zone and cannot see their canary credentials.

## Credential and database role map

| Credential or role                | Holder                | Worker visibility        | Purpose                                 |
| --------------------------------- | --------------------- | ------------------------ | --------------------------------------- |
| Operator session/auth config      | API/control plane     | none                     | authenticated job and approval actions  |
| `wi_control` database role        | API/control plane     | none                     | job, source-policy and approval records |
| `wi_ingest_append` database role  | future ingest service | none                     | append-only snapshot/candidate intake   |
| `wi_publisher_read` database role | publisher             | none                     | read approved publication/audit records |
| Destination publication token     | publisher only        | none                     | apply an approved publication object    |
| Egress allowlist                  | egress gateway config | readable, not privileged | limit public destinations               |

Workers will submit typed results through constrained service interfaces when
those queues are implemented; direct database credentials are deliberately not
added to this baseline.

## Launch and verification

Production/self-hosted operation should use rootless Podman. Docker Compose is
supported for development and CI verification. Set a comma-separated explicit
allowlist before launch:

```powershell
$env:WI_EGRESS_ALLOW_DOMAINS = "example.com,www.example.com"
python services/web-intelligence/scripts/verify_isolation_runtime.py
```

The verifier validates the Compose model, builds the worker image, starts
privileged sentinels on disjoint networks and executes a compromised-worker
probe. The probe fails if a worker receives a secret, resolves a privileged
service, or can use the gateway to reach loopback, metadata/private addresses
or an unlisted public domain.

Rootless execution is a deployment requirement. The verifier rejects rootful
Podman unless `--allow-rootful-test` is explicitly supplied for CI. Do not add
host bind mounts, engine sockets, SSH agents, host networking, privileged mode,
devices or publisher/control credentials to worker services.
