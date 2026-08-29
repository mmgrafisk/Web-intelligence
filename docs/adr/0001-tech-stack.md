# ADR 0001: Initial technology stack

Status: accepted for V1 bootstrap

## Decision

- TypeScript strict across the repository.
- Node.js 22 or newer. Node 20 is no longer a supported cloud-client baseline.
- pnpm workspaces with Turborepo for task orchestration.
- Next.js App Router for the web/PWA surface.
- Manifest V3 TypeScript-compatible extension, Chromium first.
- React Native + Expo is the planned later mobile client; it is not coupled to the web UI.
- PostgreSQL/Supabase is the optional cloud boundary, behind repository/auth/storage interfaces.
- Local metadata and the sync outbox use IndexedDB through a dedicated adapter. Large archived media does not belong in browser key/value storage; OPFS/file-system adapters are separate work.
- Zod-compatible runtime schemas, Vitest/Playwright test layers, and GitHub Actions are required before production features.

## Consequences

The first commit can be run locally without cloud credentials. Cloud auth, RLS, media storage and sync are deliberately not represented as fake working features.

## Reversal path

The domain package and provider interfaces allow a different web host, database, auth provider or local storage implementation without changing product requirements.
