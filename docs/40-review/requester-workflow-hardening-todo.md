# Requester Workflow Hardening Todo

This backlog turns the May 2026 audit into one-pass-at-a-time work. Process it from top to bottom unless a later item becomes urgent. Each item should be handled in its own pass so the repo stays understandable and progress stays visible.

When a pass completes, update the relevant checkbox and add a short note with the commit hash or verification summary.

## Working Rule

Do one thing at most per implementation pass:

1. Pick the next unchecked item.
2. Fix only that issue and the tests/docs needed to prove it.
3. Run the relevant quality gate from `docs/30-quality/repo-quality-gate.md`.
4. Report what changed, what was verified, and what remains.
5. Commit or push only when explicitly asked.

## Ordered Backlog

### 1. [x] Enforce One Active Request Per Requester And Study

Issue: `createDraft` can create multiple active requests for the same requester/study. The UI hides this in normal use, but the API and database allow it.

Why it matters: AccessFlow is about truthful workflow state. If two active rows exist, reads can show the newest row and hide an older submitted request or audit timeline.

Fix direction: Define the cardinality rule. For v1, enforce one active request per requester/study with a database constraint or transaction-safe conflict path. Make `createDraft` return the existing draft or a typed `Conflict`, depending on the chosen product behavior.

Done when:

- duplicate active rows cannot be created through direct command/API calls
- sequential duplicate-create and concurrent duplicate-create tests exist
- `getRequesterStudyAccess` no longer relies on "latest row wins" for active workflow truth

Completed 2026-05-29: added an active requester/study partial unique index, made repeated draft creation return the existing active draft, made submitted active requests return a typed conflict, and added sequential, concurrent, submitted-conflict, and direct database rejection tests. Verification: `pnpm --filter @accessflow/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @accessflow/api db:migrate`, and `git diff --check`.

### 2. [x] Add Database Invariants For Workflow State

Issue: the database accepts impossible durable states, such as a submitted request with no `submittedAt`, a submitted request with no `requestedRole`, or a draft with decision metadata.

Why it matters: command code is important, but durable workflow truth should be protected at the persistence boundary too. Bad rows can come from bugs, migrations, scripts, or future admin tooling.

Fix direction: Add Postgres checks/enums for status-dependent fields and requested roles. Keep constraints simple and aligned with the states implemented today.

Done when:

- submitted-or-later states require submission fields
- draft state forbids decision metadata
- requested role is constrained to the allowed vocabulary where persisted
- tests prove invalid durable rows are rejected

Completed 2026-05-29: added persisted requested-role checks for requests and drafts, added request status/field checks for draft versus non-draft workflow rows, moved requested-role vocabulary into `@accessflow/workflow`, generated migration `0002_mean_kulan_gath.sql`, and added direct database invariant tests. Verification: `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/api db:migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

### 3. [x] Normalize Unexpected Command Failures Into Typed Errors

Issue: command services return typed `Result<AppError>` for expected failures, but unexpected database/runtime failures can still throw through tRPC.

Why it matters: the project is explicitly practicing typed command boundaries. A thrown unknown error can leak transport-shaped behavior to the UI and bypass the app error contract.

Fix direction: Centralize command execution. Convert unknown failures to a safe `Unexpected` app error at the command boundary while logging enough detail server-side for debugging.

Done when:

- `createDraft`, `saveDraft`, and `submitRequest` all preserve the typed result contract for expected and unexpected failures
- unknown command failures are logged or observable server-side
- tests cover at least one simulated unexpected failure

Completed 2026-05-29: added a shared command rollback normalizer that reports unexpected failures server-side and returns a safe `Unexpected` app error, wrapped `createDraft`, `saveDraft`, and `submitRequest` consistently, and added simulated dependency-failure tests for all three commands. Verification: `pnpm --filter @accessflow/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

### 4. [x] Catch Web Command And Reload Failures

Issue: requester UI command handlers use `try/finally` without `catch`. A network error, tRPC error, expired session, or post-command reload failure can leave the UI stale with no clear message.

Why it matters: the user needs to know whether a workflow command failed, succeeded, or may have succeeded but failed to reload. Silent failure encourages duplicate clicks and breaks trust.

Fix direction: Catch mutation and reload failures separately. Show safe messages. If reload fails after a command may have committed, offer a retry reload path instead of implying the command did not happen.

Done when:

- `createDraft`, `saveDraft`, and `submitRequest` render friendly command errors for thrown failures
- mutation-success/query-failure is handled explicitly
- browser or component tests cover the failure display path

Completed 2026-05-29: added safe requester command error helpers, caught thrown create/save/submit command failures, split post-command refresh failures from mutation failures, and added a retry refresh action for the ambiguous "command committed but reload failed" path. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, Browser-rendered command failure path with API intentionally stopped, and `git diff --check`.

### 5. [ ] Stabilize Submit Idempotency Key Lifecycle

Issue: the web UI creates a new submit idempotency key on every click.

Why it matters: if the API commits but the response or reload fails, retrying with a new key cannot replay the original result. That weakens the exact idempotency guarantee this project is meant to demonstrate.

Fix direction: Create one submit idempotency key per draft submit attempt. Keep it until a persisted reload confirms `submitted`, then clear it.

Done when:

- retrying the same submit attempt reuses the same key
- the key is cleared only after persisted submitted state is observed
- tests cover retry after an ambiguous submit result

### 6. [ ] Prove Real Cookie-To-tRPC Auth

Issue: Better Auth cookies and tRPC authorization are tested separately, but not together through `/trpc`.

