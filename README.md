# Bookmark Intelligence Platform

Local-first bookmark, media and creator-intelligence platform. Product requirements live in Linear; code, CI and releases live here.

## Current slice

This bootstrap is intentionally small and honest:

- `apps/web`: Next.js App Router shell for the local-first library experience.
- `apps/extension`: Chromium Manifest V3 Quick Save shell with remembered destination.
- `packages/domain`: shared canonical bookmark types, URL normalization and deduplication rules.
- `docs/adr`: accepted architecture decisions and reversal paths.

The web shell is a product slice, not a claim that cloud auth, sync, media archiving or AI are complete. Those capabilities must be implemented behind tested interfaces and remain optional for the free/local mode.

## Development

```text
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

Node.js 20.9+ is required. Load `apps/extension` as an unpacked extension in Chrome, Edge or Brave after building the extension bundle when the build pipeline is added.

## Source of truth

- Linear: product requirements, roadmap, risks, ADR index and execution status.
- GitHub: repository, branches, pull requests, CI and releases.
