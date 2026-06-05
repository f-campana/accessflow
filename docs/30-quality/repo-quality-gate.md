# Repository Quality Gate

This document defines how each AccessFlow pass is closed. It exists so implementation, review, and local-device testing do not drift into "looks fine from code" without proving the rendered workflow.

## Core Rule

A pass is not complete until the relevant code checks and runtime checks have passed, or the final report explicitly names the blocker.

The depth of verification should match the change:

- docs-only changes need documentation hygiene checks
- backend changes need command/API/database checks
- user-visible web changes need rendered browser or simulator checks
- workflow changes need persisted-state and audit-event checks

## Baseline Gate

Before changing files:

1. Read `AGENTS.md`.
2. Check `git status --short`.
3. Identify existing dirty files and do not revert unrelated work.
4. Keep ownership boundaries intact:
   - `apps/api` owns auth, Drizzle, command services, authorization, idempotency, audit writes, and workflow mutations.
   - `apps/web` owns UI and tRPC client usage. It must not import Drizzle, auth tables, API command services, or database modules.
   - `packages/workflow` owns pure workflow transitions only.
   - `packages/core` stays domain-free and small.

## Static Gate

Run before reporting completion for code changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

For docs-only changes, `git diff --check` is the minimum required check.

## API And Database Gate

API tests must run through:

```bash
pnpm --filter @accessflow/api test
```

The API test runner uses an isolated `accessflow_test` database by default. Do not run destructive DB helpers against the active development or mobile-preview database.

Any workflow mutation must prove:

1. authenticated actor
2. authorization and ownership checks
3. input validation
4. workflow transition legality
5. database transaction
6. persisted state change
7. audit event written in the same transaction
8. idempotency replay/conflict behavior when the command is retryable
9. typed success or typed error response

The central invariant remains:

```text
A workflow transition is successful only when the API transaction persists the new state and writes the audit event.
```

## Web And UX Gate

For any user-visible web change, static checks are not enough. Run a real rendered smoke check with at least one of:

- Browser tool against `pnpm mobile:preview`
- Playwright/browser automation at desktop and mobile widths
- iOS Simulator when explicitly validating Safari or iPhone behavior

The smoke check must cover the affected workflow, not only page load.

For the requester path, verify:

1. seeded requester sign-in and new requester account creation
2. friendly auth errors, with no raw JSON shown to the user
3. seeded study visibility
4. draft creation
5. form validation
6. request submission
7. persisted `submitted` state
8. audit timeline event
9. sign-out/sign-in and refresh do not lie about workflow state
10. approved/rejected final states remain visible after reviewer decisions
11. rejection notes and decision audit events are visible to the requester
12. submitted or under-review requests can be withdrawn with a persisted audit event
13. rejected requests can be reopened to an editable draft with a persisted audit event
14. no browser console errors or warnings
15. no horizontal overflow at phone width

For the reviewer path, verify:

1. seeded reviewer sign-in
2. submitted requests appear in the reviewer queue
3. requester users cannot access reviewer reads or commands
4. `startReview` moves the selected request to `under_review`
5. approve/reject controls only appear for `under_review` requests
6. `approveRequest` moves the request to `approved`
7. `rejectRequest` requires a reason and moves the request to `rejected`
8. final approved/rejected/withdrawn states hide decision controls
9. retryable start/approve/reject actions preserve one workflow audit event per idempotency key
10. audit timeline shows persisted `submitRequest`, `startReview`, decision, and withdrawal events when present
11. no browser console errors or warnings
12. no horizontal overflow at phone width

The repeatable requester browser gate is:

```bash
pnpm test:e2e
```

First-time local setup may need:

```bash
pnpm exec playwright install chromium
```

The e2e gate starts the local Postgres/API/web stack through Playwright, runs mobile-width Chromium workflows, checks the requester happy path and empty-submit validation path, reloads to prove persisted requester state, verifies requester and reviewer audit timelines, exercises requester withdrawal and rejected-request reopen, exercises reviewer start/reject/approve paths, verifies requester final-state visibility after reviewer rejection, captures page errors/console warnings, and asserts no horizontal overflow.

The e2e startup resets the local preview database before seeding, so it should begin with one study, three demo users, and no existing access requests.

## Mobile Preview Gate

For phone or local-network review, use:

```bash
pnpm mobile:preview
```

This command starts Postgres, applies migrations, resets the local preview database, seeds the synthetic study workspace plus requester/reviewer/admin demo accounts, builds the web app, starts the API and web servers, and prints the LAN URL and credentials for a phone.

Each preview run should start from:

```text
studies: 1
users: 3
study access requests: 0
reviewer queue: empty until the current test creates a request
```

Use this path instead of relying on plain Next dev server behavior when validating the app from an iPhone.

The preview helper is intentionally conservative:

- it uses `DATABASE_URL` only through a validated local preview URL
- `ACCESSFLOW_PREVIEW_DATABASE_URL` must still point to `localhost:55433/accessflow`
- it refuses demo reset unless the target is the local preview database
- it refuses to start if ports `3000` or `4000` are already occupied
- it supports either `docker compose` or `docker-compose`
- it prints the phone URL only after Postgres, the API, the web server, and the LAN web URL are reachable

## Documentation Gate

Update documentation when behavior or expectations change:

- update `README.md` for user-facing setup, status, or verification changes
- update `AGENTS.md` for collaboration rules and agent guardrails
- update product or architecture docs only when product meaning, workflow semantics, or boundaries change

Do not add prompt transcripts, scratch reports, or agent process artifacts unless explicitly requested.

## Closing A Pass

Close each pass with a concise report that includes:

1. what changed
2. what was verified
3. what runtime/browser/simulator checks were run, if UI changed
4. what remains intentionally deferred
5. whether a preview server is still running
6. whether files are uncommitted
7. any blocker or risk that remains

Commit or push only when explicitly asked.
