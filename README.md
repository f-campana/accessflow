# AccessFlow

AccessFlow is a full-stack workflow case study for clinical study workspace access requests. It focuses on truthful workflow transitions across authentication, authorization, typed commands, persistence, idempotency, audit events, and typed errors.

It is not a compliance platform, clinical data system, generic form library, or generic workflow engine.

## Current Status

The repo contains the project brief, collaboration guardrails, and the first backend command-boundary slice:

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
- Requester ownership checks, typed command errors, idempotency replay, and audit writes for the submit transition.

Current focus:

- Keep hardening backend correctness before building workflow UI.
- Treat transaction rollback, idempotency concurrency, and draft-vs-submit races as higher priority than UI surface area.
- Do not build reviewer/admin flows until the requester submit path is reliable under failure and retry.

## Read First

1. `docs/00-product/accessflow-workflow-brief.md`
2. `AGENTS.md`

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

Run development servers:

```bash
pnpm dev
```

Expected local ports:

```text
web: http://localhost:3000
api: http://localhost:4000
```

## Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

## Boundaries

- `apps/api` owns auth, Drizzle, command services, idempotency, authorization, audit writes, and workflow mutations.
- `apps/web` owns UI and tRPC client usage. It must not import Drizzle, auth tables, or API command services directly.
- `packages/workflow` owns pure workflow transition logic only.
- `packages/core` owns small generic helpers only.

No UI should claim a workflow transition succeeded until the API has persisted the state change and audit event.
