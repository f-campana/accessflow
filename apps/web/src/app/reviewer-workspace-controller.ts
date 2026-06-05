"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authErrorMessageFromCaught } from "./auth-errors";
import {
  authPassword,
  createClientId as createSessionClientId,
  demoAccounts,
  requestAuthJson,
  type RequestAuthJson
} from "./session-client";
import {
  getOrCreateReviewerDecisionAttempt,
  reconcileReviewerDecisionAttempt,
  type ReviewerDecisionAttempt
} from "./reviewer-decision-attempt";
import {
  reviewerOperationStatus,
  type Actor,
  type ReviewerInboxItem,
  type ReviewerOperation,
  type ReviewerStudyAccessDetail
} from "./reviewer-workspace-model";
import { trpc } from "../trpc/client";

type TrpcClient = typeof trpc;

type ReviewerWorkspaceControllerDependencies = {
  createClientId?: () => string;
  requestJson?: RequestAuthJson;
  trpcClient?: TrpcClient;
};

const loadErrorCopy = "Reviewer workspace could not load.";
const detailErrorCopy = "Request detail could not load.";
const commandFallbackCopy = {
  startReview: "Review could not start.",
  approveRequest: "Request could not be approved.",
  rejectRequest: "Request could not be rejected."
} as const;
const commandRefreshFailureCopy = {
  approveRequest:
    "Request was approved, but the reviewer workspace could not refresh. Refresh before continuing.",
  rejectRequest:
    "Request was rejected, but the reviewer workspace could not refresh. Refresh before continuing."
} as const;

const canReview = (actor: Actor | null) =>
  actor?.role === "reviewer" || actor?.role === "admin";

type ReviewerCommandResponse = Awaited<
  | ReturnType<TrpcClient["startReview"]["mutate"]>
  | ReturnType<TrpcClient["approveRequest"]["mutate"]>
  | ReturnType<TrpcClient["rejectRequest"]["mutate"]>
>;
type ReviewerCommandError = Extract<
  ReviewerCommandResponse,
  { ok: false }
>["error"];
type ReviewerCommandName = keyof typeof commandFallbackCopy;

const reviewerCommandErrorMessage = (
  commandName: ReviewerCommandName,
  error: ReviewerCommandError
) => {
  switch (error.code) {
    case "Forbidden":
      return "Reviewer access required.";
    case "NotFound":
      return "Request not found.";
    case "InvalidTransition":
      return commandName === "startReview"
        ? "Only submitted requests can enter review."
        : "Only under-review requests can be decided.";
    case "Conflict":
      return "Request changed before the reviewer action completed.";
    case "ValidationError":
      return (
        error.fieldErrors.reason?.[0] ?? "Reviewer command input was invalid."
      );
    case "Unauthorized":
    case "IdempotencyConflict":
    case "Unexpected":
      return commandFallbackCopy[commandName];
  }
};

type ReviewerLoadResult = "signed-out" | "forbidden" | "ready" | "error";

