# Bookmark Intelligence Platform

Local-first bookmark, media and creator-intelligence platform. Product requirements live in Linear; code, CI and releases live here.

## Current slice

This bootstrap is intentionally small and honest:

- `apps/web`: Next.js App Router shell for the local-first library experience.
- `apps/extension`: Chromium Manifest V3 Quick Save shell with remembered destination.
- `packages/domain`: canonical bookmark types and pure rules.
- `packages/schemas`: runtime validation for untrusted inputs and persisted records.
- `packages/auth`: accountless local identity and cloud-auth contracts.
- `packages/storage`: portable repository contracts and an in-memory reference adapter.
- `packages/storage-indexeddb`: tested browser metadata persistence and durable sync outbox.
- `packages/sync`: idempotent operations, bounded retry and deterministic conflict rules.
- `packages/cloud-supabase`: optional publishable-key cloud adapter.
- `docs/adr`: accepted architecture decisions and reversal paths.

The web shell is a product slice, not a claim that cloud auth, remote sync, large-media archiving or AI are complete. Local persistence and sync foundations are implemented behind tested interfaces and remain usable without cloud credentials.

## Development

```text
pnpm install
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

Node.js 22+ is required. Load `apps/extension` as an unpacked extension in Chrome, Edge or Brave after building the extension bundle when the build pipeline is added.

Cloud mode is disabled when the optional Supabase environment variables are absent. Do not use the existing ExposPrint Supabase project for this product. A dedicated project, provider configuration and migration verification are required before cloud mode is exposed to users.

## Source of truth

- Linear: product requirements, roadmap, risks, ADR index and execution status.
- GitHub: repository, branches, pull requests, CI and releases.
