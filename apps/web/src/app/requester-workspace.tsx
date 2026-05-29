"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  authErrorMessageFromBody,
  authErrorMessageFromCaught
} from "./auth-errors";
import {
  createAsyncRequestGuard,
  type AsyncRequestGuard
} from "./requester-async-guard";
import {
  commandExceptionError,
  commandReloadError,
  refreshRetryError
} from "./requester-command-errors";
import { isDraftCommandInFlight } from "./requester-draft-edit-lock";
import {
  getOrCreateSubmitAttempt,
  isSubmitAttemptConfirmedSubmitted,
  reconcileSubmitAttempt,
  type SubmitAttempt
} from "./requester-submit-attempt";
import {
  AuthPanel,
  AuditTimelinePanel,
  RequesterHeader,
  RequestPanel,
  StudyPanel
} from "./requester-workspace-panels";
import {
  compactId,
  emptyDraftForm,
  toDraftForm,
  type Actor,
  type AppError,
  type DraftForm,
  type Study,
  type StudyAccess
} from "./requester-workspace-model";
import { trpc } from "../trpc/client";

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
  const [submitAttempt, setSubmitAttempt] = useState<SubmitAttempt | null>(null);
  const selectedStudyIdRef = useRef(selectedStudyId);
  const accessRequestGuardRef = useRef<AsyncRequestGuard | null>(null);

  if (!accessRequestGuardRef.current) {
    accessRequestGuardRef.current = createAsyncRequestGuard();
  }

  const accessRequestGuard = accessRequestGuardRef.current;

  useEffect(() => {
    setAuthEmail(`requester-${createClientId()}@example.test`);
  }, []);

  useEffect(() => {
    selectedStudyIdRef.current = selectedStudyId;
  }, [selectedStudyId]);

  const selectedStudy = useMemo(
    () => studies.find((study) => study.id === selectedStudyId) ?? null,
    [selectedStudyId, studies]
  );

  const draftId = access?.draft?.id ?? null;
  const isDraft = access?.request.status === "draft";
  const isSubmitted = access?.request.status === "submitted";
  const draftCommandInFlight = isDraftCommandInFlight(busy);

  const applyStudyAccess = useCallback((nextAccess: StudyAccess) => {
    setAccess(nextAccess);
    setDraftForm(toDraftForm(nextAccess));
    setSubmitAttempt((currentAttempt) =>
      reconcileSubmitAttempt(currentAttempt, nextAccess)
    );
  }, []);

  const isLatestStudyRequest = useCallback(
    (requestId: number, studyId: string) =>
      accessRequestGuard.isCurrent(requestId) &&
      selectedStudyIdRef.current === studyId,
    [accessRequestGuard]
  );

  const loadWorkspace = useCallback(async () => {
    const requestId = accessRequestGuard.begin();

    setBusy("Loading workspace");
    setError(null);
    setAuthError(null);
    setNotice(null);
    setCanRetryRefresh(false);
    setSubmitAttempt(null);

    try {
      const currentActor = await trpc.me.query();

      if (!accessRequestGuard.isCurrent(requestId)) {
        return;
      }

      setActor(currentActor);

      if (!currentActor) {
        setStudies([]);
        selectedStudyIdRef.current = "";
        setSelectedStudyId("");
        applyStudyAccess(null);
        return;
      }

      const nextStudies = await trpc.studies.query();

      if (!accessRequestGuard.isCurrent(requestId)) {
        return;
      }

      setStudies(nextStudies);

      const nextStudyId = selectedStudyIdRef.current || nextStudies[0]?.id || "";
      selectedStudyIdRef.current = nextStudyId;
      setSelectedStudyId(nextStudyId);

      if (!nextStudyId) {
        applyStudyAccess(null);
        return;
      }

      const nextAccess = await trpc.myStudyAccess.query({
        studyId: nextStudyId
      });

      if (!isLatestStudyRequest(requestId, nextStudyId)) {
        return;
      }

      applyStudyAccess(nextAccess);
    } catch (caught) {
      if (!accessRequestGuard.isCurrent(requestId)) {
        return;
      }

      setAuthError(
        caught instanceof Error ? caught.message : "Workspace could not load"
      );
    } finally {
      if (accessRequestGuard.isCurrent(requestId)) {
        setBusy(null);
      }
    }
  }, [accessRequestGuard, applyStudyAccess, isLatestStudyRequest]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectStudy = async (studyId: string) => {
    const requestId = accessRequestGuard.begin();

    selectedStudyIdRef.current = studyId;
    setSelectedStudyId(studyId);
    setBusy("Loading request");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);
    setSubmitAttempt(null);

    try {
      const nextAccess = await trpc.myStudyAccess.query({ studyId });

      if (!isLatestStudyRequest(requestId, studyId)) {
        return;
      }

      applyStudyAccess(nextAccess);
    } catch (caught) {
      if (!accessRequestGuard.isCurrent(requestId)) {
        return;
      }

      setAuthError(
        caught instanceof Error ? caught.message : "Request could not load"
      );
    } finally {
      if (accessRequestGuard.isCurrent(requestId)) {
        setBusy(null);
      }
    }
  };

  const authenticate = async (mode: "sign-up/email" | "sign-in/email") => {
    setBusy(mode === "sign-up/email" ? "Creating account" : "Signing in");
    setError(null);
    setAuthError(null);
    setNotice(null);
    setCanRetryRefresh(false);
    setSubmitAttempt(null);
    accessRequestGuard.invalidate();

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
    setSubmitAttempt(null);
    accessRequestGuard.invalidate();

    try {
      await requestJson("sign-out", {});
      await loadWorkspace();
    } catch (caught) {
      setAuthError(authErrorMessageFromCaught(caught, "Sign out failed"));
    } finally {
      setBusy(null);
    }
  };

  const reloadStudyAccess = async (
    studyId: string
  ): Promise<StudyAccess | undefined> => {
    if (!studyId || selectedStudyIdRef.current !== studyId) {
      return undefined;
    }

    const requestId = accessRequestGuard.begin();
    const nextAccess = await trpc.myStudyAccess.query({
      studyId
    });

    if (!isLatestStudyRequest(requestId, studyId)) {
      return undefined;
    }

    applyStudyAccess(nextAccess);
    return nextAccess;
  };

  const refreshAfterCommand = async (
    studyId: string,
    reloadError: AppError,
    nextNotice: string,
    isConfirmed: (nextAccess: StudyAccess) => boolean = () => true
  ) => {
    try {
      const nextAccess = await reloadStudyAccess(studyId);

      if (nextAccess === undefined) {
        return;
      }

      if (!isConfirmed(nextAccess)) {
        setError(reloadError);
        setCanRetryRefresh(true);
        return;
      }

      setCanRetryRefresh(false);
      setNotice(nextNotice);
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(reloadError);
      setCanRetryRefresh(true);
    }
  };

  const retrySelectedStudyRefresh = async () => {
    const studyId = selectedStudyIdRef.current;

    if (!studyId) {
      return;
    }

    setBusy("Refreshing workspace");
    setError(null);
    setNotice(null);

    try {
      const nextAccess = await reloadStudyAccess(studyId);

      if (nextAccess === undefined) {
        return;
      }

      setCanRetryRefresh(false);
      setNotice("Workspace refreshed.");
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(refreshRetryError());
      setCanRetryRefresh(true);
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setBusy(null);
      }
    }
  };

  const createDraft = async () => {
    const studyId = selectedStudyIdRef.current;

    if (!studyId) {
      return;
    }

    setBusy("Creating draft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = await trpc.createDraft.mutate({
        studyId
      });

      if (!response.ok) {
        if (selectedStudyIdRef.current !== studyId) {
          return;
        }

        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        studyId,
        commandReloadError("createDraft"),
        `Draft ${compactId(response.value.draftId)} created.`
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError("createDraft"));
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setBusy(null);
      }
    }
  };

  const saveDraft = async () => {
    const studyId = selectedStudyIdRef.current;

    if (!draftId || !studyId) {
      return;
    }

    setBusy("Saving draft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = await trpc.saveDraft.mutate({
        draftId,
        ...draftForm,
        requestedRole: draftForm.requestedRole || null
      });

      if (!response.ok) {
        if (selectedStudyIdRef.current !== studyId) {
          return;
        }

        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        studyId,
        commandReloadError("saveDraft"),
        `Draft ${compactId(response.value.draftId)} saved.`
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError("saveDraft"));
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setBusy(null);
      }
    }
  };

  const submitRequest = async () => {
    const studyId = selectedStudyIdRef.current;

    if (!draftId || !studyId) {
      return;
    }

    setBusy("Submitting request");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    const nextSubmitAttempt = getOrCreateSubmitAttempt(
      submitAttempt,
      draftId,
      createClientId
    );
    setSubmitAttempt(nextSubmitAttempt);

    try {
      const response = await trpc.submitRequest.mutate({
        draftId,
        idempotencyKey: nextSubmitAttempt.idempotencyKey,
        ...draftForm,
        requestedRole: draftForm.requestedRole || null
      });

      if (!response.ok) {
        if (selectedStudyIdRef.current !== studyId) {
          return;
        }

        setError(response.error);
        return;
      }

      await refreshAfterCommand(
        studyId,
        commandReloadError("submitRequest"),
        `Request ${compactId(response.value.requestId)} submitted.`,
        (nextAccess) =>
          isSubmitAttemptConfirmedSubmitted(nextSubmitAttempt, nextAccess)
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError("submitRequest"));
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setBusy(null);
      }
    }
  };

  const updateDraft = (field: keyof DraftForm, value: string) => {
    if (draftCommandInFlight) {
      return;
    }

    setDraftForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  return (
    <main className="app-shell">
      <RequesterHeader
        actor={actor}
        busy={Boolean(busy)}
        onSignOut={() => void signOut()}
      />

      {busy ? <p className="status-line">{busy}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {authError ? (
        <p className="error-banner" role="alert">
          {authError}
        </p>
      ) : null}

      {!actor ? (
        <AuthPanel
          authEmail={authEmail}
          authName={authName}
          authPassword={authPassword}
          busy={Boolean(busy)}
          onAuthenticate={(mode) => void authenticate(mode)}
          onAuthEmailChange={setAuthEmail}
          onAuthNameChange={setAuthName}
        />
      ) : (
        <div className="workspace-grid">
          <StudyPanel
            access={access}
            busy={Boolean(busy)}
            canRetryRefresh={canRetryRefresh}
            selectedStudy={selectedStudy}
            selectedStudyId={selectedStudyId}
            studies={studies}
            onCreateDraft={() => void createDraft()}
            onSelectStudy={(studyId) => void selectStudy(studyId)}
          />
          <RequestPanel
            access={access}
            busy={Boolean(busy)}
            canRetryRefresh={canRetryRefresh}
            draftCommandInFlight={draftCommandInFlight}
            draftForm={draftForm}
            draftId={draftId}
            error={error}
            isDraft={isDraft}
            isSubmitted={isSubmitted}
            onRetryRefresh={() => void retrySelectedStudyRefresh()}
            onSaveDraft={() => void saveDraft()}
            onSubmitRequest={() => void submitRequest()}
            onUpdateDraft={updateDraft}
          />
          <AuditTimelinePanel access={access} />
        </div>
      )}
    </main>
  );
}
