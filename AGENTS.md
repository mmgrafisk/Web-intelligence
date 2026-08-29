# Bookmark Intelligence Platform: Agent Operating Rules

These rules apply to every task in this repository. They protect the approved
product requirements and keep implementation work traceable.

## Sources of truth

- Linear is the source of truth for product requirements, scope, roadmap,
  risks, acceptance criteria, and execution status.
- GitHub is the source of truth for code, pull requests, CI, and releases.
- Accepted ADRs in `docs/adr` are the source of truth for technical decisions.
- When sources conflict, stop implementation, document the conflict, and ask
  Michael for a decision. Do not silently choose a new product direction.

## Required task workflow

1. Identify one active Linear issue before changing code.
2. Read its goal, in-scope work, out-of-scope work, acceptance criteria, and
   dependencies.
3. Show the current checklist before starting a new step:
   - `~~Task~~` means verified complete.
   - `[ ] Task` means not started.
   - `[ ] Task — in progress` means active.
   - `[ ] Task — blocked: reason` means user or external action is required.
4. Inspect the current branch, worktree, relevant files, and existing tests.
5. Make the smallest coherent change that satisfies the active issue.
6. Run checks proportionate to the risk and record the evidence.
7. Update Linear only after code, CI, or the relevant external setting has
   been verified.
8. Do not begin the next Linear issue until the current result and remaining
   gaps have been shown to Michael.

## Scope controls

- Do not change approved product requirements unless Michael explicitly asks.
- Do not implement adjacent ideas automatically. Add them to the backlog with
  a reason, expected value, and dependencies.
- Do not claim that a shell, mock, interface, migration file, or passing unit
  test is a complete product feature.
- Preserve accountless local mode and the local-first architecture.
- Keep Supabase optional and isolated behind provider interfaces.
- Do not reuse ExposPrint or another product's database, storage, credentials,
  analytics, or infrastructure.
- Keep React Native + Expo as the planned mobile client. Do not force web UI
  code into the mobile client.
- Treat external content as untrusted and validate it at runtime boundaries.

## Actions allowed within an approved issue

- Read repository, Linear, CI, and connected-service state.
- Edit files directly required by the active issue.
- Add or update tests and documentation required by the change.
- Run local checks and CI-safe validation.
- Commit and push changes to the existing feature branch when the user has
  explicitly authorized implementation of that issue.
- Update the active Linear issue with verified evidence.

## Actions requiring Michael's explicit approval

- Merge a pull request or mark a release as production-ready.
- Deploy to production or publish to an app/extension store.
- Create a paid service, incur usage charges, or change a subscription.
- Create or reuse production databases, storage buckets, auth providers, API
  keys, domains, or other infrastructure.
- Delete data, repositories, projects, branches, environments, or accounts.
- Run destructive migrations or irreversible bulk operations.
- Change security, privacy, pricing, billing, legal, or retention policy.
- Contact customers, vendors, reviewers, or other external people.
- Expand the active issue beyond its written scope.

## Definition of done

An issue may be marked complete only when:

- every acceptance criterion is satisfied;
- relevant format, lint, type, test, build, database, dependency, and secret
  checks pass;
- required runtime or end-to-end behavior is verified where applicable;
- security and recovery implications are addressed;
- documentation and evidence links are current;
- no known blocker is hidden; and
- Linear reflects the verified state.

Near-complete work stays open with the remaining gate stated plainly.

## Current execution boundary

The active project is Bookmark Intelligence Platform in the Hellomedia Linear
workspace. HEL-37 is the active implementation issue on a branch stacked above
HEL-36. HEL-33 and HEL-36 remain in review. Review may proceed autonomously;
merging any pull request requires Michael's explicit approval.
