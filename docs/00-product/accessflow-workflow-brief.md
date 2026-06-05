# AccessFlow Workflow Brief

## 1. Purpose

AccessFlow is a full-stack workflow case study for clinical study workspace access requests. It models a privacy-sensitive, regulated-style workflow without claiming to be a compliance platform or a clinical data system.

The product scenario is intentionally small: requesters ask for access to a synthetic clinical study workspace, reviewers decide whether access should be granted, and the system records every durable transition. The goal is not to build another frontend showcase or a generic form library. The goal is to practice truthful workflow engineering across authentication, authorization, typed commands, persistence, idempotency, state transitions, audit events, and typed errors.

This document describes the product spine and roadmap. It is not a claim that every role and command is implemented today. The current implementation is intentionally narrower:

```text
implemented now: requester sign-up/sign-in, study read, createDraft, saveDraft, submitRequest, reviewer startReview, approveRequest, rejectRequest, persisted audit timelines
next hardening: reviewer decision review, decision idempotency decision, accessibility, docs, and quality gates
roadmap later: withdrawRequest, revokeAccess, admin inspection
```

The core command path is:

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

Fastify is the API host. It should support request lifecycle, cookies, logging, testing, and tRPC mounting, but it is not the center of the architecture. The center is the command boundary and the invariant that server-side workflow truth cannot be faked by UI state.

A workflow transition is successful only when the API transaction persists the new state and writes the audit event.

## 2. Non-goals

AccessFlow v1 is not a generic workflow engine, form builder, schema registry, or compliance platform. It will not claim HIPAA, GDPR, clinical-grade, or medical-device compliance. It will use synthetic study data only and will not store patient records or clinical trial source data.

The first version will not include document uploads, email notifications, background jobs, external analytics vendors, multi-tenant organization management, an admin drag-and-drop workflow builder, or a reusable package registry. Those ideas may become useful later, but they would distract from the first objective: make one workflow truthful end to end.

Conform is deferred. Forms in v1 use plain React and HTML controls with Zod validation and tRPC commands. If form complexity grows enough to justify progressive-enhancement-specific tooling, Conform can become a form adapter later. It must not become the workflow command layer.

## 3. Personas

The target product has three roles. The current code implements the requester-facing command slice and the first reviewer decision slice.

Requester: implemented for creating and updating their own access request drafts, submitting requests, and viewing the status and audit timeline for their own requests. Withdrawing a submitted request is roadmap.

Reviewer: implemented for reading submitted, under-review, approved, and rejected access requests through reviewer inbox/detail projections, starting review, approving requests, rejecting requests with a reason, and viewing the persisted audit timeline. A reviewer should not be able to edit the requester-owned form payload directly.

Admin: roadmap. Admin will inspect all requests and audit events. Admin exists for operational visibility and test coverage, not for a large management console in v1.

There is no fake role switcher. Local development seeds `requester@example.test`, `reviewer@example.test`, and `admin@example.test` with password `development-password`; those users authenticate through the real Better Auth credential/session path.

## 4. Workflow Lifecycle

The workflow status is stored as a canonical enum. In v1, a typed transition table models transition legality. The database status and audit log are the durable source of truth.

Target workflow statuses:

```text
implemented now:
draft
submitted
under_review
approved
rejected

roadmap later:
withdrawn
revoked
```

Target transitions:

```text
implemented now:
draft -> submitted
submitted -> under_review
under_review -> approved
under_review -> rejected

roadmap later:
submitted -> withdrawn
rejected -> draft
approved -> revoked
```

The transition table is used only for workflow transitions. It must not manage field state, modal state, loading buttons, form dirtiness, tab selection, or page navigation. The client may use workflow helpers to display allowed actions, but the API remains authoritative. If the client predicts an action is allowed and the server rejects it, the server result wins. XState is deferred until the workflow grows enough nested, parallel, or guarded behavior to justify it.

