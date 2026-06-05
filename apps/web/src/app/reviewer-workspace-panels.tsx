"use client";

import type { Actor } from "./reviewer-workspace-model";
import {
  compactId,
  type ReviewerInboxItem,
  type ReviewerStudyAccessDetail
} from "./reviewer-workspace-model";
import { demoAccounts } from "./session-client";

type ReviewerHeaderProps = {
  actor: Actor | null;
  busy: boolean;
  onSignOut: () => void;
};

export function ReviewerHeader({
  actor,
  busy,
  onSignOut
}: ReviewerHeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">AccessFlow</p>
        <h1>Reviewer queue</h1>
      </div>
      <div className="session-pill">
        {actor ? (
          <>
            <span>
              {actor.email} · {actor.role}
            </span>
            <button type="button" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <span>No active reviewer session</span>
        )}
      </div>
    </header>
  );
}

type ReviewerAuthPanelProps = {
  authEmail: string;
  authPassword: string;
  busy: boolean;
  onAuthEmailChange: (value: string) => void;
  onSignIn: () => void;
};

export function ReviewerAuthPanel({
  authEmail,
  authPassword,
  busy,
  onAuthEmailChange,
  onSignIn
}: ReviewerAuthPanelProps) {
  return (
    <section className="panel auth-panel" aria-labelledby="reviewer-auth-title">
      <div>
        <p className="eyebrow">Reviewer login</p>
        <h2 id="reviewer-auth-title">Sign in with seeded reviewer access</h2>
        <p className="form-hint">
          Seeded reviewer: {demoAccounts.reviewer.email}
        </p>
      </div>

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
          onClick={onSignIn}
          disabled={busy}
        >
          Sign in
        </button>
      </div>
    </section>
  );
}

type ReviewerInboxPanelProps = {
  busy: boolean;
  inbox: ReviewerInboxItem[];
  selectedRequestId: string;
  onSelectRequest: (requestId: string) => void;
};

