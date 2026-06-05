"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
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
  getOrCreateRequesterLifecycleAttempt,
  reconcileRequesterLifecycleAttempt,
  type RequesterLifecycleAttempt
} from "./requester-lifecycle-attempt";
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
import {
  authPassword,
  createClientId as createSessionClientId,
  demoAccounts,
  requestAuthJson,
  type AuthMode,
  type RequestAuthJson
} from "./session-client";
import { trpc } from "../trpc/client";

type TrpcClient = typeof trpc;

type RequesterWorkspaceControllerDependencies = {
  createClientId?: () => string;
  requestJson?: RequestAuthJson;
  trpcClient?: TrpcClient;
};

type RequesterWorkspaceControllerStateInput = {
  access: StudyAccess;
  canRetryRefresh: boolean;
  operation: RequesterOperation;
  selectedStudyId: string;
  studies: Study[];
};

export const createRequesterClientId = createSessionClientId;

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
  const canWithdraw =
    access?.request.status === "submitted" ||
    access?.request.status === "under_review";
  const canReopenRejected = access?.request.status === "rejected";
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
    canReopenRejected,
    canWithdraw,
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
  const [authEmail, setAuthEmail] = useState<string>(demoAccounts.requester.email);
  const [authName, setAuthName] = useState<string>(demoAccounts.requester.name);
  const [operation, setOperation] =
    useState<RequesterOperation>("loadingWorkspace");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [canRetryRefresh, setCanRetryRefresh] = useState(false);
  const [submitAttempt, setSubmitAttempt] = useState<SubmitAttempt | null>(null);
  const [lifecycleAttempt, setLifecycleAttempt] =
    useState<RequesterLifecycleAttempt | null>(null);
  const selectedStudyIdRef = useRef(selectedStudyId);
  const accessRequestGuardRef = useRef<AsyncRequestGuard | null>(null);

  if (!accessRequestGuardRef.current) {
    accessRequestGuardRef.current = createAsyncRequestGuard();
  }

  const accessRequestGuard = accessRequestGuardRef.current;

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
    setLifecycleAttempt((currentAttempt) =>
      reconcileRequesterLifecycleAttempt(currentAttempt, nextAccess)
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
    setLifecycleAttempt(null);

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
    setLifecycleAttempt(null);

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
    setLifecycleAttempt(null);
    accessRequestGuard.invalidate();

    try {
      const normalizedEmail = authEmail.trim().toLowerCase();
      const shouldGenerateNewRequester =
        mode === "sign-up/email" &&
        normalizedEmail === demoAccounts.requester.email;
      const nextEmail = shouldGenerateNewRequester
        ? `requester-${createClientId()}@example.test`
        : normalizedEmail;
      const nextName = authName.trim() || demoAccounts.requester.name;

      if (nextEmail !== authEmail) {
        setAuthEmail(nextEmail);
      }

      await requestJson(mode, {
        name: nextName,
        email: nextEmail,
        password: authPassword
      });
      await loadWorkspace();
      setNotice(
        mode === "sign-up/email"
          ? `Created requester account ${nextEmail}.`
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
    setLifecycleAttempt(null);
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

  const withdrawRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const requestId = access?.request.id ?? null;

    if (!requestId || !studyId) {
      return;
    }

    setOperation("withdrawingRequest");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    const nextAttempt = getOrCreateRequesterLifecycleAttempt(
      lifecycleAttempt,
      {
        commandName: "withdrawRequest",
        requestId
      },
      createClientId
    );
    setLifecycleAttempt(nextAttempt);

    try {
      const response = await trpcClient.withdrawRequest.mutate({
        requestId,
        idempotencyKey: nextAttempt.idempotencyKey
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
        commandReloadError("withdrawRequest"),
        `Request ${compactId(response.value.requestId)} withdrawn.`,
        (nextAccess) =>
          nextAccess?.request.id === requestId &&
          nextAccess.request.status === "withdrawn"
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError("withdrawRequest"));
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setOperation("idle");
      }
    }
  };

  const reopenRejectedRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const requestId = access?.request.id ?? null;

    if (!requestId || !studyId) {
      return;
    }

    setOperation("reopeningRequest");
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    const nextAttempt = getOrCreateRequesterLifecycleAttempt(
      lifecycleAttempt,
      {
        commandName: "reopenRequest",
        requestId
      },
      createClientId
    );
    setLifecycleAttempt(nextAttempt);

    try {
      const response = await trpcClient.reopenRequest.mutate({
        requestId,
        idempotencyKey: nextAttempt.idempotencyKey
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
        commandReloadError("reopenRequest"),
        `Request ${compactId(response.value.requestId)} reopened for edits.`,
        (nextAccess) =>
          nextAccess?.request.id === requestId &&
          nextAccess.request.status === "draft"
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError("reopenRequest"));
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
    canReopenRejected: derived.canReopenRejected,
    isDraft: derived.isDraft,
    isSubmitted: derived.isSubmitted,
    canWithdraw: derived.canWithdraw,
    notice,
    operationActive: derived.operationActive,
    operationStatus: derived.operationStatus,
    selectedStudy: derived.selectedStudy,
    selectedStudyId,
    studies,
    actions: {
      authenticate,
      createDraft,
      reopenRejectedRequest,
      retrySelectedStudyRefresh,
      saveDraft,
      selectStudy,
      setAuthEmail,
      setAuthName,
      signOut,
      submitRequest,
      withdrawRequest,
      updateDraft
    }
  };
}
