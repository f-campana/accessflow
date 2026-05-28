# AccessFlow

AccessFlow is a full-stack workflow case study for clinical study workspace access requests. It focuses on truthful workflow transitions across authentication, authorization, typed commands, persistence, idempotency, audit events, and typed errors.

It is not a compliance platform, clinical data system, generic form library, or generic workflow engine.

## Current Status

The repo currently contains the project brief and an initial monorepo scaffold:

```text
apps/web
apps/api
packages/core
packages/workflow
```

The next implementation work should focus on the first backend command-boundary slice: real auth/session shape, corrected draft/request persistence semantics, idempotency replay, typed command errors, and transactional audit writes for `createDraft`, `saveDraft`, and `submitRequest`.

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
docker compose up -d postgres
```

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