export function useReviewerWorkspaceController({
  createClientId = createSessionClientId,
  requestJson = requestAuthJson,
  trpcClient = trpc
}: ReviewerWorkspaceControllerDependencies = {}) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [authEmail, setAuthEmail] = useState<string>(demoAccounts.reviewer.email);
  const [inbox, setInbox] = useState<ReviewerInboxItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState<ReviewerStudyAccessDetail>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [operation, setOperation] =
    useState<ReviewerOperation>("loadingWorkspace");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionAttempt, setDecisionAttempt] =
    useState<ReviewerDecisionAttempt | null>(null);

  const operationStatus = useMemo(
    () => reviewerOperationStatus(operation),
    [operation]
  );
  const operationActive = operation !== "idle";

  const loadDetail = useCallback(
    async (requestId: string) => {
      if (!requestId) {
        setDetail(null);
        setSelectedRequestId("");
        setRejectionReason("");
        return;
      }

      setOperation("loadingDetail");
      setError(null);

      try {
        const nextDetail = await trpcClient.reviewerStudyAccessDetail.query({
          requestId
        });
        setSelectedRequestId(requestId);
        setDetail(nextDetail);
        setRejectionReason("");
        setDecisionAttempt((currentAttempt) =>
          reconcileReviewerDecisionAttempt(currentAttempt, nextDetail)
        );
      } catch {
        setError(detailErrorCopy);
      } finally {
        setOperation("idle");
      }
    },
    [trpcClient]
  );

  const loadWorkspace = useCallback(async (): Promise<ReviewerLoadResult> => {
    setOperation("loadingWorkspace");
    setError(null);
    setNotice(null);

    try {
      const currentActor = await trpcClient.me.query();
      setActor(currentActor);

      if (!currentActor) {
        setInbox([]);
        setSelectedRequestId("");
        setDetail(null);
        setRejectionReason("");
        setDecisionAttempt(null);
        return "signed-out";
      }

      if (!canReview(currentActor)) {
        setInbox([]);
        setSelectedRequestId("");
        setDetail(null);
        setRejectionReason("");
        setDecisionAttempt(null);
        setError("Reviewer access required.");
        return "forbidden";
      }

      const nextInbox = await trpcClient.reviewerInbox.query();
      setInbox(nextInbox);

      const nextSelectedRequestId = nextInbox[0]?.request.id ?? "";

      if (!nextSelectedRequestId) {
        setSelectedRequestId("");
        setDetail(null);
        setRejectionReason("");
        setDecisionAttempt(null);
        return "ready";
      }

      const nextDetail = await trpcClient.reviewerStudyAccessDetail.query({
        requestId: nextSelectedRequestId
      });
      setSelectedRequestId(nextSelectedRequestId);
      setDetail(nextDetail);
      setRejectionReason("");
      setDecisionAttempt((currentAttempt) =>
        reconcileReviewerDecisionAttempt(currentAttempt, nextDetail)
      );
      return "ready";
    } catch {
      setError(loadErrorCopy);
      return "error";
    } finally {
      setOperation("idle");
    }
  }, [trpcClient]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const signIn = async () => {
    setOperation("signingIn");
    setError(null);
    setNotice(null);

    try {
      await requestJson("sign-in/email", {
        email: authEmail.trim().toLowerCase(),
        password: authPassword
      });
      const result = await loadWorkspace();

      if (result === "ready") {
        setNotice("Signed in with reviewer access.");
      }
    } catch (caught) {
      setError(authErrorMessageFromCaught(caught, "Sign in failed"));
    } finally {
      setOperation("idle");
    }
  };

  const signOut = async () => {
    setOperation("signingOut");
    setError(null);
    setNotice(null);

    try {
      await requestJson("sign-out", {});
      setActor(null);
      setInbox([]);
      setSelectedRequestId("");
      setDetail(null);
      setRejectionReason("");
      setDecisionAttempt(null);
      setNotice("Signed out.");
    } catch (caught) {
      setError(authErrorMessageFromCaught(caught, "Sign out failed"));
    } finally {
      setOperation("idle");
    }
  };

  const startReview = useCallback(async () => {
    if (!detail) {
      return;
    }

    const requestId = detail.request.id;

    setOperation("startingReview");
    setError(null);
    setNotice(null);

    try {
      const result = await trpcClient.startReview.mutate({ requestId });

      if (!result.ok) {
        setError(reviewerCommandErrorMessage("startReview", result.error));
        return;
      }

      const [nextInbox, nextDetail] = await Promise.all([
        trpcClient.reviewerInbox.query(),
        trpcClient.reviewerStudyAccessDetail.query({ requestId })
      ]);

      setInbox(nextInbox);
      setSelectedRequestId(requestId);
      setDetail(nextDetail);
      setRejectionReason("");
      setNotice("Review started.");
    } catch {
      setError(commandFallbackCopy.startReview);
    } finally {
      setOperation("idle");
    }
  }, [detail, trpcClient]);

  const refreshReviewerState = useCallback(
    async (requestId: string) => {
      const [nextInbox, nextDetail] = await Promise.all([
        trpcClient.reviewerInbox.query(),
        trpcClient.reviewerStudyAccessDetail.query({ requestId })
      ]);

      setInbox(nextInbox);
      setSelectedRequestId(requestId);
      setDetail(nextDetail);
      setDecisionAttempt((currentAttempt) =>
        reconcileReviewerDecisionAttempt(currentAttempt, nextDetail)
      );

      return nextDetail;
    },
    [trpcClient]
  );

  const approveRequest = useCallback(async () => {
    if (!detail) {
      return;
    }

    const requestId = detail.request.id;

    setOperation("approvingRequest");
    setError(null);
    setNotice(null);

    const nextAttempt = getOrCreateReviewerDecisionAttempt(
      decisionAttempt,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId
      },
      createClientId
    );
    setDecisionAttempt(nextAttempt);

    const result = await trpcClient.approveRequest
      .mutate({
        requestId,
        idempotencyKey: nextAttempt.idempotencyKey
      })
      .catch(() => null);

    if (!result) {
      setError(commandFallbackCopy.approveRequest);
      setOperation("idle");
      return;
    }

    try {
      if (!result.ok) {
        setError(reviewerCommandErrorMessage("approveRequest", result.error));
        if (result.error.code !== "Conflict") {
          setDecisionAttempt(null);
        }
        return;
      }

      await refreshReviewerState(requestId);
      setRejectionReason("");
      setNotice("Request approved.");
    } catch {
      setError(commandRefreshFailureCopy.approveRequest);
    } finally {
      setOperation("idle");
    }
  }, [createClientId, decisionAttempt, detail, refreshReviewerState, trpcClient]);

  const rejectRequest = useCallback(async () => {
    if (!detail) {
      return;
    }

    const requestId = detail.request.id;
    const trimmedRejectionReason = rejectionReason.trim();

    setOperation("rejectingRequest");
    setError(null);
    setNotice(null);

    const nextAttempt = getOrCreateReviewerDecisionAttempt(
      decisionAttempt,
      {
        commandName: "rejectRequest",
        payloadFingerprint: trimmedRejectionReason,
        requestId
      },
      createClientId
    );
    setDecisionAttempt(nextAttempt);

    const result = await trpcClient.rejectRequest
      .mutate({
        requestId,
        idempotencyKey: nextAttempt.idempotencyKey,
        reason: rejectionReason
      })
      .catch(() => null);

    if (!result) {
      setError(commandFallbackCopy.rejectRequest);
      setOperation("idle");
      return;
    }

    try {
      if (!result.ok) {
        setError(reviewerCommandErrorMessage("rejectRequest", result.error));
        if (result.error.code !== "Conflict") {
          setDecisionAttempt(null);
        }
        return;
      }

      await refreshReviewerState(requestId);
      setRejectionReason("");
      setNotice("Request rejected.");
    } catch {
      setError(commandRefreshFailureCopy.rejectRequest);
    } finally {
      setOperation("idle");
    }
  }, [
    createClientId,
    decisionAttempt,
    detail,
    refreshReviewerState,
    rejectionReason,
    trpcClient
  ]);

  return {
    actor,
    authEmail,
    authPassword,
    detail,
    error,
    inbox,
    isReviewerActor: canReview(actor),
    notice,
    operationActive,
    operationStatus,
    rejectionReason,
    selectedRequestId,
    actions: {
      approveRequest,
      loadDetail,
      rejectRequest,
      refresh: loadWorkspace,
      setAuthEmail,
      setRejectionReason,
      startReview,
      signIn,
      signOut
    }
  };
}
