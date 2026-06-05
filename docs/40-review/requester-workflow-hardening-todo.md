# Requester Workflow Hardening Todo

This backlog turns the May 2026 audit into one-pass-at-a-time work. Process it from top to bottom unless a later item becomes urgent. Each item should be handled in its own pass so the repo stays understandable and progress stays visible.

When a pass completes, update the relevant checkbox and add a short note with the commit hash or verification summary. Also add a short `Plain summary` and `Lesson` so the reasoning stays easy to revisit later.

## Working Rule

Do one thing at most per implementation pass:

1. Pick the next unchecked item.
2. Fix only that issue and the tests/docs needed to prove it.
3. Run the relevant quality gate from `docs/30-quality/repo-quality-gate.md`.
4. Report what changed, what was verified, and what remains.
5. Commit or push only when explicitly asked.

For completed items, use this compact close-out shape:

- `Completed`: what changed and what was verified
- `Plain summary`: the issue and resolution in simple terms
- `Lesson`: the principle to remember for later passes

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

Plain summary: one requester can no longer create multiple active requests for the same study. The API now returns the existing draft or a conflict instead of silently creating duplicate workflow rows.

Lesson: UI rules are not enough for workflow truth. Important cardinality rules need API and database enforcement.

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

Plain summary: the database now rejects impossible workflow states, like submitted requests without submission fields or draft rows with decision metadata.

Lesson: command code should prevent invalid states, but the database should still guard durable truth against bugs, scripts, and future tools.

### 3. [x] Normalize Unexpected Command Failures Into Typed Errors

Issue: command services return typed `Result<AppError>` for expected failures, but unexpected database/runtime failures can still throw through tRPC.

Why it matters: the project is explicitly practicing typed command boundaries. A thrown unknown error can leak transport-shaped behavior to the UI and bypass the app error contract.

Fix direction: Centralize command execution. Convert unknown failures to a safe `Unexpected` app error at the command boundary while logging enough detail server-side for debugging.

Done when:

- `createDraft`, `saveDraft`, and `submitRequest` all preserve the typed result contract for expected and unexpected failures
- unknown command failures are logged or observable server-side
- tests cover at least one simulated unexpected failure

Completed 2026-05-29: added a shared command rollback normalizer that reports unexpected failures server-side and returns a safe `Unexpected` app error, wrapped `createDraft`, `saveDraft`, and `submitRequest` consistently, and added simulated dependency-failure tests for all three commands. Verification: `pnpm --filter @accessflow/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: unexpected command failures now become safe typed errors instead of leaking thrown database/runtime failures through tRPC.

Lesson: user-facing errors should be stable and safe; rich debugging context belongs at the logging/monitoring boundary.

### 4. [x] Catch Web Command And Reload Failures

Issue: requester UI command handlers use `try/finally` without `catch`. A network error, tRPC error, expired session, or post-command reload failure can leave the UI stale with no clear message.

Why it matters: the user needs to know whether a workflow command failed, succeeded, or may have succeeded but failed to reload. Silent failure encourages duplicate clicks and breaks trust.

Fix direction: Catch mutation and reload failures separately. Show safe messages. If reload fails after a command may have committed, offer a retry reload path instead of implying the command did not happen.

Done when:

- `createDraft`, `saveDraft`, and `submitRequest` render friendly command errors for thrown failures
- mutation-success/query-failure is handled explicitly
- browser or component tests cover the failure display path

Completed 2026-05-29: added safe requester command error helpers, caught thrown create/save/submit command failures, split post-command refresh failures from mutation failures, and added a retry refresh action for the ambiguous "command committed but reload failed" path. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, Browser-rendered command failure path with API intentionally stopped, and `git diff --check`.

Plain summary: the UI now distinguishes "the command was not confirmed" from "the command may have committed but reload failed." In the second case, it asks the user to retry refresh instead of encouraging another workflow command.

Lesson: after an ambiguous command result, the safest next action is often to reload server truth, not to repeat the mutation.

### 5. [x] Stabilize Submit Idempotency Key Lifecycle

Issue: the web UI creates a new submit idempotency key on every click.

Why it matters: if the API commits but the response or reload fails, retrying with a new key cannot replay the original result. That weakens the exact idempotency guarantee this project is meant to demonstrate.

Fix direction: Create one submit idempotency key per draft submit attempt. Keep it until a persisted reload confirms `submitted`, then clear it.

Done when:

- retrying the same submit attempt reuses the same key
- the key is cleared only after persisted submitted state is observed
- tests cover retry after an ambiguous submit result

Completed 2026-05-29: added a requester submit-attempt helper, reused the same idempotency key for repeated submits of the same draft, kept the key through ambiguous non-confirmed reload states, cleared it only after the refreshed state confirms the same draft is submitted, and made submit success notices require that persisted confirmation. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and Browser-rendered requester draft-to-submitted flow with no console warnings/errors.

Plain summary: retrying submit for the same draft now reuses the same idempotency key until the UI confirms that draft is durably submitted.

Lesson: idempotency is a client/server contract. The backend can replay safely only if the frontend preserves the same key across uncertain retries.

### 6. [x] Prove Real Cookie-To-tRPC Auth

Issue: Better Auth cookies and tRPC authorization are tested separately, but not together through `/trpc`.

Why it matters: the real boundary is "browser has a session cookie, tRPC resolves the actor, protected procedures enforce auth." Injecting actors directly into `createCaller` does not prove that path.

Fix direction: Add server-level tests that sign up through Better Auth, forward the session cookie to `/trpc`, and call `me`, `studies`, and one requester mutation.

Done when:

- `/trpc/me` returns the real cookie-backed actor
- protected `/trpc` calls reject without cookies
- at least one requester mutation works through real cookies

Completed 2026-05-29: added Fastify `/trpc` HTTP tests that sign up through Better Auth, forward the returned session cookie, resolve `/trpc/me` from that cookie, reject protected procedures without cookies, list studies with the cookie, and create a draft through the cookie-backed `createDraft` mutation. Verification: `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/api lint`, `pnpm --filter @accessflow/api typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: the API now proves the real browser-style session path works. A cookie from Better Auth reaches `/trpc`, resolves the actor, authorizes protected procedures, and can run a requester mutation.