The system persists the status enum and audit events. It does not persist full state-machine snapshots in v1.

## 5. Commands

Commands are transport-independent application operations exposed through tRPC mutations. The web app calls tRPC; the API command service owns validation, authorization, idempotency, transition checks, and transactions.

Implemented command set:

```text
createDraft
saveDraft
submitRequest
startReview
approveRequest
rejectRequest
```

Roadmap command set:

```text
withdrawRequest
revokeAccess
```

`createDraft` creates a requester-owned draft for a study workspace. `saveDraft` updates draft fields without submitting the workflow. `submitRequest` validates the request payload, moves the request from `draft` to `submitted`, records idempotency, and writes an audit event.

`startReview` marks a submitted request as `under_review`. `approveRequest` and `rejectRequest` decide an under-review request. Rejection requires a reason. Approval does not require a note in v1.

`withdrawRequest` lets a requester withdraw a submitted request before review is complete. `revokeAccess` lets an admin or authorized reviewer revoke a previously approved request.

Every command returns a typed result shape. Expected failures should be represented as typed application errors, not thrown as unstructured exceptions.

## 6. Data Model

The first data model should stay small and explicit.

Core records:

```text
users
studies
study_access_requests
study_access_request_drafts
study_access_audit_events
idempotency_keys
```

`users` are managed through Better Auth and application role metadata. The API owns auth persistence and session validation. The web app never imports auth tables directly.

`studies` are synthetic workspace records used to make the access request concrete. A study should have a stable identifier, display name, short description, and sensitivity label. It should not contain patient data.

`study_access_requests` store the durable request identity, requester, study, status, requested role, submitted timestamps, decision timestamps, and decision metadata. The request status is the canonical workflow state.

`study_access_request_drafts` store editable draft payloads before submission. Draft data may include purpose, requested role, justification, affiliation, and optional supporting notes. Drafts are requester-owned.

`study_access_audit_events` record workflow events, actor identity, from-status, to-status, event type, reason or note, timestamp, and minimal metadata.

`idempotency_keys` record command deduplication state by actor, command name, key, payload hash, result reference, creation time, and expiry time.

Drizzle owns schema definitions and migrations inside `apps/api` initially. A separate `packages/db` should not exist until another package truly needs database metadata.

## 7. Auth And Authorization

AccessFlow uses Better Auth for real local login and session handling. The goal is a real session boundary without relying on a fake role switcher.

The repo has two apps:

```text
apps/web
apps/api
```

`apps/api` owns authentication, session validation, roles, authorization, Drizzle, and workflow writes. `apps/web` reads session state through the API and calls tRPC procedures with credentials. `apps/web` must not import Drizzle, auth database tables, or workflow command services directly.

Local development runs:

```text
web: http://localhost:3000
api: http://localhost:4000
postgres: Docker
```

Because the apps are split, CORS, cookies, credentials, and API base URL configuration are part of the API contract. They are not incidental setup details.

Initial authorization rules:

```text
requester: create drafts, update own drafts, submit own requests, view own requests, withdraw own submitted requests
reviewer: list submitted/under-review/approved/rejected requests, read request detail/timeline, start review, approve under-review requests, reject under-review requests
admin roadmap: inspect all requests and audit events, revoke approved access
```

The current requester implementation covers create/update/submit/view-own-request behavior. The current reviewer implementation covers review reads, start review, approval, rejection, and decision notes. Request withdrawal, revocation, decision idempotency, and admin permissions remain roadmap.

Authorization should be enforced in the API command layer before state transitions are attempted.

## 8. Idempotency

Submit and review transition commands should be idempotent when retries are exposed as a product requirement. Idempotency is scoped to the actor, idempotency key, command name, and payload hash. Today, `submitRequest` is implemented with idempotency. Review/admin transition idempotency is roadmap and should be decided before adding retry UX to reviewer actions.

Rules:

