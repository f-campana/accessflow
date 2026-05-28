# Codex Collaboration Guide

This repository is a standalone AccessFlow workspace. It is intentionally small and should stay focused on truthful workflow transitions, not broad platform scaffolding.

## Start Here

Read these files before making non-trivial changes:

1. `README.md`
2. `docs/00-product/accessflow-workflow-brief.md`
3. This `AGENTS.md`

The central product invariant is:

```text
A workflow transition is successful only when the API transaction persists the new state and writes the audit event.
```

## Project Shape

```text
apps/web      Next.js App Router, UI, forms, tRPC client
apps/api      Fastify, tRPC server, Better Auth, Drizzle/Postgres, commands
packages/core Minimal Result/AppError/fromZod/assertNever helpers
packages/workflow Pure workflow statuses, events, XState transition helpers
```

Keep ownership strict:

- `apps/api` owns auth/session resolution, Drizzle, command services, authorization, idempotency, audit writes, and workflow mutations.
- `apps/web` must not import Drizzle, auth tables, API command services, or database modules.
- `packages/workflow` must not import React, Next.js, tRPC, Drizzle, Better Auth, or web/API app code.
- `packages/core` must remain domain-free and tiny.

## Implementation Rules

- Do not fake authentication or add a role switcher.
- Do not add UI that claims a workflow action succeeded before the API persists it.
- Keep command services outside tRPC routers. Routers are adapters, not the business logic layer.
- Use XState only for workflow transition legality. Do not use it for form field state, modal state, loading buttons, tabs, or local UI dirtiness.
- Persist canonical status values and audit events. Do not persist full XState snapshots in v1.
- Keep forms plain React/HTML in v1. Conform is deferred.
- Do not claim HIPAA, GDPR, clinical-grade, or medical-device compliance.
- Do not add document uploads, notifications, queues, analytics, tenants/orgs, or a generic workflow builder unless explicitly requested.

## Backend And Persistence

Use `apps/api` for all backend work.

Expected command path:

```text
tRPC mutation
  -> authenticated actor
  -> authorization
  -> command service
  -> XState transition check
  -> Drizzle transaction
  -> persisted state
  -> audit event
  -> typed result/error
```

For workflow-changing commands:

- validate input with Zod
- authorize before mutation
- use Drizzle transactions
- record idempotency where required
- write the audit event in the same transaction as the status change
- return typed application results/errors

## Testing And Verification

Use `pnpm`.

Run before reporting completion:

```text
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

If dependencies change:

```text
pnpm install
```

If database migrations are needed:

```text
pnpm --filter @accessflow/api db:generate
```

If local Postgres is needed:

```text
docker compose up -d postgres
pnpm --filter @accessflow/api db:migrate
```

Report clearly if Docker/Postgres is unavailable.

## Git And Coordination

- The worktree may already contain changes from another Codex thread or the user. Never revert changes you did not make.
- Keep edits scoped to the requested pass.
- Do not commit or push unless explicitly asked.
- Prefer small, reviewable changes with clear final reports.
- Avoid storing prompt transcripts, scratch reports, or agent process artifacts in the repo unless explicitly requested.

## Review Priorities

When reviewing or implementing, prioritize:

1. auth/session truth
2. authorization and ownership checks
3. idempotency and replay behavior
4. transactionality of status and audit writes
5. typed errors and validation feedback
6. web/API boundary discipline
7. simple UI that reflects persisted state after refresh