Lesson: injected router callers are useful, but they do not prove the production boundary. Auth-sensitive behavior needs at least one HTTP-level test that uses real cookies.

### 7. [x] Decompose `requester-workspace.tsx`

Issue: `requester-workspace.tsx` owns auth, loading, study selection, command calls, form state, errors, and timeline rendering in one component.

Why it matters: the file is already hard to reason about. Race fixes, accessibility, retries, and future reviewer/admin work will get riskier if all behavior stays in one component.

Fix direction: Keep one orchestrator, but extract focused pieces such as `AuthPanel`, `StudyPanel`, `RequestForm`, `CommandError`, `AuditTimeline`, and a reducer or hook for requester workflow state.

Done when:

- the top-level component reads as orchestration, not implementation detail
- command state transitions are easier to test
- no behavior changes except those covered by tests

Completed 2026-05-29: extracted requester workspace types and read-model helpers into `requester-workspace-model.ts`, moved the header/auth/study/request/timeline markup into focused panel components in `requester-workspace-panels.tsx`, and kept `RequesterWorkspace` responsible for orchestration, auth, loading, command calls, and state transitions. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and Browser-rendered LAN preview smoke on `http://192.168.1.98:3000` with no console warnings/errors.

Plain summary: the large requester component no longer mixes every screen section with every command handler. The UI is split into small panels, while the parent keeps the workflow state and server command logic in one place.

Lesson: when a component is doing too much, extract presentation first and leave behavior in place. That makes the next correctness pass easier without changing the product behavior at the same time.

### 8. [x] Make Async UI State Coherent

Issue: workspace loading, selected study, access state, and draft form state can be updated by overlapping async calls. Older responses can overwrite newer selections.

Why it matters: React effects and async closures are correctness boundaries. The UI should never show one study while form/access state belongs to another.

Fix direction: Pass study ids explicitly into loaders, guard stale responses with a request sequence or abort signal, and add React hooks linting.

Done when:

- stale responses cannot overwrite current selected study state
- hook dependency rules are enforced
- tests cover at least one stale-response scenario or the logic is isolated enough to prove

Completed 2026-05-29: added a small requester async request guard, used it to make workspace loads, study selection, and command refreshes latest-request-wins, and added React hook linting for `rules-of-hooks` plus `exhaustive-deps`. Stale access responses now return without applying `selectedStudyId`, access, or draft form state after a newer study request takes over. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and Browser-rendered LAN preview smoke on `http://192.168.1.98:3000` with no console warnings/errors.

Plain summary: old async responses can no longer win the race after the user moves to a newer study/request state. The latest load or refresh is the only one allowed to write the current access data and draft form.

Lesson: React async code needs an ownership check before writing state. If multiple requests can be in flight, each response should prove it still belongs to the current UI before mutating shared state.

### 9. [x] Protect Draft Edits During Save And Submit

Issue: fields remain editable while save/submit commands are in flight. A reload can then overwrite edits typed during the command.

Why it matters: users should not lose input because the app accepts edits while replacing local state from the server.

Fix direction: Disable draft fields during save/submit, or introduce a deliberate dirty-buffer reconciliation strategy. For v1, disabling during command execution is simpler.

Done when:

- draft fields cannot be edited during save/submit
- the UI clearly shows the pending state
- no unsaved in-flight edits are silently overwritten

Completed 2026-05-29: added a requester draft edit-lock helper, disabled draft form controls while `saveDraft` or `submitRequest` is in flight, marked the request form `aria-busy` during those draft commands, and made late field-change events no-op while the command is pending. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and Browser-rendered LAN preview smoke on `http://192.168.1.98:3000` with no console warnings/errors.

Plain summary: users can no longer keep editing a draft while save or submit is running. That prevents local typing from being silently replaced by the server refresh that follows the command.

Lesson: during a mutation that reloads server truth, either lock the editable fields or build an explicit reconciliation strategy. For v1, locking is simpler and more honest.

### 10. [x] Remove Type Widening And Client Casts At The Web/API Boundary

Issue: several DTO fields are typed as generic `string`, and the web client casts tRPC mutation responses to local command response types.

Why it matters: this bypasses some of the TypeScript safety the project is meant to practice. If API output changes, the client may keep compiling because casts hide drift.