export function ReviewerInboxPanel({
  busy,
  inbox,
  selectedRequestId,
  onSelectRequest
}: ReviewerInboxPanelProps) {
  return (
    <section className="panel reviewer-inbox" aria-labelledby="reviewer-inbox-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reviewer inbox</p>
          <h2 id="reviewer-inbox-title">Requests for review</h2>
        </div>
        <span className="muted">
          {inbox.length} request{inbox.length === 1 ? "" : "s"}
        </span>
      </div>

      {inbox.length === 0 ? (
        <p className="empty-state">No requests are waiting for review.</p>
      ) : (
        <ol className="reviewer-list">
          {inbox.map((item) => (
            <li key={item.request.id}>
              <button
                type="button"
                className={
                  item.request.id === selectedRequestId
                    ? "reviewer-list-button selected"
                    : "reviewer-list-button"
                }
                aria-current={
                  item.request.id === selectedRequestId ? "true" : undefined
                }
                onClick={() => {
                  if (item.request.id !== selectedRequestId) {
                    onSelectRequest(item.request.id);
                  }
                }}
                disabled={busy}
              >
                <span>
                  <strong>{item.study.displayName}</strong>
                  <span>{item.requester.email}</span>
                </span>
                <span className={`status-badge status-${item.request.status}`}>
                  {item.request.status}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type ReviewerDetailPanelProps = {
  busy: boolean;
  detail: ReviewerStudyAccessDetail;
  rejectionReason: string;
  onApproveRequest: () => void;
  onRejectRequest: () => void;
  onRejectionReasonChange: (value: string) => void;
  onStartReview: () => void;
};

export function ReviewerDetailPanel({
  busy,
  detail,
  rejectionReason,
  onApproveRequest,
  onRejectRequest,
  onRejectionReasonChange,
  onStartReview
}: ReviewerDetailPanelProps) {
  return (
    <section className="panel reviewer-detail" aria-labelledby="reviewer-detail-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Review detail</p>
          <h2 id="reviewer-detail-title">Request record</h2>
        </div>
        {detail ? (
          <span className="muted">#{compactId(detail.request.id)}</span>
        ) : null}
      </div>

      {!detail ? (
        <p className="empty-state">Select a submitted request to inspect it.</p>
      ) : (
        <div className="reviewer-detail-grid">
          <dl className="meta-list">
            <div>
              <dt>Study</dt>
              <dd>{detail.study.displayName}</dd>
            </div>
            <div>
              <dt>Requester</dt>
              <dd>{detail.requester.email}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{detail.request.status}</dd>
            </div>
            <div>
              <dt>Requested role</dt>
              <dd>{detail.request.requestedRole}</dd>
            </div>
          </dl>

          <dl className="field-list">
            <div>
              <dt>Purpose</dt>
              <dd>{detail.draft?.purpose ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Justification</dt>
              <dd>{detail.draft?.justification ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Affiliation</dt>
              <dd>{detail.draft?.affiliation ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Supporting notes</dt>
              <dd>{detail.draft?.supportingNotes ?? "Not provided"}</dd>
            </div>
            {detail.request.decisionNote ? (
              <div>
                <dt>Decision note</dt>
                <dd>{detail.request.decisionNote}</dd>
              </div>
            ) : null}
          </dl>

          <div className="submitted-note">
            Submitted at {detail.request.submittedAt}
          </div>

          <div className="reviewer-actions" aria-label="Reviewer actions">
            {detail.request.status === "submitted" ? (
              <button
                type="button"
                className="primary-button"
                onClick={onStartReview}
                disabled={busy}
              >
                Start review
              </button>
            ) : null}

            {detail.request.status === "under_review" ? (
              <>
                <button
                  type="button"
                  className="primary-button"
                  onClick={onApproveRequest}
                  disabled={busy}
                >
                  Approve request
                </button>
                <label className="decision-note-field">
                  Rejection reason
                  <textarea
                    value={rejectionReason}
                    onChange={(event) =>
                      onRejectionReasonChange(event.target.value)
                    }
                    disabled={busy}
                    rows={4}
                    maxLength={1000}
                  />
                </label>
                <button
                  type="button"
                  className="danger-button"
                  onClick={onRejectRequest}
                  disabled={busy}
                >
                  Reject request
                </button>
              </>
            ) : null}

            {detail.request.status === "approved" ? (
              <p className="empty-state">
                Request approved
                {detail.request.decidedAt
                  ? ` at ${detail.request.decidedAt}.`
                  : "."}
              </p>
            ) : null}

            {detail.request.status === "rejected" ? (
              <p className="empty-state">
                Request rejected
                {detail.request.decidedAt
                  ? ` at ${detail.request.decidedAt}.`
                  : "."}
              </p>
            ) : null}

            {detail.request.status === "withdrawn" ? (
              <p className="empty-state">Request withdrawn by requester.</p>
            ) : null}

            {detail.request.status !== "submitted" &&
            detail.request.status !== "under_review" &&
            detail.request.status !== "approved" &&
            detail.request.status !== "rejected" &&
            detail.request.status !== "withdrawn" ? (
              <p className="empty-state">No reviewer action is available.</p>
            ) : (
              null
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type ReviewerTimelinePanelProps = {
  detail: ReviewerStudyAccessDetail;
};

export function ReviewerTimelinePanel({ detail }: ReviewerTimelinePanelProps) {
  return (
    <section className="panel timeline-panel" aria-labelledby="reviewer-timeline-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audit timeline</p>
          <h2 id="reviewer-timeline-title">Persisted events</h2>
        </div>
        {detail ? (
          <span className="muted">
            {detail.auditEvents.length} event
            {detail.auditEvents.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {!detail || detail.auditEvents.length === 0 ? (
        <p className="empty-state">No durable workflow events selected.</p>
      ) : (
        <ol className="timeline-list">
          {detail.auditEvents.map((event) => (
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
