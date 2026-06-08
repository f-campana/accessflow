import type { StudyAccessRequestStatus } from "@accessflow/workflow";

type RequesterCommandSubjectKind = "draft" | "request";

type RequesterCommandAttemptName =
  | "submitRequest"
  | "withdrawRequest"
  | "reopenRequest";

type RequesterCommandAttemptInput = {
  commandName: RequesterCommandAttemptName;
  subjectId: string;
};

export type RequesterCommandAttempt = RequesterCommandAttemptInput & {
  confirmedStatuses: readonly StudyAccessRequestStatus[];
  idempotencyKey: string;
  keyPrefix: string;
  subjectKind: RequesterCommandSubjectKind;
};

type RequesterCommandAttemptAccess = {
  request: {
    id: string;
    status: StudyAccessRequestStatus;
  };
  draft: {
    id: string;
  } | null;
} | null;

const requesterCommandAttemptConfig = {
  reopenRequest: {
    confirmedStatuses: ["draft"],
    keyPrefix: "reopenRequest",
    subjectKind: "request"
  },
  submitRequest: {
    confirmedStatuses: ["submitted", "under_review", "approved", "rejected"],
    keyPrefix: "submit",
    subjectKind: "draft"
  },
  withdrawRequest: {
    confirmedStatuses: ["withdrawn"],
    keyPrefix: "withdrawRequest",
    subjectKind: "request"
  }
} satisfies Record<
  RequesterCommandAttemptName,
  {
    confirmedStatuses: readonly StudyAccessRequestStatus[];
    keyPrefix: string;
    subjectKind: RequesterCommandSubjectKind;
  }
>;

const isSameAttempt = (
  attempt: RequesterCommandAttempt,
  input: RequesterCommandAttemptInput
) =>
  attempt.commandName === input.commandName &&
  attempt.subjectId === input.subjectId;

const getAttemptSubjectId = (
  attempt: RequesterCommandAttempt,
  access: RequesterCommandAttemptAccess
) => {
  if (!access) {
    return null;
  }

  return attempt.subjectKind === "draft"
    ? access.draft?.id ?? null
    : access.request.id;
};

export const getOrCreateRequesterCommandAttempt = (
  currentAttempt: RequesterCommandAttempt | null,
  input: RequesterCommandAttemptInput,
  createClientId: () => string
): RequesterCommandAttempt => {
  if (currentAttempt && isSameAttempt(currentAttempt, input)) {
    return currentAttempt;
  }

  const config = requesterCommandAttemptConfig[input.commandName];

  return {
    ...input,
    ...config,
    idempotencyKey: `${config.keyPrefix}-${createClientId()}`
  };
};

export const isRequesterCommandAttemptConfirmed = (
  currentAttempt: RequesterCommandAttempt | null,
  access: RequesterCommandAttemptAccess
): boolean =>
  Boolean(
    currentAttempt &&
      access &&
      getAttemptSubjectId(currentAttempt, access) === currentAttempt.subjectId &&
      currentAttempt.confirmedStatuses.includes(access.request.status)
  );

export const reconcileRequesterCommandAttempt = (
  currentAttempt: RequesterCommandAttempt | null,
  access: RequesterCommandAttemptAccess
): RequesterCommandAttempt | null => {
  if (!currentAttempt) {
    return null;
  }

  if (isRequesterCommandAttemptConfirmed(currentAttempt, access)) {
    return null;
  }

  const subjectId = getAttemptSubjectId(currentAttempt, access);

  if (currentAttempt.subjectKind === "request" && subjectId === null) {
    return null;
  }

  if (subjectId && subjectId !== currentAttempt.subjectId) {
    return null;
  }

  return currentAttempt;
};