Fix direction: Reuse exported app error and workflow types, infer router outputs where possible, and remove `as CommandResponse<...>` assertions.

Done when:

- requester DTO statuses/events use workflow unions where practical
- web command response handling is inferred rather than locally asserted
- local duplicate `AppError`/command result definitions are removed or justified

Completed 2026-05-29: narrowed requester access query types to workflow unions for request status, audit event type, transition statuses, and requested role; parsed checked database `requestedRole` text before exposing it through the API query contract; made the web requester model derive actor/study/access shapes from the tRPC client; reused shared `AppError`; and removed the web-side `as CommandResponse<...>` mutation casts. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and Browser-rendered LAN preview smoke on `http://192.168.1.98:3000` with no console warnings/errors.

Plain summary: the web app now trusts the API contract instead of forcing command responses into a locally duplicated shape. If a mutation output or workflow status changes, TypeScript has a better chance of catching the mismatch.

Lesson: typed APIs lose value when the client casts responses back into the shape it hoped to receive. Prefer shared domain types and inferred router outputs; validate or parse raw database text before it crosses the API boundary.

### 11. [x] Make Browser Workflow Coverage Executable

Issue: the quality gate requires rendered browser validation, but the repo does not yet have an executable Playwright/browser workflow test for the requester path.

Why it matters: the iPhone review already caught issues that lint, typecheck, and unit tests would not catch. The gate should be repeatable, not purely manual.

Fix direction: Add browser coverage for sign-up, seeded study visibility, draft creation, invalid submit, valid submit, refresh persistence, audit timeline, console errors, and mobile overflow.

Done when:

- the requester happy path and one failure path are executable from the repo
- mobile-width overflow is checked
- the root verification story includes the browser gate or clearly names when to run it

