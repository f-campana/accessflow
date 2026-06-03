import type { AppError } from "./requester-workspace-model";
import { safeRequesterCommandMessages } from "./requester-command-errors";

const appErrorTitles = {
  Conflict: "Request needs attention",
  Forbidden: "Permission needed",
  IdempotencyConflict: "Retry was blocked",
  InvalidTransition: "Action is not available",
  NotFound: "Request not found",
  Unauthorized: "Sign in required",
  Unexpected: "Something went wrong",
  ValidationError: "Review the highlighted fields"
} satisfies Record<AppError["code"], string>;

export const appErrorTitle = (error: AppError) => appErrorTitles[error.code];

const commandErrorDescriptions = {
  Conflict:
    "The request changed before the action completed. Refresh the workspace and try again.",
  Forbidden: "You do not have permission to perform this action.",
  IdempotencyConflict:
    "This retry could not be accepted. Refresh the workspace before trying again.",
  InvalidTransition:
    "This action is no longer available for the current request state.",
  NotFound: "The request could not be found. Refresh the workspace.",
  Unauthorized: "Sign in again before continuing.",
  Unexpected: "The action could not finish. Try again or refresh the workspace.",
  ValidationError: "Fix the highlighted fields and try again."
} satisfies Record<AppError["code"], string>;

const safeValidationFormErrors = new Set<string>([
  "Complete the draft before submitting the access request."
]);

export const commandErrorDescription = (error: AppError): string => {
  if (
    error.code === "Unexpected" &&
    safeRequesterCommandMessages.has(error.message)
  ) {
    return error.message;
  }

  return commandErrorDescriptions[error.code];
};

export const commandErrorFormMessages = (error: AppError): string[] =>
  error.code === "ValidationError"
    ? error.formErrors.filter((formError) =>
        safeValidationFormErrors.has(formError)
      )
    : [];
