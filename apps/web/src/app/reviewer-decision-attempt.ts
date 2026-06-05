type ReviewerDecisionCommandName = "approveRequest" | "rejectRequest";

type ReviewerDecisionAttemptInput = {
  commandName: ReviewerDecisionCommandName;
  payloadFingerprint: string;
  requestId: string;
};

export type ReviewerDecisionAttempt = ReviewerDecisionAttemptInput & {
  idempotencyKey: string;
};

type ReviewerDecisionAttemptDetail = {
  request: {
    id: string;
    status: string;
  };
} | null;

const isSameAttempt = (
  attempt: ReviewerDecisionAttempt,
  input: ReviewerDecisionAttemptInput
) =>
  attempt.commandName === input.commandName &&
  attempt.payloadFingerprint === input.payloadFingerprint &&
  attempt.requestId === input.requestId;

export const getOrCreateReviewerDecisionAttempt = (
  currentAttempt: ReviewerDecisionAttempt | null,
  input: ReviewerDecisionAttemptInput,
  createClientId: () => string
): ReviewerDecisionAttempt => {
  if (currentAttempt && isSameAttempt(currentAttempt, input)) {
    return currentAttempt;
  }

  return {
    ...input,
    idempotencyKey: `${input.commandName}-${createClientId()}`
  };
};

export const isReviewerDecisionAttemptConfirmed = (
  currentAttempt: ReviewerDecisionAttempt | null,
  detail: ReviewerDecisionAttemptDetail
): boolean =>
  Boolean(
    currentAttempt &&
      detail?.request.id === currentAttempt.requestId &&
      ((currentAttempt.commandName === "approveRequest" &&
        detail.request.status === "approved") ||
        (currentAttempt.commandName === "rejectRequest" &&
          detail.request.status === "rejected"))
  );

export const reconcileReviewerDecisionAttempt = (
  currentAttempt: ReviewerDecisionAttempt | null,
  detail: ReviewerDecisionAttemptDetail
): ReviewerDecisionAttempt | null => {
  if (!currentAttempt) {
    return null;
  }

  if (!detail || detail.request.id !== currentAttempt.requestId) {
    return null;
  }

  if (isReviewerDecisionAttemptConfirmed(currentAttempt, detail)) {
    return null;
  }

  return currentAttempt;
};
