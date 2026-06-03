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
import {
  canEditDraftFields,
  isDraftCommandInFlight
} from "./requester-draft-edit-lock";
import {
  isRequesterOperationActive,
  requesterOperationStatus,
  type RequesterOperation
} from "./requester-operation-state";
import {
  getOrCreateSubmitAttempt,
  isSubmitAttemptConfirmedSubmitted,
  reconcileSubmitAttempt,
  type SubmitAttempt
} from "./requester-submit-attempt";
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

export type AuthMode = "sign-up/email" | "sign-in/email";

type AuthPath = AuthMode | "sign-out";

type RequestJson = (
  path: AuthPath,
  payload: Record<string, unknown>
) => Promise<void>;

type TrpcClient = typeof trpc;

type RequesterWorkspaceControllerDependencies = {
  createClientId?: () => string;
  requestJson?: RequestJson;
  trpcClient?: TrpcClient;
};

type RequesterWorkspaceControllerStateInput = {
  access: StudyAccess;
  canRetryRefresh: boolean;
  operation: RequesterOperation;
  selectedStudyId: string;
  studies: Study[];
};

export const authPassword = "development-password";

const apiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const createRequesterClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const requestAuthJson: RequestJson = async (path, payload) => {
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

export const deriveRequesterWorkspaceControllerState = ({
  access,
  canRetryRefresh,
  operation,
  selectedStudyId,
  studies
}: RequesterWorkspaceControllerStateInput) => {
  const selectedStudy =
    studies.find((study) => study.id === selectedStudyId) ?? null;
  const draftId = access?.draft?.id ?? null;
  const isDraft = access?.request.status === "draft";
  const isSubmitted = access?.request.status === "submitted";
  const operationActive = isRequesterOperationActive(operation);
  const operationStatus = requesterOperationStatus(operation);
  const draftCommandInFlight = isDraftCommandInFlight(operation);
  const draftFieldsEditable = canEditDraftFields({
    canRetryRefresh,
    operation,
    isDraft
  });

  return {
    draftCommandInFlight,
    draftFieldsEditable,
    draftId,
    isDraft,
    isSubmitted,
    operationActive,
    operationStatus,
    selectedStudy
  };
};

export function useRequesterWorkspaceController({
  createClientId = createRequesterClientId,
  requestJson = requestAuthJson,
  trpcClient = trpc
}: RequesterWorkspaceControllerDependencies = {}) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string>("");
  const [access, setAccess] = useState<StudyAccess>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>(emptyDraftForm);
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("AccessFlow Requester");
  const [operation, setOperation] =
    useState<RequesterOperation>("loadingWorkspace");
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
  }, [createClientId]);

  useEffect(() => {
    selectedStudyIdRef.current = selectedStudyId;
  }, [selectedStudyId]);

  const derived = useMemo(
    () =>
      deriveRequesterWorkspaceControllerState({
        access,
        canRetryRefresh,
        operation,
        selectedStudyId,
        studies
      }),
    [access, canRetryRefresh, operation, selectedStudyId, studies]
  );

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

    setOperation("loadingWorkspace");
    setError(null);
    setAuthError(null);
    setNotice(null);
    setCanRetryRefresh(false);
    setSubmitAttempt(null);

    try {
      const currentActor = await trpcClient.me.query();

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

      const nextStudies = await trpcClient.studies.query();

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

      const nextAccess = await trpcClient.myStudyAccess.query({
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
        setOperation("idle");
      }
    }
  }, [accessRequestGuard, applyStudyAccess, isLatestStudyRequest, trpcClient]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectStudy = async (studyId: string) => {
    const requestId = accessRequestGuard.begin();

    selectedStudyIdRef.current = studyId;
    setSelectedStudyId(studyId);
    setOperation("loadingRequest");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);
    setSubmitAttempt(null);

    try {
      const nextAccess = await trpcClient.myStudyAccess.query({ studyId });

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
        setOperation("idle");
      }
    }
  };

  const authenticate = async (mode: AuthMode) => {
    setOperation(mode === "sign-up/email" ? "creatingAccount" : "signingIn");
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
      setOperation("idle");
    }
  };

  const signOut = async () => {
    setOperation("signingOut");
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
      setOperation("idle");
    }
  };

  const reloadStudyAccess = async (
    studyId: string
  ): Promise<StudyAccess | undefined> => {
    if (!studyId || selectedStudyIdRef.current !== studyId) {
      return undefined;
    }

    const requestId = accessRequestGuard.begin();
    const nextAccess = await trpcClient.myStudyAccess.query({
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

    setOperation("refreshingWorkspace");
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
        setOperation("idle");
      }
    }
  };

  const createDraft = async () => {
    const studyId = selectedStudyIdRef.current;

    if (!studyId) {
      return;
    }

    setOperation("creatingDraft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = await trpcClient.createDraft.mutate({
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
        setOperation("idle");
      }
    }
  };

  const saveDraft = async () => {
    const studyId = selectedStudyIdRef.current;
    const draftId = derived.draftId;

    if (!draftId || !studyId) {
      return;
    }

    setOperation("savingDraft");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = await trpcClient.saveDraft.mutate({
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
        setOperation("idle");
      }
    }
  };

  const submitRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const draftId = derived.draftId;

    if (!draftId || !studyId) {
      return;
    }

    setOperation("submittingRequest");
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
      const response = await trpcClient.submitRequest.mutate({
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
        setOperation("idle");
      }
    }
  };

  const updateDraft = (field: keyof DraftForm, value: string) => {
    if (!derived.draftFieldsEditable) {
      return;
    }

    setDraftForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  return {
    access,
    actor,
    authEmail,
    authError,
    authName,
    authPassword,
    canRetryRefresh,
    draftCommandInFlight: derived.draftCommandInFlight,
    draftFieldsEditable: derived.draftFieldsEditable,
    draftForm,
    draftId: derived.draftId,
    error,
    isDraft: derived.isDraft,
    isSubmitted: derived.isSubmitted,
    notice,
    operationActive: derived.operationActive,
    operationStatus: derived.operationStatus,
    selectedStudy: derived.selectedStudy,
    selectedStudyId,
    studies,
    actions: {
      authenticate,
      createDraft,
      retrySelectedStudyRefresh,
      saveDraft,
      selectStudy,
      setAuthEmail,
      setAuthName,
      signOut,
      submitRequest,
      updateDraft
    }
  };
}