Completed 2026-05-29: added root `pnpm test:e2e`, Playwright mobile-width Chromium config, API/web server setup scripts that start Postgres, migrate, seed, build, and serve the app, and an executable requester workflow spec. The e2e spec signs up through the real auth path, verifies seeded study visibility, creates a draft, checks empty-submit validation, submits a valid request, reloads to prove persisted state, verifies the audit timeline, captures page errors/console warnings, and asserts no horizontal overflow. Verification: `pnpm test:e2e`, `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: the requester workflow now has a repeatable browser test instead of relying on manual phone screenshots. The test drives the real local app at phone width and checks the durable workflow path end to end.

Lesson: if a quality gate depends on rendered browser behavior, make it executable. Manual smoke checks are still useful, but the common path should be one command.

### 12. [x] Harden `mobile:preview` Developer Experience

Issue: the preview script assumes `docker-compose`, inherits any shell `DATABASE_URL`, has limited readiness checks, and prints the phone URL before proving both servers are ready.

Why it matters: local-device testing should be trivial and safe. A preview helper should not mutate a non-local database or leave the user guessing whether the app is ready.

Fix direction: Force or validate the local preview database URL, support both Docker Compose commands, wait for Postgres/API/web readiness, check occupied ports, and include the script in linting.

Done when:

- preview refuses unsafe database URLs
- preview works with available Docker Compose syntax
- preview prints the LAN URL only after API and web are reachable
- script errors are actionable

Completed 2026-05-29: hardened `pnpm mobile:preview` so it validates a local-only preview database URL, ignores unsafe inherited `DATABASE_URL` values, supports either `docker compose` or `docker-compose`, checks ports `3000` and `4000` before starting, waits for Postgres health, API health, local web reachability, and LAN web reachability, and prints the phone URL only after the preview is ready. Root lint now includes scripts and e2e files. Verification: unsafe `ACCESSFLOW_PREVIEW_DATABASE_URL` rejected before startup, `pnpm mobile:preview` reached ready state, Browser opened the printed LAN URL with no console warnings/errors and verified sign-out interaction, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `git diff --check`.

Plain summary: local phone testing is now safer and less guessy. The preview command refuses suspicious database targets, checks for busy ports, waits for the real services to be reachable, and only then tells the user what URL to open.

Lesson: developer-experience scripts are production-adjacent tools. They should protect data, wait for truth, and fail with useful messages instead of relying on the user to infer what went wrong.

### 13. [x] Improve Field Accessibility And Safe Error Copy

Issue: field errors are visual only, and some auth/error fallbacks can still render implementation-shaped text.

Why it matters: validation feedback should be accessible to assistive technology and safe for users. Raw JSON or provider-shaped payloads damages polish and trust.

Fix direction: Add `aria-invalid`, `aria-describedby`, stable field error ids, native field constraints where they mirror server validation, and safe error-code-to-message mapping.

Done when:

- field errors are programmatically associated with controls
- unknown auth/server payloads render a generic friendly message
- tests cover malformed/unknown auth error payloads

Completed 2026-05-29: added stable draft field ids, field error ids, `aria-invalid`, `aria-describedby`, submit-required attributes, and matching max-length constraints for requester form controls; mapped command error codes to friendly user-facing titles; stopped auth error handling from echoing unknown JSON, malformed HTML, or raw provider-shaped caught errors; and changed requested-role validation copy from raw enum wording to `Requested role is required`. Verification: auth error copy unit tests, requester field accessibility unit tests, requester error title tests, `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm test:e2e`, Browser-rendered empty-submit check with no raw validation code/enum text and no console warnings/errors, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: validation errors are now connected to the form fields that caused them, and users no longer see raw implementation labels like `ValidationError` or Zod enum wording. Unknown auth/provider payloads now collapse to safe friendly copy.

Lesson: error handling is part of the product surface. Keep rich details for logs and tests; show users stable, understandable messages tied to the controls they can fix.

### 14. [x] Clarify Current Scope Versus Roadmap In Docs

Issue: product docs mention reviewer/admin commands as part of the target workflow, while the current code intentionally stops at the requester slice.

Why it matters: future agents should not confuse staged roadmap with implemented scope or rush into reviewer/admin before requester reliability is done.

Fix direction: Label unimplemented reviewer/admin flows as roadmap and keep the README current with actual automated coverage.

Done when:

- docs clearly separate current implementation, next hardening work, and later product roadmap
- no doc implies reviewer/admin is implemented before it exists
- this todo remains the source of truth for the immediate hardening sequence

Completed 2026-05-29: updated the README, product brief, and agent guide to state that the current implementation is requester-only: sign-up/sign-in, study read, draft create/save, submit, and persisted audit timeline. The product brief now labels reviewer/admin roles, commands, UI, authorization, idempotency, and tests as roadmap. README and AGENTS now say this backlog is the source of truth for immediate next work. Verification: markdown scope scan for reviewer/admin wording and `git diff --check`.

Plain summary: the docs no longer read like reviewer/admin flows are already implemented. They now separate what exists today, what we should harden next, and what belongs to the later product roadmap.

Lesson: roadmap docs are useful only when they do not blur into implementation status. Future agents need one immediate source of truth, otherwise they will start the wrong work.

## Post-Hardening Review Backlog

This backlog comes from the 2026-06-03 multi-agent review against the local backend, data-structures, React, TypeScript, and JavaScript guidance docs. One agent explicitly used the `thermo-nuclear-code-quality-review` skill.

Process these items one at a time, in order, unless a later item becomes urgent. After each pass, keep using the close-out shape from the working rule: `Completed`, `Plain summary`, and `Lesson`.

### 15. [x] Tie Draft Ownership To The Request Requester

Issue: `study_access_request_drafts.request_id` and `owner_id` are independent foreign keys. Commands authorize against `draft.ownerId`, but the database does not prove that the draft owner is the same user as the parent request requester.

Why it matters: a bad migration, script, or future admin tool could create a draft owned by user B for user A's request. User B could then save or submit a request that belongs to user A.

Fix direction: enforce that `(draft.request_id, draft.owner_id)` matches `(request.id, request.requester_id)` with a composite foreign key or equivalent database constraint. Also select the parent request requester in save/submit command reads and assert `requesterId === actor.id`.

Done when:

- invalid request/draft ownership pairs are rejected at the database boundary
- save and submit authorize against the parent request requester, not only the draft owner
- direct schema-invariant tests cover mismatched draft ownership

Completed 2026-06-03: added a composite request/requester unique index, added a draft `(request_id, owner_id)` foreign key to the parent request `(id, requester_id)`, generated migration `0003_flimsy_pyro.sql`, selected parent `requesterId` in save/submit draft reads, and made save/submit reject rows whose parent requester or draft owner does not match the actor. Added a direct database invariant test proving a draft owned by another user cannot attach to the request. Verification: `pnpm --filter @accessflow/api test`.

Plain summary: a draft can no longer claim one owner while pointing at another user's request. The database now rejects that impossible relationship, and the command code checks the parent request requester before saving or submitting.

Lesson: authorization should follow the durable parent record, not only a convenient child row. If a child row says who owns it, the database should prove that ownership matches the parent workflow object.

### 16. [x] Preserve The Typed Command Error Contract Through tRPC

Issue: tRPC procedures use `.input(...)` before calling command services. Bad input can fail in the tRPC adapter with a transport `BAD_REQUEST` instead of returning the command shape `{ ok: false, error: { code: "ValidationError" } }`.

Why it matters: AccessFlow is practicing typed command boundaries. If expected validation failures sometimes return command errors and sometimes throw transport errors, the web UI has two error contracts to understand.

Fix direction: either add a command-procedure adapter that passes unknown input into command services and always returns typed command responses for expected failures, or explicitly document and test the intended split between transport validation and command validation.

Done when:

- malformed command input through `/trpc` has a deliberate, tested response shape
- the web UI knows whether validation errors come from command responses, transport errors, or both
- docs explain the chosen boundary in simple terms

Decision: tRPC command mutations are authenticated transport adapters. They accept raw transport input and pass it into command services. Command services own command input validation and return typed command responses for expected validation failures. Query procedures may still use tRPC input validation because they are read adapters, not workflow commands.

Completed 2026-06-03: replaced command mutation `.input(...)` schemas with one authenticated command procedure that accepts unknown transport input, so `createDraft`, `saveDraft`, and `submitRequest` all route expected input validation through the command services. Added HTTP-level `/trpc` tests proving malformed command payloads return `200` with `{ ok: false, error: { code: "ValidationError" } }` instead of tRPC `BAD_REQUEST`. Verification: `pnpm --filter @accessflow/api test`.

Plain summary: command validation now comes from the command layer, not from the tRPC adapter. The UI can treat expected command input problems as normal command results.

Lesson: adapters should not steal business-rule errors from the application layer. For workflow commands, transport should authenticate and deliver input; the command should validate, decide, and return the typed result.

### 17. [x] Lock Draft Fields While Refresh Retry Is Required

Issue: after a command may have committed but the UI failed to reload, Save and Submit are disabled, but draft fields remain editable.

Why it matters: the UI tells the user to refresh before continuing, yet still lets them type into stale local state. Those edits may be overwritten when refresh succeeds.

Fix direction: include `canRetryRefresh` in the draft edit lock. Prefer one view-model value such as `canEditDraftFields` instead of repeating `!isDraft || draftCommandInFlight || canRetryRefresh` across fields.

Done when:

- draft fields are disabled while a retry-refresh banner is active
- the disabled reason remains clear to the user
- tests cover the retry-refresh edit-lock path

Completed 2026-06-03: extended the draft edit-lock helper so `canRetryRefresh` locks draft fields, computed one `draftFieldsEditable` value in `RequesterWorkspace`, used it for both rendered field disabled state and late `onChange` guards, and added a unit test proving draft fields are locked while refresh retry is required. Verification: `pnpm --filter @accessflow/web test`.

Plain summary: when the app says a command may have committed and the workspace must be refreshed, the draft form now stops accepting edits too. Users can retry refresh instead of typing into stale local state that may be overwritten.

Lesson: when a workflow state is ambiguous, lock every action that depends on stale local data, not just the final submit buttons.

### 18. [x] Replace Stringly Busy State With Typed Operation State

Issue: `RequesterWorkspace` stores `busy` as user-facing strings like `"Saving draft"`, and edit-lock logic depends on those exact labels.

Why it matters: copy should not control behavior. A wording change can silently break save/submit locking without a type error.

Fix direction: replace `busy: string | null` with a typed operation state such as `idle`, `loadingWorkspace`, `loadingRequest`, `creatingDraft`, `savingDraft`, `submittingRequest`, `refreshingWorkspace`, `authenticating`, or `signingOut`. Map operation state to display copy separately.

Done when:

- behavioral checks use typed operation kinds, not strings
- status-line copy is derived from operation state
- tests prove save/submit edit locking does not depend on wording

Completed 2026-06-03: added a typed requester operation state, moved status-line labels into a separate operation-to-copy mapper, changed `RequesterWorkspace` to store operation kinds instead of user-facing busy strings, and updated draft edit-lock tests to use operation kinds for save/submit locking. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e`.

