"use client";

import { useEffect, useRef, type RefObject } from "react";

import type {
  Actor,
  AppError,
  DraftForm,
  Study,
  StudyAccess
} from "./requester-workspace-model";
import {
  parseRequestedStudyRole,
  requestedStudyRoles,
  type RequestedStudyRole
} from "@accessflow/workflow";
import {
  draftFieldAccessibilityProps,
  draftErrorSummaryId,
  draftErrorSummaryTitleId,
  draftFieldErrorSummaryItems,
  draftFieldErrorId,
  firstDraftFieldError,
  type DraftFieldName
} from "./requester-field-accessibility";
import {
  appErrorTitle,
  commandErrorDescription,
  commandErrorFormMessages
} from "./requester-error-copy";
import { compactId } from "./requester-workspace-model";
import { demoAccounts } from "./session-client";

const requestedStudyRoleLabels = {
  analyst: "Analyst",
  viewer: "Viewer"
} satisfies Record<RequestedStudyRole, string>;

type AuthMode = "sign-up/email" | "sign-in/email";

type RequesterHeaderProps = {
  actor: Actor | null;
  busy: boolean;
  onSignOut: () => void;
};

export function RequesterHeader({
  actor,
  busy,
  onSignOut
}: RequesterHeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">AccessFlow</p>
        <h1>Study access request</h1>
      </div>
      <div className="session-pill">
        {actor ? (
          <>
            <span>{actor.email}</span>
            <button type="button" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <span>No active session</span>
        )}
      </div>
    </header>
  );
}

type AuthPanelProps = {
  authEmail: string;
  authName: string;
  authPassword: string;
  busy: boolean;
  onAuthenticate: (mode: AuthMode) => void;
  onAuthEmailChange: (value: string) => void;
  onAuthNameChange: (value: string) => void;
};

export function AuthPanel({
  authEmail,
  authName,
  authPassword,
  busy,
  onAuthenticate,
  onAuthEmailChange,
  onAuthNameChange
}: AuthPanelProps) {
  return (
    <section className="panel auth-panel" aria-labelledby="auth-title">
      <div>
        <p className="eyebrow">Requester login</p>
        <h2 id="auth-title">Use seeded access or create a requester</h2>
        <p className="form-hint">
          Seeded requester: {demoAccounts.requester.email}
        </p>
      </div>

      <label>
        Name
        <input
          value={authName}
          onChange={(event) => onAuthNameChange(event.target.value)}
          autoComplete="name"
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={authEmail}
          onChange={(event) => onAuthEmailChange(event.target.value)}
          autoComplete="email"
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={authPassword}
          readOnly
          autoComplete="current-password"
        />
      </label>

      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => onAuthenticate("sign-up/email")}
          disabled={busy}
        >
          Create new requester
        </button>
        <button
          type="button"
          onClick={() => onAuthenticate("sign-in/email")}
          disabled={busy}
        >
          Sign in
        </button>
      </div>
    </section>
  );
}

type StudyPanelProps = {
  access: StudyAccess;
  busy: boolean;
  canRetryRefresh: boolean;
  selectedStudy: Study | null;
  selectedStudyId: string;
  studies: Study[];
  onCreateDraft: () => void;
  onSelectStudy: (studyId: string) => void;
};

