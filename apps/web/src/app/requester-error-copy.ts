import type { AppError } from "./requester-workspace-model";

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
