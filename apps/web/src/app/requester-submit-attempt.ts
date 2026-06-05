import type { StudyAccessRequestStatus } from "@accessflow/workflow";

export type SubmitAttempt = {
  draftId: string;
  idempotencyKey: string;
};

type SubmitAttemptStudyAccess = {
  request: {
    status: StudyAccessRequestStatus;
  };
  draft: {
    id: string;
  } | null;
} | null;

const submitConfirmedStatuses: readonly StudyAccessRequestStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "rejected"
];

export const getOrCreateSubmitAttempt = (
  currentAttempt: SubmitAttempt | null,
  draftId: string,
  createClientId: () => string
): SubmitAttempt => {
  if (currentAttempt?.draftId === draftId) {
    return currentAttempt;
  }

  return {
    draftId,
    idempotencyKey: `submit-${createClientId()}`
  };
};

export const reconcileSubmitAttempt = (
  currentAttempt: SubmitAttempt | null,
  access: SubmitAttemptStudyAccess
): SubmitAttempt | null => {
  if (!currentAttempt) {
    return null;
  }

  if (isSubmitAttemptConfirmedSubmitted(currentAttempt, access)) {
    return null;
  }

  if (access?.draft && access.draft.id !== currentAttempt.draftId) {
    return null;
  }

  return currentAttempt;
};

export const isSubmitAttemptConfirmedSubmitted = (
  currentAttempt: SubmitAttempt | null,
  access: SubmitAttemptStudyAccess
): boolean =>
  Boolean(
    currentAttempt &&
      access &&
      submitConfirmedStatuses.includes(access.request.status) &&
      access.draft?.id === currentAttempt.draftId
  );
