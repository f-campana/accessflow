# AccessFlow

AccessFlow is a full-stack workflow case study for clinical study workspace access requests. It focuses on truthful workflow transitions across authentication, authorization, typed commands, persistence, idempotency, audit events, and typed errors.

It is not a compliance platform, clinical data system, generic form library, or generic workflow engine.

## Current Status

The repo contains the project brief, collaboration guardrails, backend command boundary, and the first requester-facing workflow UI:

```text
apps/web
apps/api
packages/core
packages/workflow
```

Implemented API coverage:

- Better Auth local email/password session path.
- Drizzle/Postgres schema and migrations inside `apps/api`.
- `createDraft`, `saveDraft`, `submitRequest`, `startReview`,
  `approveRequest`, and `rejectRequest` command services.
- tRPC mutations for those commands.
- tRPC reads for the current actor, study list, and requester study access state.
- tRPC reviewer reads for submitted, under-review, approved, and rejected
  request inbox/detail projections.
- Requester ownership checks, typed command errors, idempotency replay, and audit writes for the submit transition.
- Reviewer/admin authorization for reviewer reads and review decisions.
- Reviewer transition idempotency replay/conflict behavior for start, approve, and reject retries.

Implemented web coverage:

- Real local sign-up/sign-in through the API auth path.
- Study entry point backed by seeded Postgres data.
- Draft creation, draft saving, submission, typed error rendering, persisted status, and audit timeline.
- Requester visibility for approved/rejected final states after reviewer decisions,
  including decision notes and full persisted audit history.
- Reviewer queue/detail view for submitted, under-review, approved, and rejected
  requests, including start-review, approve, reject, decision note, and
  persisted audit timeline.

Current focus:

- Keep requester and reviewer workflow surfaces honest while broadening coverage.
- Do not add withdrawal, revocation, admin consoles, uploads, notifications, or
  tenant/org modeling before the current workflow is reviewed.

Current implementation covers requester submission and reviewer decisions:

```text
implemented: sign up/sign in, study read, draft create/save, submit, reviewer start/approve/reject, reviewer transition idempotency, requester final-state reads, persisted audit timelines
next: review whether withdrawal/revocation belongs before admin inspection
later roadmap: withdrawal/revocation, admin inspection, broader operational surfaces
```

## Read First

1. `docs/00-product/accessflow-workflow-brief.md`
2. `docs/30-quality/repo-quality-gate.md`
3. `docs/40-review/requester-workflow-hardening-todo.md`
4. `AGENTS.md`

The core invariant is:

```text
A workflow transition is successful only when the API transaction persists the new state and writes the audit event.
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Start Postgres:

```bash
docker-compose up -d postgres
```

If your Docker installation supports the newer plugin syntax, `docker compose up -d postgres` is equivalent.

Run migrations:

```bash
pnpm --filter @accessflow/api db:migrate
```

Seed the synthetic study workspace and stable demo accounts without deleting existing local data:

```bash
pnpm --filter @accessflow/api db:seed
```

Reset the local preview database to a clean demo baseline:

```bash
pnpm demo:reset
```

`demo:reset` only runs against the local preview database at `localhost:55433/accessflow`. It applies migrations, deletes old demo studies/requests/users from that local database, then seeds one study and the stable demo accounts.

Seeded local credentials:

```text
requester@example.test / development-password
reviewer@example.test / development-password
admin@example.test / development-password
```

Run development servers:

```bash
pnpm dev
```

Expected local ports:

```text
web: http://localhost:3000
api: http://localhost:4000
```

For phone testing on the local network, use the production-style preview:

```bash
pnpm mobile:preview
```

That command starts Postgres, applies API migrations, seeds the synthetic study workspace and demo accounts, builds the web app, and prints the LAN URL plus local credentials to use on a phone.

`mobile:preview` resets the local preview database before seeding. Each run starts from:

```text
1 synthetic study
3 demo users
0 study access requests
0 stale generated studies
```

For UI changes, verify the rendered app with Browser or Playwright in addition to code checks. The current mobile smoke path should cover seeded demo sign-in, new requester creation, seeded study visibility, draft creation, submission, persisted audit timeline after sign-out/sign-in, reviewer submitted-request reads, reviewer start-review, reviewer approve/reject, requester visibility for approved/rejected final states, readable auth errors, and no horizontal overflow at phone width.

For repeatable requester workflow browser coverage, install the Playwright browser once:

```bash
pnpm exec playwright install chromium
```

Then run:

```bash
pnpm test:e2e
```

This starts the local Postgres/API/web stack through Playwright from the same clean demo baseline and exercises the requester path plus reviewer read/start/approve/reject paths at phone width.

## Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

The API test runner uses an isolated `accessflow_test` database by default so verification cannot truncate the active development or mobile-preview database. To override the test database URL, set `ACCESSFLOW_TEST_DATABASE_URL`.

See `docs/30-quality/repo-quality-gate.md` for the full pass-closing standard.

See `docs/40-review/requester-workflow-hardening-todo.md` for the completed requester hardening backlog and `docs/40-review/post-hardening-review-checkpoint.md` for the reviewer workflow progression notes.

## Boundaries

- `apps/api` owns auth, Drizzle, command services, idempotency, authorization, audit writes, and workflow mutations.
- `apps/web` owns UI and tRPC client usage. It must not import Drizzle, auth tables, or API command services directly.
- `packages/workflow` owns pure workflow transition logic only.
- `packages/core` owns small generic helpers only.

No UI should claim a workflow transition succeeded until the API has persisted the state change and audit event.