export function StudyPanel({
  access,
  busy,
  canRetryRefresh,
  selectedStudy,
  selectedStudyId,
  studies,
  onCreateDraft,
  onSelectStudy
}: StudyPanelProps) {
  return (
    <section className="panel study-panel" aria-labelledby="study-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="study-title">
            {selectedStudy?.displayName ?? "No study workspace"}
          </h2>
        </div>
        {access ? (
          <span className={`status-badge status-${access.request.status}`}>
            {access.request.status.replace("_", " ")}
          </span>
        ) : null}
      </div>

      {studies.length > 1 ? (
        <label>
          Study
          <select
            value={selectedStudyId}
            onChange={(event) => onSelectStudy(event.target.value)}
          >
            {studies.map((study) => (
              <option key={study.id} value={study.id}>
                {study.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedStudy ? (
        <>
          <p className="description">{selectedStudy.shortDescription}</p>
          <dl className="meta-list">
            <div>
              <dt>Sensitivity</dt>
              <dd>{selectedStudy.sensitivityLabel}</dd>
            </div>
            <div>
              <dt>Study ID</dt>
              <dd>{compactId(selectedStudy.id)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="description">
          Seed the local database before creating a request.
        </p>
      )}

      {!access && selectedStudy ? (
        <button
          type="button"
          className="primary-button"
          onClick={onCreateDraft}
          disabled={busy || canRetryRefresh}
        >
          Create request draft
        </button>
      ) : null}
    </section>
  );
}

type RequestPanelProps = {
  access: StudyAccess;
  busy: boolean;
  canRetryRefresh: boolean;
  draftCommandInFlight: boolean;
  draftFieldsEditable: boolean;
  draftForm: DraftForm;
  draftId: string | null;
  error: AppError | null;
  isDraft: boolean;
  isSubmitted: boolean;
  onRetryRefresh: () => void;
  onSaveDraft: () => void;
  onSubmitRequest: () => void;
  onUpdateDraft: (field: keyof DraftForm, value: string) => void;
};

export function RequestPanel({
  access,
  busy,
  canRetryRefresh,
  draftCommandInFlight,
  draftFieldsEditable,
  draftForm,
  draftId,
  error,
  isDraft,
  isSubmitted,
  onRetryRefresh,
  onSaveDraft,
  onSubmitRequest,
  onUpdateDraft
}: RequestPanelProps) {
  const validationError = error?.code === "ValidationError" ? error : null;
  const fieldErrorSummaryItems = draftFieldErrorSummaryItems(
    validationError?.fieldErrors
  );
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (validationError) {
      errorSummaryRef.current?.focus();
    }
  }, [validationError]);

  return (
    <section
      className="panel request-panel"
      aria-busy={draftCommandInFlight}
      aria-labelledby="request-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Requester form</p>
          <h2 id="request-title">Access request</h2>
        </div>
        {access?.request.id ? (
          <span className="muted">#{compactId(access.request.id)}</span>
        ) : null}
      </div>

      <CommandError
        busy={busy}
        canRetryRefresh={canRetryRefresh}
        error={error}
        fieldErrorSummaryItems={fieldErrorSummaryItems}
        onRetryRefresh={onRetryRefresh}
        summaryRef={errorSummaryRef}
      />

      {!access ? (
        <p className="empty-state">
          Create a draft to start the requester workflow.
        </p>
      ) : (
        <form
          className="request-form"
          aria-busy={draftCommandInFlight}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitRequest();
          }}
        >
          <label>
            Purpose
            <textarea
              {...draftFieldAccessibilityProps({
                field: "purpose",
                error: firstDraftFieldError(
                  validationError?.fieldErrors,
                  "purpose"
                )
              })}
              value={draftForm.purpose}
              onChange={(event) => onUpdateDraft("purpose", event.target.value)}
              disabled={!draftFieldsEditable}
              rows={4}
            />
            <FieldError
              field="purpose"
              error={firstDraftFieldError(
                validationError?.fieldErrors,
                "purpose"
              )}
            />
          </label>

          <label>
            Requested role
            <select
              {...draftFieldAccessibilityProps({
                field: "requestedRole",
                error: firstDraftFieldError(
                  validationError?.fieldErrors,
                  "requestedRole"
                )
              })}
              value={draftForm.requestedRole}
              onChange={(event) =>
                onUpdateDraft(
                  "requestedRole",
                  parseRequestedStudyRole(event.target.value) ?? ""
                )
              }
              disabled={!draftFieldsEditable}
            >
              <option value="">Select role</option>
              {requestedStudyRoles.map((role) => (
                <option key={role} value={role}>
                  {requestedStudyRoleLabels[role]}
                </option>
              ))}
            </select>
            <FieldError
              field="requestedRole"
              error={firstDraftFieldError(
                validationError?.fieldErrors,
                "requestedRole"
              )}
            />
          </label>

          <label>
            Justification
            <textarea
              {...draftFieldAccessibilityProps({
                field: "justification",
                error: firstDraftFieldError(
                  validationError?.fieldErrors,
                  "justification"
                )
              })}
              value={draftForm.justification}
              onChange={(event) =>
                onUpdateDraft("justification", event.target.value)
              }
              disabled={!draftFieldsEditable}
              rows={4}
            />
            <FieldError
              field="justification"
              error={firstDraftFieldError(
                validationError?.fieldErrors,
                "justification"
              )}
            />
          </label>

          <label>
            Affiliation
            <input
              {...draftFieldAccessibilityProps({
                field: "affiliation",
                error: firstDraftFieldError(
                  validationError?.fieldErrors,
                  "affiliation"
                )
              })}
              value={draftForm.affiliation}
              onChange={(event) =>
                onUpdateDraft("affiliation", event.target.value)
              }
              disabled={!draftFieldsEditable}
            />
            <FieldError
              field="affiliation"
              error={firstDraftFieldError(
                validationError?.fieldErrors,
                "affiliation"
              )}
            />
          </label>

          <label>
            Supporting notes
            <textarea
              {...draftFieldAccessibilityProps({
                field: "supportingNotes",
                error: null
              })}
              value={draftForm.supportingNotes}
              onChange={(event) =>
                onUpdateDraft("supportingNotes", event.target.value)
              }
              disabled={!draftFieldsEditable}
              rows={3}
            />
          </label>

          {isSubmitted ? (
            <p className="submitted-note">Submitted at {access.request.submittedAt}</p>
          ) : null}

          <div className="button-row">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={!draftId || !isDraft || busy || canRetryRefresh}
            >
              Save draft
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!draftId || !isDraft || busy || canRetryRefresh}
            >
              Submit request
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

type CommandErrorProps = {
  busy: boolean;
  canRetryRefresh: boolean;
  error: AppError | null;
  fieldErrorSummaryItems: ReturnType<typeof draftFieldErrorSummaryItems>;
  onRetryRefresh: () => void;
  summaryRef: RefObject<HTMLDivElement | null>;
};

function CommandError({
  busy,
  canRetryRefresh,
  error,
  fieldErrorSummaryItems,
  onRetryRefresh,
  summaryRef
}: CommandErrorProps) {
  if (!error) {
    return null;
  }

  const formErrors = commandErrorFormMessages(error);

  return (
    <div
      ref={summaryRef}
      className="command-error"
      id={draftErrorSummaryId}
      role="alert"
      tabIndex={-1}
      aria-labelledby={draftErrorSummaryTitleId}
    >
      <strong id={draftErrorSummaryTitleId}>{appErrorTitle(error)}</strong>
      <span>{commandErrorDescription(error)}</span>
      {formErrors.map((formError) => (
        <span key={formError}>{formError}</span>
      ))}
      {fieldErrorSummaryItems.length > 0 ? (
        <ul className="error-summary-list">
          {fieldErrorSummaryItems.map((item) => (
            <li key={item.field}>
              <a
                href={`#${item.inputId}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(item.inputId)?.focus();
                }}
              >
                {item.label}: {item.message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {canRetryRefresh ? (
        <button type="button" onClick={onRetryRefresh} disabled={busy}>
          Retry refresh
        </button>
      ) : null}
    </div>
  );
}

type AuditTimelinePanelProps = {
  access: StudyAccess;
};

export function AuditTimelinePanel({ access }: AuditTimelinePanelProps) {
  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audit timeline</p>
          <h2 id="timeline-title">Persisted events</h2>
        </div>
        {access ? (
          <span className="muted">
            {access.auditEvents.length} event
            {access.auditEvents.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {!access || access.auditEvents.length === 0 ? (
        <p className="empty-state">No durable workflow events yet.</p>
      ) : (
        <ol className="timeline-list">
          {access.auditEvents.map((event) => (
            <li key={event.id}>
              <span className="timeline-dot" aria-hidden="true" />
              <div>
                <strong>{event.eventType}</strong>
                <span>
                  {event.fromStatus} to {event.toStatus}
                </span>
                <time dateTime={event.createdAt}>{event.createdAt}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FieldError({
  error,
  field
}: {
  error: string | null;
  field: DraftFieldName;
}) {
  return error ? (
    <span className="field-error" id={draftFieldErrorId(field)}>
      {error}
    </span>
  ) : null;
}
