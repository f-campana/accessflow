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
      access?.request.status === "submitted" &&
      access.draft?.id === currentAttempt.draftId
  );
