type RequesterLifecycleCommandName = "withdrawRequest" | "reopenRequest";

type RequesterLifecycleAttemptInput = {
  commandName: RequesterLifecycleCommandName;
  requestId: string;
};

export type RequesterLifecycleAttempt = RequesterLifecycleAttemptInput & {
  idempotencyKey: string;
};

type RequesterLifecycleAttemptAccess = {
  request: {
    id: string;
    status: string;
  };
} | null;

const isSameAttempt = (
  attempt: RequesterLifecycleAttempt,
  input: RequesterLifecycleAttemptInput
) =>
  attempt.commandName === input.commandName &&
  attempt.requestId === input.requestId;

export const getOrCreateRequesterLifecycleAttempt = (
  currentAttempt: RequesterLifecycleAttempt | null,
  input: RequesterLifecycleAttemptInput,
  createClientId: () => string
): RequesterLifecycleAttempt => {
  if (currentAttempt && isSameAttempt(currentAttempt, input)) {
    return currentAttempt;
  }

  return {
    ...input,
    idempotencyKey: `${input.commandName}-${createClientId()}`
  };
};

export const isRequesterLifecycleAttemptConfirmed = (
  currentAttempt: RequesterLifecycleAttempt | null,
  access: RequesterLifecycleAttemptAccess
): boolean =>
  Boolean(
    currentAttempt &&
      access?.request.id === currentAttempt.requestId &&
      ((currentAttempt.commandName === "withdrawRequest" &&
        access.request.status === "withdrawn") ||
        (currentAttempt.commandName === "reopenRequest" &&
          access.request.status === "draft"))
  );

export const reconcileRequesterLifecycleAttempt = (
  currentAttempt: RequesterLifecycleAttempt | null,
  access: RequesterLifecycleAttemptAccess
): RequesterLifecycleAttempt | null => {
  if (!currentAttempt) {
    return null;
  }

  if (!access || access.request.id !== currentAttempt.requestId) {
    return null;
  }

  if (isRequesterLifecycleAttemptConfirmed(currentAttempt, access)) {
    return null;
  }

  return currentAttempt;
};
