# Codex Collaboration Guide

This repository is a standalone AccessFlow workspace. It is intentionally small and should stay focused on truthful workflow transitions, not broad platform scaffolding.

## Start Here

Read these files before making non-trivial changes:

1. `README.md`
2. `docs/00-product/accessflow-workflow-brief.md`
3. `docs/30-quality/repo-quality-gate.md`
4. `docs/40-review/requester-workflow-hardening-todo.md`
5. This `AGENTS.md`

The central product invariant is:

```text
A workflow transition is successful only when the API transaction persists the new state and writes the audit event.
```

Current implementation scope is requester submission plus reviewer decisions: stable seeded demo sign-in, new requester creation, study read, draft create/save, submit, requester audit timeline, requester approved/rejected final-state visibility, reviewer inbox/detail reads, start review, approve request, reject request with reason, approve/reject idempotency, and reviewer audit timeline reads. Withdrawal, revocation, admin consoles, uploads, notifications, tenants/orgs, and generic workflow tooling remain out of scope until explicitly requested.

## Project Shape

```text
apps/web      Next.js App Router, UI, forms, tRPC client
apps/api      Fastify, tRPC server, Better Auth, Drizzle/Postgres, commands
packages/core Minimal Result/AppError/fromZod/assertNever helpers
packages/workflow Pure workflow statuses, events, and transition-table helpers
```

Keep ownership strict:

- `apps/api` owns auth/session resolution, Drizzle, command services, authorization, idempotency, audit writes, and workflow mutations.
- `apps/web` must not import Drizzle, auth tables, API command services, or database modules.
- `packages/workflow` must not import React, Next.js, tRPC, Drizzle, Better Auth, or web/API app code.
- `packages/core` must remain domain-free and tiny.

## Implementation Rules

- Do not fake authentication or add a role switcher.
- Keep local human-test auth deterministic: `db:seed` must provide requester/reviewer/admin demo users through the real Better Auth credential path.
- Keep local preview state deterministic: `pnpm mobile:preview` and `pnpm test:e2e` must reset the local `localhost:55433/accessflow` preview database before seeding.
- Do not add UI that claims a workflow action succeeded before the API persists it.
- Keep command services outside tRPC routers. Routers are adapters, not the business logic layer.
- Use the typed workflow transition table as the canonical v1 transition model. Reconsider XState only if workflow behavior becomes complex enough to earn it.
- Persist canonical status values and audit events. Do not persist full state-machine snapshots in v1.
- Keep forms plain React/HTML in v1. Conform is deferred.
- Do not claim HIPAA, GDPR, clinical-grade, or medical-device compliance.
- Do not add document uploads, notifications, queues, analytics, tenants/orgs, or a generic workflow builder unless explicitly requested.
- Do not start withdrawal, revocation, admin, upload, notification, tenant/org, or generic workflow-builder flows while the current reviewer decision slice is still under review.

## Backend And Persistence

Use `apps/api` for all backend work.

Expected command path:

```text
tRPC mutation
  -> authenticated actor
  -> authorization
  -> command service
  -> workflow transition-table check
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

For any user-visible web change, also run a real rendered smoke check before reporting completion. Use at least one of:

- Browser tool against `pnpm mobile:preview`
- Playwright/browser automation at desktop and mobile widths
- iOS Simulator only when explicitly validating Safari/iPhone behavior

The smoke check should cover the affected workflow, not only page load. For the requester path, verify seeded sign-in, new requester creation, seeded study visibility, draft creation, submission, persisted audit event rendering after sign-out/sign-in, approved/rejected final-state visibility after reviewer decisions, no raw JSON errors, and no horizontal overflow on a phone-width viewport.

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

For a clean human-test baseline:

```text
pnpm demo:reset
pnpm mobile:preview
```

`demo:reset` is intentionally destructive but guarded: it may only reset the local preview database at `localhost:55433/accessflow`. Do not weaken that safety check.

Report clearly if Docker/Postgres is unavailable.

API tests use an isolated `accessflow_test` database by default. Do not bypass `pnpm --filter @accessflow/api test` with direct Vitest commands unless you intentionally provide a safe test `DATABASE_URL`.

## Git And Coordination

- The worktree may already contain changes from another Codex thread or the user. Never revert changes you did not make.
- Keep edits scoped to the requested pass.
- When working through the requester hardening backlog, handle one todo item per pass unless the user explicitly expands scope.
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
