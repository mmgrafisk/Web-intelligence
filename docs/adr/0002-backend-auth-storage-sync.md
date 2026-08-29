# ADR 0002: Backend, auth, storage and sync boundary

Status: accepted for implementation foundation

## Context

The product must work without an account, paid API, cloud storage or network connection. Cloud sync, collaboration and shared projects remain optional. The same domain model must later support React Native and Expo without importing browser-only APIs into shared packages.

## Decision

### Backend

- Next.js Route Handlers form the portable browser-facing backend-for-frontend for operations that require secrets or server-side controls, including archiving, provider calls, imports and AI.
- Supabase provides the optional managed cloud adapter: hosted PostgreSQL, Auth and private Storage buckets.
- Domain code never imports Supabase directly. Provider code is isolated in `packages/cloud-supabase`.
- Direct Data API access is only allowed for explicitly granted tables protected by tested row-level security. A publishable key is safe for public clients; secret/service-role keys are server-only and must never use `NEXT_PUBLIC_` variables.
- Supabase Realtime may later notify clients that new changes exist, but it is never the sync source of truth.

### Auth

- Local mode uses a device-scoped accountless identity. It has no remote session and no cloud side effects.
- Cloud mode uses Supabase Auth behind `packages/auth` contracts.
- The first stable sign-in methods are email magic link, Google and Apple. Password sign-in is not a primary product path.
- Passkeys remain part of the contract and target UX, but the hosted provider capability is still beta and is not presented as production-ready until verified for the selected Supabase project and clients.
- Server authorization validates signed claims and database ownership. UI state and user-editable metadata are never authorization sources.

### Local and cloud storage

- IndexedDB stores canonical metadata, settings and the durable sync outbox in the PWA. Runtime validation occurs before persistence and after reads.
- Large archived pages and media use a future OPFS/file-system adapter. Large blobs must not be added to IndexedDB merely because metadata is already there.
- Cloud metadata uses PostgreSQL with lowercase snake-case identifiers, time-zone-aware timestamps, explicit constraints and indexes on ownership/foreign-key columns.
- Cloud assets use one private Supabase Storage bucket. Object paths begin with the authenticated user ID, and INSERT/SELECT/UPDATE/DELETE policies are separate.
- Local mode never initializes cloud clients or uploads content unless the user explicitly enables cloud mode.

### Sync

- Every local mutation commits locally first and appends an idempotent operation to a durable outbox in the same product flow.
- Operation IDs are ULIDs, making them portable and time ordered. The cloud endpoint deduplicates by operation ID.
- Sync uses bounded push/pull batches and a server cursor. Retry uses capped exponential backoff; permanent failures move to a visible dead-letter state.
- Record revisions are monotonic. Concurrent whole-record updates use a deterministic `(updated_at, device_id, operation_id)` tie-breaker. Destructive or non-mergeable conflicts must retain a recoverable copy rather than silently discarding user data.
- Deletes are soft deletes/tombstones during the 30-day trash window and sync like other mutations. Permanent deletion is a separate explicit operation.

## Package boundaries

| Package             | Responsibility                                  | Platform assumptions                    |
| ------------------- | ----------------------------------------------- | --------------------------------------- |
| `domain`            | Canonical content types and pure rules          | None                                    |
| `schemas`           | Runtime validation for untrusted boundaries     | None                                    |
| `auth`              | Local/cloud auth contracts                      | None                                    |
| `storage`           | Repository and asset-store contracts            | Web `Blob` type only for asset contract |
| `storage-indexeddb` | Browser metadata database and outbox            | Browser/PWA                             |
| `sync`              | Operations, retry, transport and conflict rules | None                                    |
| `cloud-supabase`    | Optional Supabase client adapter                | Cloud mode only                         |

The later mobile client may reuse `domain`, `schemas`, `auth`, `storage` contracts and `sync`. It receives native implementations for secure credentials, SQLite/files, background sync and share-sheet ingestion.

## Security consequences

- All exposed cloud tables enable RLS and scope every operation to `(select auth.uid()) = owner_id` for the first single-owner cloud slice.
- Collaboration membership policies are not faked in V1. They require a separate reviewed schema and threat model.
- Storage paths and RLS both enforce ownership. Bucket privacy is not a replacement for object policies.
- Saved page content remains untrusted data and cannot become instructions to AI or agent layers.

## Verification boundary

Local interfaces, validation, persistence and sync behavior are covered by automated tests. The SQL migration can be reviewed and committed now, but RLS, Auth providers, Storage policies and restore behavior cannot be claimed as runtime-verified until a dedicated Bookmark Intelligence Supabase project exists. The existing ExposPrint project is explicitly out of scope.

## Reversal path

Supabase can be replaced by another cloud provider by implementing the same auth, repository, asset and sync transport contracts. Local data remains exportable and usable without that provider.