Plain summary: wording no longer controls requester workflow behavior. The app now stores typed operation names like `savingDraft`, while display text such as "Saving draft" is derived separately for the status line.

Lesson: copy is product output, not application state. If behavior depends on a label, a harmless wording change can become a bug.

### 19. [x] Add Audit Event Transition Constraints

Issue: audit events are constrained to enum values, but not to legal event/from/to triples. The database would accept impossible audit facts such as `submitRequest` from `submitted` to `submitted`.

Why it matters: the audit timeline is durable product truth, not decoration. If scripts or future commands can write impossible audit rows, the UI can faithfully render false history.

Fix direction: add a database check for the currently implemented audit vocabulary, starting with `submitRequest => draft -> submitted`. Keep the constraint small and expand it when review/admin transitions are implemented.

Done when:

- impossible audit event triples are rejected by the database
- direct schema-invariant tests cover invalid audit transitions
- submit still writes the legal audit row in the same transaction

Completed 2026-06-03: added the `study_access_audit_events_transition_check` database constraint, generated migration `0004_hot_hairball.sql`, added a direct Postgres check-violation test for an impossible `submitRequest` `submitted -> submitted` audit row, and asserted that `submitRequest` still persists the legal `submitRequest` `draft -> submitted` audit event. Verification: `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/api db:migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: audit rows can no longer claim impossible workflow history. The database now accepts the current legal submit audit event and rejects a fake submitted-to-submitted submit event.

Lesson: an audit log is only useful if impossible facts cannot be written. Event enums are not enough; durable audit rows also need legal from/to transition rules.

### 20. [x] Define And Enforce Idempotency Expiry Semantics

Issue: idempotency rows have `expiresAt`, but replay lookup ignores it. Keys currently replay or conflict forever.

Why it matters: storing an expiry without enforcing it creates a false contract. Either keys expire or they do not.

Fix direction: decide the v1 rule. Prefer rejecting expired keys with a typed `Conflict` and allowing a new key for a new attempt. If permanent keys are intentional, remove or rename the expiry field.

Done when:

- expired idempotency keys have a documented behavior
- submit replay tests cover expired same-payload and expired different-payload keys
- the schema and command code tell the same story

Decision: v1 rejects expired idempotency keys with a typed `Conflict`, regardless of whether the payload matches the original command. The client must start a new attempt with a new idempotency key.

Completed 2026-06-03: made `resolveIdempotencyReplay` enforce `expiresAt` before replay or payload-mismatch checks, kept `idempotency_keys.expires_at` as the durable schema contract, and added submit tests for expired same-payload replay and expired different-payload reuse. Verification: `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/api db:migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: idempotency keys no longer replay forever. Once a key expires, the API returns a normal conflict and asks the caller to use a new key, even if the repeated payload is identical.

