"use client";

import { useEffect, useMemo, useState } from "react";

import {
  authErrorMessageFromBody,
  authErrorMessageFromCaught
} from "./auth-errors";
import {
  commandExceptionError,
  commandReloadError,
  refreshRetryError
} from "./requester-command-errors";
import { trpc } from "../trpc/client";

type Actor = {
  id: string;
  email: string;
  role: "requester" | "reviewer" | "admin";
};

type Study = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription: string;
  sensitivityLabel: string;
};

type DraftForm = {
  purpose: string;
  requestedRole: "" | "viewer" | "analyst";
  justification: string;
  affiliation: string;
  supportingNotes: string;
};

type AppError = {
  code: string;
  message: string;
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

type StudyAccess = Awaited<
  ReturnType<(typeof trpc)["myStudyAccess"]["query"]>
>;

type CommandResponse<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: AppError;
    };

const emptyDraftForm: DraftForm = {
  purpose: "",
  requestedRole: "",
  justification: "",
  affiliation: "",
  supportingNotes: ""
};

const apiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const authPassword = "development-password";

const createClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const requestJson = async (
  path: "sign-up/email" | "sign-in/email" | "sign-out",
  payload: Record<string, unknown>
) => {
  const response = await fetch(`${apiBaseUrl()}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(authErrorMessageFromBody(text, response.status));
  }
};

const toDraftForm = (access: StudyAccess): DraftForm => ({
  purpose: access?.draft?.purpose ?? "",
  requestedRole:
    access?.draft?.requestedRole === "viewer" ||
    access?.draft?.requestedRole === "analyst"
      ? access.draft.requestedRole
      : "",
  justification: access?.draft?.justification ?? "",
  affiliation: access?.draft?.affiliation ?? "",
  supportingNotes: access?.draft?.supportingNotes ?? ""
});

const compactId = (value: string) => value.slice(0, 8);

const firstFieldError = (
  fieldErrors: Record<string, string[]> | undefined,
  field: keyof DraftForm
) => fieldErrors?.[field]?.[0] ?? null;

export function RequesterWorkspace() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string>("");
  const [access, setAccess] = useState<StudyAccess>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>(emptyDraftForm);
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("AccessFlow Requester");
  const [busy, setBusy] = useState<string | null>("Loading workspace");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [canRetryRefresh, setCanRetryRefresh] = useState(false);

  useEffect(() => {
    setAuthEmail(`requester-${createClientId()}@example.test`);
  }, []);

  const selectedStudy = useMemo(
    () => studies.find((study) => study.id === selectedStudyId) ?? null,
    [selectedStudyId, studies]
  );

  const draftId = access?.draft?.id ?? null;
  const isDraft = access?.request.status === "draft";
  const isSubmitted = access?.request.status === "submitted";

  const loadWorkspace = async () => {
    setBusy("Loading workspace");
    setError(null);
    setAuthError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const currentActor = await trpc.me.query();
      setActor(currentActor);

      if (!currentActor) {
        setStudies([]);
        setSelectedStudyId("");
        setAccess(null);
        setDraftForm(emptyDraftForm);
        return;
      }

      const nextStudies = await trpc.studies.query();
      setStudies(nextStudies);

      const nextStudyId = selectedStudyId || nextStudies[0]?.id || "";
      setSelectedStudyId(nextStudyId);

      if (!nextStudyId) {
        setAccess(null);
        setDraftForm(emptyDraftForm);
        return;
      }

      const nextAccess = await trpc.myStudyAccess.query({
        studyId: nextStudyId
      });
      setAccess(nextAccess);
      setDraftForm(toDraftForm(nextAccess));
    } catch (caught) {
      setAuthError(
        caught instanceof Error ? caught.message : "Workspace could not load"
      );
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const selectStudy = async (studyId: string) => {
    setSelectedStudyId(studyId);
    setBusy("Loading request");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const nextAccess = await trpc.myStudyAccess.query({ studyId });
      setAccess(nextAccess);
      setDraftForm(toDraftForm(nextAccess));
    } catch (caught) {
      setAuthError(
        caught instanceof Error ? caught.message : "Request could not load"
      );
    } finally {
      setBusy(null);
    }
  };

  const authenticate = async (mode: "sign-up/email" | "sign-in/email") => {
    setBusy(mode === "sign-up/email" ? "Creating account" : "Signing in");
    setError(null);
    setAuthError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      await requestJson(mode, {
        name: authName,
        email: authEmail,
        password: authPassword
      });
      await loadWorkspace();
      setNotice(
        mode === "sign-up/email"
          ? "Signed up with a requester session."
          : "Signed in with a requester session."
      );
    } catch (caught) {
      setAuthError(authErrorMessageFromCaught(caught, "Auth failed"));
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy("Signing out");
    setError(null);
    setAuthError(null);
    setCanRetryRefresh(false);

    try {
      await requestJson("sign-out", {});
      await loadWorkspace();
    } catch (caught) {
      setAuthError(authErrorMessageFromCaught(caught, "Sign out failed"));
    } finally {
      setBusy(null);
    }
  };

  const reloadSelectedStudyAccess = async () => {
    if (!selectedStudyId) {
      return;
    }

    const nextAccess = await trpc.myStudyAccess.query({
      studyId: selectedStudyId
    });
    setAccess(nextAccess);
    setDraftForm(toDraftForm(nextAccess));
  };

  const refreshAfterCommand = async (
    reloadError: AppError,
    nextNotice: string
  ) => {
    try {
      await reloadSelectedStudyAccess();
      setCanRetryRefresh(false);
      setNotice(nextNotice);
    } catch {
      setError(reloadError);
      setCanRetryRefresh(true);
    }
  };

  const retrySelectedStudyRefresh = async () => {
    setBusy("Refreshing workspace");
    setError(null);
    setNotice(null);

    try {
      await reloadSelectedStudyAccess();
      setCanRetryRefresh(false);
      setNotice("Workspace refreshed.");
    } catch {
      setError(refreshRetryError());
      setCanRetryRefresh(true);
    } finally {
      setBusy(null);
    }
  };

  const createDraft = async () => {
    if (!selectedStudyId) {
      return;
    }

    setBusy("Creating draft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = (await trpc.createDraft.mutate({
        studyId: selectedStudyId
      })) as CommandResponse<{ draftId: string }>;

      if (!response.ok) {
        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        commandReloadError("createDraft"),
        `Draft ${compactId(response.value.draftId)} created.`
      );
    } catch {
      setError(commandExceptionError("createDraft"));
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (!draftId) {
      return;
    }

    setBusy("Saving draft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = (await trpc.saveDraft.mutate({
        draftId,
        ...draftForm,
        requestedRole: draftForm.requestedRole || null
      })) as CommandResponse<{ draftId: string }>;

      if (!response.ok) {
        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        commandReloadError("saveDraft"),
        `Draft ${compactId(response.value.draftId)} saved.`
      );
    } catch {
      setError(commandExceptionError("saveDraft"));
    } finally {
      setBusy(null);
    }
  };

  const submitRequest = async () => {
    if (!draftId) {
      return;
    }

    setBusy("Submitting request");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = (await trpc.submitRequest.mutate({
        draftId,
        idempotencyKey: `submit-${createClientId()}`,
        ...draftForm,
        requestedRole: draftForm.requestedRole || null
      })) as CommandResponse<{ requestId: string }>;

      if (!response.ok) {
        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        commandReloadError("submitRequest"),
        `Request ${compactId(response.value.requestId)} submitted.`
      );
    } catch {
      setError(commandExceptionError("submitRequest"));
    } finally {
      setBusy(null);
    }
  };

  const updateDraft = (field: keyof DraftForm, value: string) => {
    setDraftForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AccessFlow</p>
          <h1>Study access request</h1>
        </div>
        <div className="session-pill">
          {actor ? (
            <>
              <span>{actor.email}</span>
              <button type="button" onClick={signOut} disabled={Boolean(busy)}>
                Sign out
              </button>
            </>
          ) : (
            <span>No active session</span>
          )}
        </div>
      </header>

      {busy ? <p className="status-line">{busy}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {authError ? <p className="error-banner">{authError}</p> : null}

      {!actor ? (
        <section className="panel auth-panel" aria-labelledby="auth-title">
          <div>
            <p className="eyebrow">Requester login</p>
            <h2 id="auth-title">Start with a real local session</h2>
          </div>

          <label>
            Name
            <input
              value={authName}
              onChange={(event) => setAuthName(event.target.value)}
              autoComplete="name"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
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
              onClick={() => void authenticate("sign-up/email")}
              disabled={Boolean(busy)}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => void authenticate("sign-in/email")}
              disabled={Boolean(busy)}
            >
              Sign in
            </button>
          </div>
        </section>
      ) : (
        <div className="workspace-grid">
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
                  onChange={(event) => void selectStudy(event.target.value)}
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
                onClick={() => void createDraft()}
                disabled={Boolean(busy) || canRetryRefresh}
              >
                Create request draft
              </button>
            ) : null}
          </section>

          <section className="panel request-panel" aria-labelledby="request-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Requester form</p>
                <h2 id="request-title">Access request</h2>
              </div>
              {access?.request.id ? (
                <span className="muted">#{compactId(access.request.id)}</span>
              ) : null}
            </div>

            {error ? (
              <div className="command-error" role="alert">
                <strong>{error.code}</strong>
                <span>{error.message}</span>
                {error.formErrors?.map((formError) => (
                  <span key={formError}>{formError}</span>
                ))}
                {canRetryRefresh ? (
                  <button
                    type="button"
                    onClick={() => void retrySelectedStudyRefresh()}
                    disabled={Boolean(busy)}
                  >
                    Retry refresh
                  </button>
                ) : null}
              </div>
            ) : null}

            {!access ? (
              <p className="empty-state">
                Create a draft to start the requester workflow.
              </p>
            ) : (
              <form
                className="request-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRequest();
                }}
              >
                <label>
                  Purpose
                  <textarea
                    value={draftForm.purpose}
                    onChange={(event) => updateDraft("purpose", event.target.value)}
                    disabled={!isDraft}
                    rows={4}
                  />
                  <FieldError error={firstFieldError(error?.fieldErrors, "purpose")} />
                </label>

                <label>
                  Requested role
                  <select
                    value={draftForm.requestedRole}
                    onChange={(event) =>
                      updateDraft("requestedRole", event.target.value)
                    }
                    disabled={!isDraft}
                  >
                    <option value="">Select role</option>
                    <option value="viewer">Viewer</option>
                    <option value="analyst">Analyst</option>
                  </select>
                  <FieldError
                    error={firstFieldError(error?.fieldErrors, "requestedRole")}
                  />
                </label>

                <label>
                  Justification
                  <textarea
                    value={draftForm.justification}
                    onChange={(event) =>
                      updateDraft("justification", event.target.value)
                    }
                    disabled={!isDraft}
                    rows={4}
                  />
                  <FieldError
                    error={firstFieldError(error?.fieldErrors, "justification")}
                  />
                </label>

                <label>
                  Affiliation
                  <input
                    value={draftForm.affiliation}
                    onChange={(event) =>
                      updateDraft("affiliation", event.target.value)
                    }
                    disabled={!isDraft}
                  />
                  <FieldError
                    error={firstFieldError(error?.fieldErrors, "affiliation")}
                  />
                </label>

                <label>
                  Supporting notes
                  <textarea
                    value={draftForm.supportingNotes}
                    onChange={(event) =>
                      updateDraft("supportingNotes", event.target.value)
                    }
                    disabled={!isDraft}
                    rows={3}
                  />
                </label>

                {isSubmitted ? (
                  <p className="submitted-note">
                    Submitted at {access.request.submittedAt}
                  </p>
                ) : null}

                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={
                      !draftId || !isDraft || Boolean(busy) || canRetryRefresh
                    }
                  >
                    Save draft
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      !draftId || !isDraft || Boolean(busy) || canRetryRefresh
                    }
                  >
                    Submit request
                  </button>
                </div>
              </form>
            )}
          </section>

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
        </div>
      )}
    </main>
  );
}

function FieldError({ error }: { error: string | null }) {
  return error ? <span className="field-error">{error}</span> : null;
}
