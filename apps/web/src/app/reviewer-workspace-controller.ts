"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authErrorMessageFromCaught } from "./auth-errors";
import {
  authPassword,
  demoAccounts,
  requestAuthJson,
  type RequestAuthJson
} from "./session-client";
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
  requestJson?: RequestAuthJson;
  trpcClient?: TrpcClient;
};

const loadErrorCopy = "Reviewer workspace could not load.";
const detailErrorCopy = "Request detail could not load.";

const canReview = (actor: Actor | null) =>
  actor?.role === "reviewer" || actor?.role === "admin";

type ReviewerLoadResult = "signed-out" | "forbidden" | "ready" | "error";

export function useReviewerWorkspaceController({
  requestJson = requestAuthJson,
  trpcClient = trpc
}: ReviewerWorkspaceControllerDependencies = {}) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [authEmail, setAuthEmail] = useState<string>(demoAccounts.reviewer.email);
  const [inbox, setInbox] = useState<ReviewerInboxItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState<ReviewerStudyAccessDetail>(null);
  const [operation, setOperation] =
    useState<ReviewerOperation>("loadingWorkspace");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        return "signed-out";
      }

      if (!canReview(currentActor)) {
        setInbox([]);
        setSelectedRequestId("");
        setDetail(null);
        setError("Reviewer access required.");
        return "forbidden";
      }

      const nextInbox = await trpcClient.reviewerInbox.query();
      setInbox(nextInbox);

      const nextSelectedRequestId = nextInbox[0]?.request.id ?? "";

      if (!nextSelectedRequestId) {
        setSelectedRequestId("");
        setDetail(null);
        return "ready";
      }

      const nextDetail = await trpcClient.reviewerStudyAccessDetail.query({
        requestId: nextSelectedRequestId
      });
      setSelectedRequestId(nextSelectedRequestId);
      setDetail(nextDetail);
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
      setNotice("Signed out.");
    } catch (caught) {
      setError(authErrorMessageFromCaught(caught, "Sign out failed"));
    } finally {
      setOperation("idle");
    }
  };

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
    selectedRequestId,
    actions: {
      loadDetail,
      refresh: loadWorkspace,
      setAuthEmail,
      signIn,
      signOut
    }
  };
}