Lesson: stored expiry fields must change behavior. If the command ignores expiry, the schema is promising something the application does not actually enforce.

### 21. [x] Extract A Requester Workspace Controller Hook

Issue: `RequesterWorkspace` still owns session bootstrap, study selection, async guards, command execution, refresh retry policy, submit idempotency reconciliation, error state, and draft form state.

Why it matters: the panels are presentational now, but the parent is still a large workflow controller. Adding reviewer/admin or more requester states will make it harder to reason about React synchronization.

Fix direction: extract a `useRequesterWorkspaceController` hook or reducer-driven controller. Keep rendering in `RequesterWorkspace`, but move orchestration, async guards, refresh retry, submit attempts, and command execution into a testable controller.

Done when:

- `RequesterWorkspace` reads as wiring/rendering rather than implementation detail
- controller state transitions are unit-tested without rendering the full page
- existing Playwright requester workflow still passes

Completed 2026-06-03: extracted `useRequesterWorkspaceController` so session bootstrap, auth commands, study loading, async guards, command execution, refresh retry, submit-attempt reconciliation, error state, and draft form state live outside the page renderer. `RequesterWorkspace` now wires controller state/actions into presentational panels. Added controller-state unit tests for selected study derivation, idle status, draft command locking, refresh-retry locking, and submitted read-only state. Verification: `pnpm --filter @accessflow/web test`, `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, Browser-rendered sign-out smoke on `http://192.168.1.31:3000` with no console warnings/errors, and `git diff --check`.

Plain summary: the large requester screen no longer contains both the workflow brain and the rendering. The hook owns the workflow behavior; the component mostly passes state and callbacks to the panels.

Lesson: when a UI component becomes a workflow controller, move the orchestration into a hook or reducer before adding more states. That makes behavior easier to test without mounting the whole page.

### 22. [x] Extract Canonical Draft Read And Patch Helpers

Issue: `saveDraft` and `submitRequest` both manually rebuild the owned-draft joined row shape and repeat parts of ownership/status/draft parsing.

Why it matters: duplicated persistence plumbing makes future workflow commands easier to drift. Command files should express policy, not column wiring.

Fix direction: extract a canonical `readRequesterDraftForUpdate` helper and shared draft patch helpers. Keep command-specific policy in command files.

Done when:

- save and submit share one locked draft read shape
- ownership/status checks are easier to scan
- existing save/submit command tests still pass

Completed 2026-06-03: added `readRequesterDraftForUpdate` as the shared locked draft/request read path, added `draftPatchValues` and `finalDraftPatchValues` for save/submit database updates, and rewired `saveDraft` and `submitRequest` to use those helpers while keeping not-found, ownership, status, transition, and idempotency policy visible in the command files. Updated command tests to prove partial saves preserve omitted fields and submit persists the final draft values. Verification: `pnpm --filter @accessflow/api lint`, `pnpm --filter @accessflow/api typecheck`, `pnpm --filter @accessflow/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: save and submit no longer each rebuild the same locked draft query and patch objects. They now share the database plumbing, while each command still shows the business decisions it owns.

Lesson: duplication around persistence shape is easy to miss because it looks like harmless column wiring. Once two commands need the same locked row, extract the row reader and patch builders so future workflow changes do not drift.

### 23. [x] Remove Duplicate Workflow Transition Sources

Issue: the workflow package stores transitions in `workflowTransitions` and repeats them in the XState machine, then casts `nextSnapshot.value` back to `StudyAccessRequestStatus`.

Why it matters: two transition graphs can drift. The cast can hide that drift from TypeScript.

Fix direction: choose one source of truth. Either derive transitions from the machine, or use a typed transition table until XState earns its complexity. If XState stays, add an invariant test that machine states match `studyAccessRequestStatuses`.

Done when:

- transition legality has one canonical source
- no cast is needed to trust the next status
- workflow tests prove state vocabulary and transition vocabulary stay aligned

Completed 2026-06-03: removed the XState machine from `@accessflow/workflow`, removed the unsafe `nextSnapshot.value as StudyAccessRequestStatus` cast, and made `workflowTransitions` the single canonical transition source. Removed the now-unused `xstate` package dependency and lockfile entries. Expanded workflow tests so allowed cases derive from `workflowTransitions`, every other status/event pair is rejected, active statuses stay inside the status vocabulary, duplicate status/event transition keys are rejected, and `transitionWorkflowStatus` always matches the canonical table. Verification: `pnpm --filter @accessflow/workflow lint`, `pnpm --filter @accessflow/workflow typecheck`, `pnpm --filter @accessflow/workflow test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: the workflow package no longer has two competing transition graphs. There is one transition table, and the transition helper simply follows that table.

Lesson: a state machine library is useful when it owns meaningful behavior. If a small workflow is already modeled as a typed transition table, duplicating it in a second machine adds drift risk without adding clarity.

### 24. [x] Reuse One Requested Role Parser Everywhere

