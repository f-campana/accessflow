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
  getOrCreateRequesterCommandAttempt,
  isRequesterCommandAttemptConfirmed,
  reconcileRequesterCommandAttempt,
  type RequesterCommandAttempt
} from "./requester-command-attempt";
import {
  isRequesterOperationActive,
  requesterOperationStatus,
  type RequesterOperation
} from "./requester-operation-state";
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

type RequesterCommandAction = Parameters<typeof commandExceptionError>[0];

type RequesterCommandResponse<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      error: AppError;
      ok: false;
    };

type RunRequesterCommandOptions<TValue> = {
  action: RequesterCommandAction;
  isConfirmed?: (nextAccess: StudyAccess) => boolean;
  mutate: () => Promise<RequesterCommandResponse<TValue>>;
  notice: (value: TValue) => string;
  operation: RequesterOperation;
  studyId: string;
};

export const createRequesterClientId = createSessionClientId;

export const shouldRefreshRequesterStateAfterCommandError = (error: AppError) =>
  error.code === "Conflict" || error.code === "InvalidTransition";

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
  const [commandAttempt, setCommandAttempt] =
    useState<RequesterCommandAttempt | null>(null);
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
    setCommandAttempt((currentAttempt) =>
      reconcileRequesterCommandAttempt(currentAttempt, nextAccess)
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
    setCommandAttempt(null);

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
    setCommandAttempt(null);

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
    setCommandAttempt(null);
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
          ? `Created throwaway requester ${nextEmail}. Sign in with this same email to return to its requests.`
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
    setCommandAttempt(null);
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

  const refreshAfterCommandError = async (studyId: string, error: AppError) => {
    setError(error);

    if (!shouldRefreshRequesterStateAfterCommandError(error)) {
      return;
    }

    try {
      await reloadStudyAccess(studyId);
      setCanRetryRefresh(false);
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setCanRetryRefresh(true);
    }
  };

  const runRequesterCommand = async <TValue,>({
    action,
    isConfirmed,
    mutate,
    notice: commandNotice,
    operation: nextOperation,
    studyId
  }: RunRequesterCommandOptions<TValue>) => {
    setOperation(nextOperation);
    setError(null);
    setNotice(null);
    setCanRetryRefresh(false);

    try {
      const response = await mutate();

      if (!response.ok) {
        if (selectedStudyIdRef.current !== studyId) {
          return;
        }

        await refreshAfterCommandError(studyId, response.error);
        return;
      }

      await refreshAfterCommand(
        studyId,
        commandReloadError(action),
        commandNotice(response.value),
        isConfirmed
      );
    } catch {
      if (selectedStudyIdRef.current !== studyId) {
        return;
      }

      setError(commandExceptionError(action));
    } finally {
      if (selectedStudyIdRef.current === studyId) {
        setOperation("idle");
      }
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

    await runRequesterCommand({
      action: "createDraft",
      mutate: () =>
        trpcClient.createDraft.mutate({
          studyId
        }),
      notice: (value) => `Draft ${compactId(value.draftId)} created.`,
      operation: "creatingDraft",
      studyId
    });
  };

  const saveDraft = async () => {
    const studyId = selectedStudyIdRef.current;
    const draftId = derived.draftId;

    if (!draftId || !studyId) {
      return;
    }

    await runRequesterCommand({
      action: "saveDraft",
      mutate: () =>
        trpcClient.saveDraft.mutate({
          draftId,
          ...draftForm,
          requestedRole: draftForm.requestedRole || null
        }),
      notice: (value) => `Draft ${compactId(value.draftId)} saved.`,
      operation: "savingDraft",
      studyId
    });
  };

  const submitRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const draftId = derived.draftId;

    if (!draftId || !studyId) {
      return;
    }

    const nextAttempt = getOrCreateRequesterCommandAttempt(
      commandAttempt,
      {
        commandName: "submitRequest",
        subjectId: draftId
      },
      createClientId
    );
    setCommandAttempt(nextAttempt);

    await runRequesterCommand({
      action: "submitRequest",
      isConfirmed: (nextAccess) =>
        isRequesterCommandAttemptConfirmed(nextAttempt, nextAccess),
      mutate: () =>
        trpcClient.submitRequest.mutate({
          draftId,
          idempotencyKey: nextAttempt.idempotencyKey,
          ...draftForm,
          requestedRole: draftForm.requestedRole || null
        }),
      notice: (value) =>
        `Request ${compactId(value.requestId)} submitted.`,
      operation: "submittingRequest",
      studyId
    });
  };

  const withdrawRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const requestId = access?.request.id ?? null;

    if (!requestId || !studyId) {
      return;
    }

    const nextAttempt = getOrCreateRequesterCommandAttempt(
      commandAttempt,
      {
        commandName: "withdrawRequest",
        subjectId: requestId
      },
      createClientId
    );
    setCommandAttempt(nextAttempt);

    await runRequesterCommand({
      action: "withdrawRequest",
      isConfirmed: (nextAccess) =>
        isRequesterCommandAttemptConfirmed(nextAttempt, nextAccess),
      mutate: () =>
        trpcClient.withdrawRequest.mutate({
          requestId,
          idempotencyKey: nextAttempt.idempotencyKey
        }),
      notice: (value) =>
        `Request ${compactId(value.requestId)} withdrawn.`,
      operation: "withdrawingRequest",
      studyId
    });
  };

  const reopenRejectedRequest = async () => {
    const studyId = selectedStudyIdRef.current;
    const requestId = access?.request.id ?? null;

    if (!requestId || !studyId) {
      return;
    }

    const nextAttempt = getOrCreateRequesterCommandAttempt(
      commandAttempt,
      {
        commandName: "reopenRequest",
        subjectId: requestId
      },
      createClientId
    );
    setCommandAttempt(nextAttempt);

    await runRequesterCommand({
      action: "reopenRequest",
      isConfirmed: (nextAccess) =>
        isRequesterCommandAttemptConfirmed(nextAttempt, nextAccess),
      mutate: () =>
        trpcClient.reopenRequest.mutate({
          requestId,
          idempotencyKey: nextAttempt.idempotencyKey
        }),
      notice: (value) =>
        `Request ${compactId(value.requestId)} reopened for edits.`,
      operation: "reopeningRequest",
      studyId
    });
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