```text
same actor + same idempotency key + same command payload returns the original result
same actor + same idempotency key + different command payload returns IdempotencyConflict
```

The idempotency record should be written in the same logical operation as the workflow transition result. If a command has already completed, retrying it should not create duplicate access requests, duplicate decisions, or duplicate audit events.

Idempotency is required for commands that can be retried by clients after uncertain completion. Implemented today: `submitRequest`. Roadmap later: decide and implement idempotency for `startReview`, `approveRequest`, `rejectRequest`, `withdrawRequest`, and `revokeAccess` if those commands gain retry semantics. Draft-saving may be last-write-wins in v1, but it should still use normal authorization and validation.

## 9. Audit Guarantees

Audit events are first-class product records, not UI decorations. A transition that changes workflow status must write an audit event in the same database transaction as the status update.

Each audit event should include:

```text
requestId
actorId
eventType
fromStatus
toStatus
reason or note
createdAt
metadata
```

The timeline shown in the UI must be rendered from persisted audit events. It must not infer transition history from the current status alone.

Audit metadata should be minimal and privacy-safe. It can include command name, idempotency key reference, and request payload hash. It should not include unnecessary form content, secrets, session tokens, or raw request headers.

## 10. Error Contract

Errors are part of the product contract. The API should return structured errors that the web app can render predictably.

Initial error types:

```text
ValidationError
Unauthorized
Forbidden
NotFound
InvalidTransition
IdempotencyConflict
Conflict
Unexpected
```

`ValidationError` may include field errors and form-level errors. `Unauthorized` means there is no valid session. `Forbidden` means the actor is authenticated but lacks permission. `InvalidTransition` means the requested workflow event is not legal from the current status. `IdempotencyConflict` means the same key was reused with a different payload. `Conflict` covers stale state or optimistic concurrency failures. `Unexpected` is a safe fallback and should not leak internal implementation details.

The web app should render field errors near fields, form errors near the command surface, and transition errors near workflow actions. Expected command failures should not be hidden behind generic toast-only feedback.

## 11. UI Surfaces

The first web app should have just enough UI to exercise the workflow honestly.

Requester surfaces:

```text
implemented now:
study entry point
access request draft form
request status state
own persisted audit timeline

roadmap later:
withdraw action
```

Reviewer surfaces:

```text
implemented now:
submitted request inbox
request detail view
audit timeline

roadmap later:
start review action
approve action
reject action with required reason
```

Admin surfaces:

```text
roadmap later:
all requests overview
audit event inspection
revoke access action
```

The form UI should be accessible and boring. Plain React and HTML controls are enough for v1. The strongest UX signal is not advanced field mechanics. It is that after refresh, the UI reflects persisted workflow truth.

## 12. Test Plan

The test plan should prove the command boundary and workflow invariant before expanding UI polish.

Unit tests:

```text
workflow transition-table legality
Zod validation schemas
Result/error helpers
idempotency payload hashing
authorization rule helpers
```

API tests:

```text
implemented now:
unauthenticated command returns Unauthorized
requester can create and submit own draft
same idempotency key and payload returns original result
same idempotency key and different payload returns IdempotencyConflict
submit transition writes status update and audit event transactionally
requester cannot access reviewer reads
reviewer/admin can read submitted request projections
requester cannot review own request
reviewer can start review and approve/reject
reject requires reason
invalid transition returns InvalidTransition
review/admin transitions write status update and audit event transactionally

roadmap later:
decision idempotency if reviewer retry UX is added
```

Web tests:

```text
implemented now:
requester creates draft
invalid submit shows field/form errors
valid submit persists request and audit event
refresh shows submitted status
timeline shows persisted events
reviewer sees submitted request in inbox
reviewer sees persisted request detail/timeline

roadmap later:
reviewer approves or rejects
```

End-to-end success is defined by durability: the UI may only claim success after the API has persisted the transition and the audit event. Refreshing the page must never reveal that a workflow action was only local UI state.