Issue: requested-role parsing is duplicated. Query mapping casts through `includes`, while persisted draft parsing hardcodes `z.enum(["viewer", "analyst"])`.

Why it matters: adding a role could update validation but not persisted read parsing, or vice versa.

Fix direction: export one `requestedStudyRoleSchema` or `isRequestedStudyRole` from `packages/workflow` and reuse it in validation, query mapping, draft parsing, and web select parsing.

Done when:

- no requester-role parser hardcodes a second role list
- invalid persisted roles still fail safely
- tests cover the shared parser

Completed 2026-06-03: added `isRequestedStudyRole`, `parseRequestedStudyRole`, and `parsePersistedRequestedStudyRole` to `@accessflow/workflow`; reused them in API command validation, persisted draft parsing, requester query mapping, web draft-form normalization, and web requested-role select handling. Removed the hardcoded persisted `z.enum(["viewer", "analyst"])`, the query `requestedStudyRoles.includes` cast, and the web `viewer`/`analyst` equality check. Added workflow parser tests, API validation tests, API persisted draft parsing tests, and web draft model tests. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: requested-role validity now comes from one workflow parser instead of scattered checks. The API, persisted reads, and web form all agree on which roles are valid.

Lesson: shared vocabulary is not enough if every layer parses it differently. Put the parser next to the vocabulary, then make each boundary choose whether invalid values should fail closed or normalize to an empty UI value.

### 25. [x] Make `AppError` A Real Discriminated Union

Issue: `AppError` allows `formErrors` and `fieldErrors` on every error code. Non-validation errors can carry field errors, and validation errors can omit them.

Why it matters: invalid error states are representable, so UI code must defensively handle combinations that should not exist.

Fix direction: model `AppError` as a discriminated union keyed by `code`. Let `ValidationError` carry typed field/form errors, while other errors carry only their relevant fields.

Done when:

- TypeScript rejects field errors on non-validation errors
- requester field errors use a field vocabulary instead of arbitrary strings where practical
- command and UI tests still prove friendly error rendering

Completed 2026-06-03: changed `AppError` into a discriminated union with a dedicated `ValidationError` variant that always carries `fieldErrors` and `formErrors`, while non-validation variants only carry `code` and `message`. Added typed field-error maps, narrowed core non-validation constructors, typed API command validation fields by command input, typed requester UI errors by draft field name, and made the requester form read field/form errors only after narrowing to `ValidationError`. Added compile-time `@ts-expect-error` checks for invalid error states and updated API/web tests around validation and friendly error rendering. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: field errors now belong only to validation errors. Other errors, like auth failures, conflicts, and unexpected failures, cannot accidentally pretend to be form-validation results.

Lesson: typed error codes are strongest when each code has its own shape. A broad optional bag is flexible, but it makes impossible states look normal and pushes defensive checks into every UI.

### 26. [x] Add Error Focus And Live-Region Behavior

Issue: validation errors render near fields, but focus stays wherever the user was. The loading/status line is visible but is not consistently announced.

Why it matters: keyboard and screen reader users may not discover what changed after submit or why controls became disabled.

Fix direction: add focus-to-error behavior after `ValidationError`, ideally through an error summary that links to invalid fields. Add `role="status"` or `aria-live="polite"` to operation status copy and expose busy state on the relevant section or main region.

Done when:

- failed submit moves focus to an error summary or first invalid field
- loading/saving/submitting status changes are announced
- browser or Playwright coverage proves the focus behavior

Completed 2026-06-03: added a focusable requester validation summary, linked each validation field error back to its input, and focused that summary when a `ValidationError` appears. The operation status line now uses a polite status region, the main app shell exposes `aria-busy`, and the request panel/form expose busy state during draft commands. Also normalized missing requested-role submit errors to the product message. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `git diff --check`, and Browser-rendered validation flow on `http://localhost:3000` with no console warnings/errors.

Plain summary: after an invalid submit, focus now moves to the error summary instead of staying wherever the user was. Screen reader users also get polite operation updates, and the page exposes when workflow commands are busy.

Lesson: rendering an error is not enough. The UI also has to move attention to the new problem and announce important state changes without requiring users to visually scan the whole page.

### 27. [x] Sanitize Command Error Copy At The Web Boundary

Issue: command errors render `error.message` and `formErrors` directly from the API. Auth errors already have a safe-copy mapper, but command errors do not.

Why it matters: future backend messages may contain implementation wording that is useful for logs but not polished or safe for users.

Fix direction: add a command-error copy mapper by `AppError["code"]`. Render raw server text only where explicitly whitelisted, such as field-level validation messages.

Done when:

- generic command errors show stable user-facing copy
- field validation still shows actionable field-specific messages
- tests cover unknown/unexpected command error payloads

Completed 2026-06-03: added sanitized command error descriptions and whitelisted validation form-message rendering in the requester web boundary. The requester alert now renders `commandErrorDescription(error)` and `commandErrorFormMessages(error)` instead of raw `error.message` and raw `formErrors`. Known safe web-owned command messages are preserved, while raw API conflict/forbidden/unexpected messages are replaced with stable user-facing copy. Tests cover raw backend-looking messages, safe local command messages, and validation form-message allowlisting. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `git diff --check`.

