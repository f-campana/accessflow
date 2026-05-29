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
- `createDraft`, `saveDraft`, and `submitRequest` command services.
- tRPC mutations for those commands.
- tRPC reads for the current actor, study list, and requester study access state.
- Requester ownership checks, typed command errors, idempotency replay, and audit writes for the submit transition.

Implemented web coverage:

- Real local sign-up/sign-in through the API auth path.
- Study entry point backed by seeded Postgres data.
- Draft creation, draft saving, submission, typed error rendering, persisted status, and audit timeline.

Current focus:

- Keep the requester lifecycle honest end to end before expanding product surface area.
- Do not build reviewer/admin flows until the requester submit path is reliable under failure and retry.

Current implementation stops at the requester workflow:

```text
implemented: sign up/sign in, study read, draft create/save, submit, persisted audit timeline
next: finish the requester hardening backlog in docs/40-review/requester-workflow-hardening-todo.md
later roadmap: reviewer/admin inboxes, review decisions, withdrawal/revocation, broader operational surfaces
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

Seed the synthetic study workspace:

```bash
pnpm --filter @accessflow/api db:seed
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

That command starts Postgres, applies API migrations, seeds the synthetic study workspace, builds the web app, and prints the LAN URL to open on a phone.

For UI changes, verify the rendered app with Browser or Playwright in addition to code checks. The current mobile smoke path should cover sign-up, seeded study visibility, draft creation, submission, persisted audit timeline, readable auth errors, and no horizontal overflow at phone width.

For repeatable requester workflow browser coverage, install the Playwright browser once:

```bash
pnpm exec playwright install chromium
```

Then run:

```bash
pnpm test:e2e
```

This starts the local Postgres/API/web stack through Playwright and exercises the requester path at phone width.

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

See `docs/40-review/requester-workflow-hardening-todo.md` for the ordered hardening backlog. Process it one issue per pass before expanding the product surface.

Reviewer/admin flows are deliberately roadmap-only until that requester hardening backlog is substantially complete.
For immediate next work, the backlog is the source of truth over broader roadmap language in the product brief.

## Boundaries

- `apps/api` owns auth, Drizzle, command services, idempotency, authorization, audit writes, and workflow mutations.
- `apps/web` owns UI and tRPC client usage. It must not import Drizzle, auth tables, or API command services directly.
- `packages/workflow` owns pure workflow transition logic only.
- `packages/core` owns small generic helpers only.

No UI should claim a workflow transition succeeded until the API has persisted the state change and audit event.