Why it matters: the real boundary is "browser has a session cookie, tRPC resolves the actor, protected procedures enforce auth." Injecting actors directly into `createCaller` does not prove that path.

Fix direction: Add server-level tests that sign up through Better Auth, forward the session cookie to `/trpc`, and call `me`, `studies`, and one requester mutation.

Done when:

- `/trpc/me` returns the real cookie-backed actor
- protected `/trpc` calls reject without cookies
- at least one requester mutation works through real cookies

### 7. [ ] Decompose `requester-workspace.tsx`

Issue: `requester-workspace.tsx` owns auth, loading, study selection, command calls, form state, errors, and timeline rendering in one component.

Why it matters: the file is already hard to reason about. Race fixes, accessibility, retries, and future reviewer/admin work will get riskier if all behavior stays in one component.

Fix direction: Keep one orchestrator, but extract focused pieces such as `AuthPanel`, `StudyPanel`, `RequestForm`, `CommandError`, `AuditTimeline`, and a reducer or hook for requester workflow state.

Done when:

- the top-level component reads as orchestration, not implementation detail
- command state transitions are easier to test
- no behavior changes except those covered by tests

### 8. [ ] Make Async UI State Coherent

Issue: workspace loading, selected study, access state, and draft form state can be updated by overlapping async calls. Older responses can overwrite newer selections.

Why it matters: React effects and async closures are correctness boundaries. The UI should never show one study while form/access state belongs to another.

Fix direction: Pass study ids explicitly into loaders, guard stale responses with a request sequence or abort signal, and add React hooks linting.

Done when:

- stale responses cannot overwrite current selected study state
- hook dependency rules are enforced
- tests cover at least one stale-response scenario or the logic is isolated enough to prove

### 9. [ ] Protect Draft Edits During Save And Submit

Issue: fields remain editable while save/submit commands are in flight. A reload can then overwrite edits typed during the command.

Why it matters: users should not lose input because the app accepts edits while replacing local state from the server.

Fix direction: Disable draft fields during save/submit, or introduce a deliberate dirty-buffer reconciliation strategy. For v1, disabling during command execution is simpler.

Done when:

- draft fields cannot be edited during save/submit
- the UI clearly shows the pending state
- no unsaved in-flight edits are silently overwritten

### 10. [ ] Remove Type Widening And Client Casts At The Web/API Boundary

Issue: several DTO fields are typed as generic `string`, and the web client casts tRPC mutation responses to local command response types.

Why it matters: this bypasses some of the TypeScript safety the project is meant to practice. If API output changes, the client may keep compiling because casts hide drift.

Fix direction: Reuse exported app error and workflow types, infer router outputs where possible, and remove `as CommandResponse<...>` assertions.

Done when:

- requester DTO statuses/events use workflow unions where practical
- web command response handling is inferred rather than locally asserted
- local duplicate `AppError`/command result definitions are removed or justified

### 11. [ ] Make Browser Workflow Coverage Executable

Issue: the quality gate requires rendered browser validation, but the repo does not yet have an executable Playwright/browser workflow test for the requester path.

Why it matters: the iPhone review already caught issues that lint, typecheck, and unit tests would not catch. The gate should be repeatable, not purely manual.

Fix direction: Add browser coverage for sign-up, seeded study visibility, draft creation, invalid submit, valid submit, refresh persistence, audit timeline, console errors, and mobile overflow.

Done when:

- the requester happy path and one failure path are executable from the repo
- mobile-width overflow is checked
- the root verification story includes the browser gate or clearly names when to run it

### 12. [ ] Harden `mobile:preview` Developer Experience

Issue: the preview script assumes `docker-compose`, inherits any shell `DATABASE_URL`, has limited readiness checks, and prints the phone URL before proving both servers are ready.

Why it matters: local-device testing should be trivial and safe. A preview helper should not mutate a non-local database or leave the user guessing whether the app is ready.

Fix direction: Force or validate the local preview database URL, support both Docker Compose commands, wait for Postgres/API/web readiness, check occupied ports, and include the script in linting.

Done when:

- preview refuses unsafe database URLs
- preview works with available Docker Compose syntax
- preview prints the LAN URL only after API and web are reachable
- script errors are actionable

### 13. [ ] Improve Field Accessibility And Safe Error Copy

Issue: field errors are visual only, and some auth/error fallbacks can still render implementation-shaped text.

Why it matters: validation feedback should be accessible to assistive technology and safe for users. Raw JSON or provider-shaped payloads damages polish and trust.

Fix direction: Add `aria-invalid`, `aria-describedby`, stable field error ids, native field constraints where they mirror server validation, and safe error-code-to-message mapping.

Done when:

- field errors are programmatically associated with controls
- unknown auth/server payloads render a generic friendly message
- tests cover malformed/unknown auth error payloads

### 14. [ ] Clarify Current Scope Versus Roadmap In Docs

Issue: product docs mention reviewer/admin commands as part of the target workflow, while the current code intentionally stops at the requester slice.

Why it matters: future agents should not confuse staged roadmap with implemented scope or rush into reviewer/admin before requester reliability is done.

Fix direction: Label unimplemented reviewer/admin flows as roadmap and keep the README current with actual automated coverage.

Done when:

- docs clearly separate current implementation, next hardening work, and later product roadmap
- no doc implies reviewer/admin is implemented before it exists
- this todo remains the source of truth for the immediate hardening sequence

## Do Not Start Yet

Do not start these until the requester hardening backlog above is substantially complete:

- reviewer/admin workflow UI
- reviewer/admin mutations
- organizations or tenants
- uploads/documents
- notifications or queues
- analytics/vendor telemetry
- generic workflow builder
- generic form library extraction