Plain summary: command errors now pass through a display mapper before reaching the user. Field errors can still say exactly what to fix, but generic backend messages no longer leak implementation details into the UI.

Lesson: API error messages are useful diagnostics, not automatically product copy. The UI boundary should decide what is safe and helpful to display.

### 28. [x] Remove Global Horizontal Overflow Hiding

Issue: global CSS sets `overflow-x: hidden` on `html, body`.

Why it matters: this can mask layout bugs, clip focus outlines, and make mobile overflow tests less meaningful.

Fix direction: remove the global hiding after moving any needed containment to specific panels or content blocks. Keep the existing mobile overflow test and add a narrower viewport check if needed.

Done when:

- no global `overflow-x: hidden` is needed to pass mobile layout
- browser/e2e checks still show no horizontal overflow
- long emails, ids, and error messages remain readable

Completed 2026-06-03: removed the document-level `overflow-x: hidden` rule from the web global stylesheet. Strengthened the requester Playwright workflow to run at a 320px mobile viewport, assert that neither `html` nor `body` hides horizontal overflow, keep checking that document and body scroll widths stay within the viewport, and verify the focused validation summary remains inside the viewport. Captured a 320px Playwright screenshot of the requester entry state after the change. Verification: `pnpm --filter @accessflow/web lint`, `pnpm --filter @accessflow/web typecheck`, `pnpm --filter @accessflow/web test`, `pnpm test:e2e`, and rendered screenshot capture with Playwright.

Plain summary: the page no longer hides horizontal overflow globally. If a future component becomes too wide, tests should catch it instead of the browser silently clipping it.

Lesson: global overflow hiding is a mask, not a layout fix. Prefer making each surface wrap or contain its own content, then test narrow screens directly.

### 29. [x] Delete Speculative Or Unused Helpers

Issue: small helpers such as `idempotencyReplaySchema` appear unused while more specific schemas own the real behavior.

Why it matters: unused abstractions make the codebase feel more generic than it is and add concepts future readers must inspect.

Fix direction: delete unused wrappers after confirming there is no near-term caller. Prefer re-adding abstractions when the second real use appears.

Done when:

- unused/speculative helpers are removed or justified
- tests still pass
- no public package export suggests a capability the repo does not use

Completed 2026-06-03: removed the unused `idempotencyReplaySchema` wrapper so idempotency replay validation uses the concrete `submitRequestResultSchema` directly. Removed the unused generic `CommandHandler` type and the one-line `requesterOnly` alias, leaving requester authorization visible in `ensureRequester`. Narrowed `@accessflow/core` by making internal error-code vocabulary private and deleting unused public `unauthorized` and `assertNever` helpers. A package-export audit now finds no unused exported symbols in `packages/*`. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`.

Plain summary: small helpers that looked reusable but had no real second caller were removed. The remaining code says what it does more directly, especially around idempotency replay and requester authorization.

Lesson: a helper earns its name when it hides real repeated behavior. If it only wraps one line or predicts a future use, it usually makes the current code harder to read.

### 30. [x] Add Reviewer Decision Idempotency

Issue: reviewer approval and rejection changed workflow state, but retries did not have a stable replay contract. If a reviewer clicked approve/reject and the response was lost after the database committed, a retry would use a fresh command attempt and could only fail from the final workflow state.

Why it matters: this project is about truthful workflow transitions. Retryable decisions should not create duplicate audit events, and the UI should not lose the ability to ask the API what happened after an uncertain completion.

Fix direction: require idempotency keys for `approveRequest` and `rejectRequest`, store pending/completed idempotency rows in the same command transaction, replay completed same-key/same-payload decisions, reject same-key/different-payload retries, and preserve reviewer decision keys in the web controller until refreshed state confirms the terminal decision.

Done when:

- duplicate same-key approve/reject retries replay the original result
- same-key different-payload retries return `IdempotencyConflict`
- new duplicate decisions after a terminal state do not write another audit event
- the reviewer UI keeps the same key through uncertain mutation retries
- docs state that reviewer decision idempotency is implemented

Completed 2026-06-05: added approve/reject idempotency keys at the API validation boundary, reused the command idempotency replay helper for reviewer decisions, stored completed decision responses transactionally, and added command tests for replay, payload conflict, and no duplicate audit events. The reviewer web controller now creates stable approve/reject attempts, reuses the same key for uncertain retries, clears it after persisted state confirms the decision, and uses truthful copy for mutation failure versus refresh failure. Verification: `pnpm --filter @accessflow/api test`, `pnpm --filter @accessflow/web test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `git diff --check`.

Plain summary: reviewer approval and rejection can now be retried safely with the same key. A retry returns the original decision instead of writing another decision event.

Lesson: idempotency is not just a database table. The API must record enough result data to replay, and the UI must preserve the same key until it has confirmed persisted state.

## Do Not Start Yet

Requester hardening is substantially complete, and the first reviewer decision slice has been implemented. Do not start these broader surfaces until the current requester/reviewer workflow is reviewed and any new high-priority findings are handled:

- withdrawal/revocation workflow UI
- admin workflow UI or mutations
- organizations or tenants
- uploads/documents
- notifications or queues
- analytics/vendor telemetry
- generic workflow builder
- generic form library extraction
