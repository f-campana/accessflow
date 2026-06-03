# Post-Hardening Review Checkpoint

Date: 2026-06-04

Scope: review the current requester baseline before starting reviewer workflow work. This checkpoint was reviewed against the product brief, quality gate, requester hardening backlog, and the desktop engineering references for backend, data structures, React, TypeScript, and JavaScript.

## Executive Judgment

The requester baseline is in a good state for the next product slice. The API command path now has real session checks, role/ownership authorization, server validation, Drizzle transactions, idempotency replay behavior, persisted state, and audit writes. The web path no longer pretends local UI actions are durable; the requester flow renders state from the API and has mobile e2e coverage.

Recommendation: Go for reviewer read workflow, but do not start reviewer mutations until the reviewer authorization/projection model is explicit and covered by tests.

## Findings

### 1. Update docs that still describe XState as the active workflow engine

Issue: `docs/00-product/accessflow-workflow-brief.md` and `AGENTS.md` still describe the command path as using an XState transition check. The implementation intentionally simplified this in requester hardening item 23: `@accessflow/workflow` now uses one typed transition table as the canonical source.

Why it matters: future agents will read those docs first. If they follow the stale wording, they may reintroduce XState or design reviewer workflow around a dependency that no longer exists.

Fix direction: update the product brief and `AGENTS.md` to say the current implementation uses a typed transition table. Keep XState as a deferred option only if workflow behavior becomes complex enough to earn it.

Priority: P2, before reviewer implementation.

### 2. Keep reviewer reads separate from requester reads

Issue: the requester query is correctly scoped to the authenticated requester. Reviewer workflow should not widen `myStudyAccess` with role branches or shared conditionals.

Why it matters: reviewer and requester projections have different authorization rules and different data needs. Mixing them would make the access rules harder to audit and would invite role-specific branches in already busy code.

Fix direction: add a separate reviewer read projection, for example `reviewerInbox` and `reviewerStudyAccessDetail`, with reviewer-only authorization tests. Keep requester ownership checks untouched.

Priority: P2, required for reviewer read workflow.

### 3. Query/load failures can still expose raw technical messages in the requester UI

Issue: auth endpoint errors and command errors now have safe display copy, but workspace/query failures in the requester controller still fall back to `caught.message`.

Why it matters: this can surface transport or implementation-shaped messages to the UI. The earlier hardening fixed raw JSON auth errors; the same principle should apply to non-command query failures.

Fix direction: add a small query/load error display mapper and tests for `loadWorkspace` and `selectStudy` failure paths. The UI should show plain copy such as "Workspace could not load" or "Request could not load" while preserving detailed context for logs.

Priority: P2/P3. Not a blocker for read-only reviewer work, but should be handled before broad demo polish.

### 4. Unexpected command logging has no request, actor, or command context

Issue: unexpected command failures are reported through a default `console.error("Unexpected command failure", error)` path without structured context.

Why it matters: backend guidance favors correlation IDs and structured logging. Error payloads should stay safe and user-facing, but logs/monitoring should carry enough context to diagnose failures.

Fix direction: pass a contextual `reportUnexpectedError` dependency from the tRPC/router layer with safe fields such as request ID, command name, actor ID, and actor role. Do not put those details into user-facing `AppError` messages.

Priority: P3. Recommended before adding reviewer mutations.

### 5. Audit and idempotency records duplicate more command detail than strictly necessary

Issue: submit audit metadata stores the raw idempotency key, and the idempotency row stores the full replay response including draft fields.

Why it matters: this is acceptable for the current synthetic workflow, but privacy-sensitive systems should minimize duplicated sensitive content. Audit logs and idempotency tables often live longer and are read by different operational tools.

Fix direction: for a future production-grade version, store a key hash/reference in audit metadata and consider narrowing idempotency replay payloads to stable result references plus safe response fields.

Priority: P3. Not a blocker for the case-study requester baseline.

### 6. Requester controller is still large enough to protect carefully

Issue: `requester-workspace-controller.ts` is about 620 lines. It is below the hard 1,000-line smell threshold and has been split from panels, but it now owns session bootstrap, study loading, draft form state, notices, command orchestration, stale-response guards, and submit idempotency state.

Why it matters: extending this file for reviewer workflow would create avoidable branching and role-mode complexity.

Fix direction: do not add reviewer behavior here. Build reviewer workflow with its own controller/query model. If requester work resumes, extract only behavior that is naturally shared, such as safe load-error copy or session helpers.

Priority: P3 guardrail.

## What Is Strong

- Command services are outside tRPC routers.
- The web app imports only the API router type, not DB or command modules.
- `packages/workflow` is pure and has no React, Next.js, tRPC, Drizzle, or auth dependency.
- `submitRequest` persists status, audit event, and idempotency completion in one transaction.
- Database constraints enforce important request/draft status invariants.
- Tests cover idempotency replay, idempotency conflict, concurrent submit behavior, schema invariants, router auth, and mobile requester e2e.

## Go / No-Go

Go: start the reviewer read workflow after fixing the XState documentation drift or including that doc fix as the first step of the reviewer pass.

No-Go: do not start reviewer approve/reject mutations until reviewer authorization, command errors, transition events, audit writes, and idempotency behavior are designed and tested with the same rigor as requester submit.

## Next Recommended Pass

Name: reviewer-read-workflow-start.

Scope: update workflow docs away from XState wording, add reviewer read authorization/projections, add tRPC queries for reviewer inbox/detail, and render a minimal reviewer inbox/detail UI from persisted submitted requests.

Non-goals: no approve/reject mutations, no admin console, no documents, no notifications, no organization/tenant model, no generic workflow engine.
