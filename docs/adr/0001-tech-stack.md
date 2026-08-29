# ADR 0001: Initial technology stack

Status: accepted for V1 bootstrap

## Decision

- TypeScript strict across the repository.
- pnpm workspaces with Turborepo for task orchestration.
- Next.js App Router for the web/PWA surface.
- Manifest V3 TypeScript-compatible extension, Chromium first.
- React Native + Expo is the planned later mobile client; it is not coupled to the web UI.
- PostgreSQL/Supabase is the planned cloud boundary for V2, behind repository/auth/storage interfaces.
- Local mode starts with a browser metadata repository abstraction; IndexedDB/OPFS implementation is a separate issue and must not silently upload files.
- Zod-compatible runtime schemas, Vitest/Playwright test layers, and GitHub Actions are required before production features.

## Consequences

The first commit can be run locally without cloud credentials. Cloud auth, RLS, media storage and sync are deliberately not represented as fake working features.

## Reversal path

The domain package and provider interfaces allow a different web host, database, auth provider or local storage implementation without changing product requirements.
