# Bookmark Intelligence Platform

Local-first bookmark, media and creator-intelligence platform. Product requirements live in Linear; code, CI and releases live here.

## Current slice

The current slice delivers a real accountless local library while keeping cloud
mode optional:

- `apps/web`: responsive Next.js library for saving, organizing, searching,
  deleting and restoring bookmarks. IndexedDB is the source of truth and the
  cached app shell can reopen offline after its first successful load.
- `apps/extension`: Chromium Manifest V3 Quick Save extension with a remembered
  destination and a validated, user-confirmed handoff to the canonical library.
- `packages/capture`: shared runtime-validated extension-to-library capture protocol.
- `packages/domain`: canonical bookmark types and pure rules.
- `packages/schemas`: runtime validation for untrusted inputs and persisted records.
- `packages/auth`: accountless local identity and cloud-auth contracts.
- `packages/storage`: portable repository contracts and an in-memory reference adapter.
- `packages/storage-indexeddb`: validated browser persistence with atomic
  bookmark/outbox mutations, a stable local device identity and recovery after
  database reopen.
- `packages/sync`: idempotent operations, bounded retry and deterministic conflict rules.
- `packages/cloud-supabase`: optional publishable-key cloud adapter.
- `docs/adr`: accepted architecture decisions and reversal paths.

The local web workflow is functional without an account or cloud credentials.
Cloud auth, remote sync, large-media archiving and AI remain separate roadmap
items and are not presented as complete.

## Verified local workflow

1. Save an HTTP or HTTPS page with a title, collection, tags and notes.
2. Search the persisted bookmark and reorganize it later.
3. Reload or reopen the app and recover the same IndexedDB data and outbox.
4. Move an item to Trash and restore it without losing its organization.
5. Reopen the cached app shell while the browser network is offline.

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

Node.js 22+ is required.

### Browser extension

Build the extension and load the generated folder as an unpacked extension in
Chrome, Edge or Brave:

```text
pnpm --filter @bookmark-platform/extension build
```

Load `apps/extension/dist`, then open **Library settings** in the extension and
enter the address where the web app is running (for example,
`http://localhost:3000/`). Quick Save opens a validated confirmation form in
the web app; the bookmark is written to IndexedDB only after the user confirms.

Cloud mode is disabled when the optional Supabase environment variables are absent. Do not use the existing ExposPrint Supabase project for this product. A dedicated project, provider configuration and migration verification are required before cloud mode is exposed to users.

## Source of truth

- Linear: product requirements, roadmap, risks, ADR index and execution status.
- GitHub: repository, branches, pull requests, CI and releases.
