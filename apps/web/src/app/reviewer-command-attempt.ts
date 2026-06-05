type ReviewerCommandAttemptName =
  | "startReview"
  | "approveRequest"
  | "rejectRequest";

type ReviewerCommandAttemptInput = {
  commandName: ReviewerCommandAttemptName;
  payloadFingerprint: string;
  requestId: string;
};

export type ReviewerCommandAttempt = ReviewerCommandAttemptInput & {
  idempotencyKey: string;
};

type ReviewerCommandAttemptDetail = {
  request: {
    id: string;
    status: string;
  };
} | null;

const isSameAttempt = (
  attempt: ReviewerCommandAttempt,
  input: ReviewerCommandAttemptInput
) =>
  attempt.commandName === input.commandName &&
  attempt.payloadFingerprint === input.payloadFingerprint &&
  attempt.requestId === input.requestId;

export const getOrCreateReviewerCommandAttempt = (
  currentAttempt: ReviewerCommandAttempt | null,
  input: ReviewerCommandAttemptInput,
  createClientId: () => string
): ReviewerCommandAttempt => {
  if (currentAttempt && isSameAttempt(currentAttempt, input)) {
    return currentAttempt;
  }

  return {
    ...input,
    idempotencyKey: `${input.commandName}-${createClientId()}`
  };
};

export const isReviewerCommandAttemptConfirmed = (
  currentAttempt: ReviewerCommandAttempt | null,
  detail: ReviewerCommandAttemptDetail
): boolean =>
  Boolean(
    currentAttempt &&
      detail?.request.id === currentAttempt.requestId &&
      ((currentAttempt.commandName === "startReview" &&
        detail.request.status === "under_review") ||
        (currentAttempt.commandName === "approveRequest" &&
        detail.request.status === "approved") ||
        (currentAttempt.commandName === "rejectRequest" &&
          detail.request.status === "rejected"))
  );

export const reconcileReviewerCommandAttempt = (
  currentAttempt: ReviewerCommandAttempt | null,
  detail: ReviewerCommandAttemptDetail
): ReviewerCommandAttempt | null => {
  if (!currentAttempt) {
    return null;
  }

  if (!detail || detail.request.id !== currentAttempt.requestId) {
    return null;
  }

  if (isReviewerCommandAttemptConfirmed(currentAttempt, detail)) {
    return null;
  }

  return currentAttempt;
};
