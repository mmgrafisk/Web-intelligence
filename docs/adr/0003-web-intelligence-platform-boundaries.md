# ADR-0003: Web Intelligence Platform Boundaries

- Status: Accepted for HEL-58
- Date: 2026-08-29
- Owners: Bookmark Intelligence Platform / Web Intelligence Platform

## Context

The Linear workspace contains three related but distinct projects:

- Bookmark Intelligence Platform: local-first bookmark capture and recovery.
- Web Intelligence Platform: reusable crawling, provenance, intelligence and
  controlled publishing infrastructure.
- Service Business Software Media: the first commercial consumer of Web
  Intelligence for software discovery and affiliate content.

The projects must share contracts and evidence without sharing unsafe worker
privileges, publisher secrets or niche-specific product logic.

## Decision

1. Web Intelligence is a separate platform boundary with a Python/FastAPI
   control plane, rootless worker processes, PostgreSQL evidence store and
   versioned publishing adapters.
2. All web content, rendered DOM, files and model output are untrusted. The
   only privileged publication path is validated proposal -> quality gate ->
   explicit approval -> publisher.
3. Source URL and redirect validation is a shared mandatory service for HTTP
   and browser crawling. No crawler or model may bypass it.
4. Web Intelligence owns normalized entities, facts, claims, evidence,
   changes and content objects. Consuming sites own editorial policy,
   monetization, disclosures and public analytics.
5. Service Business Software Media integrates through a versioned API/export
   contract. It never embeds crawler orchestration or receives crawler/AI
   access to publisher credentials.
6. Bookmark Intelligence remains local-first and is not coupled to the Web
   Intelligence worker runtime. Future enrichment may consume an explicit
   provider contract only after core save/recovery remains complete.
7. The MVP uses a modular monolith with separate rootless workers. Optional
   services are added only when a measured requirement justifies their cost,
   security and license surface.

## Consequences

Positive:

- One reusable intelligence engine can feed multiple products.
- Evidence, conflicts and freshness remain visible to editors and operators.
- A compromised web worker cannot publish or access unrelated secrets.
- The media product can change CMS/destination without losing canonical data.

Trade-offs:

- The first end-to-end feature requires explicit contracts between projects.
- Staged publication and approval are slower than blind automation.
- Worker isolation and evidence retention add operational work before scale.

## Rejected alternatives

- Embedding crawler/AI/publisher code in Service Business Software Media.
- Letting a crawler or LLM call a publisher or arbitrary network tool directly.
- Treating generated prose as evidence.
- Building microservices, a separate search engine or paid API dependencies
  before a measured requirement exists.

## Reversal conditions

Revisit this ADR only when a documented workload, security review, licensing
review and migration/rollback plan demonstrate that the modular monolith or
current project boundary cannot meet a verified requirement.
