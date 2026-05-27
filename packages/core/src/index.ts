import { z } from "zod";

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error
});

export const appErrorCodes = [
  "ValidationError",
  "Unauthorized",
  "Forbidden",
  "NotFound",
  "InvalidTransition",
  "IdempotencyConflict",
  "Conflict",
  "Unexpected"
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export type FieldErrors = Record<string, string[]>;

export type AppError = {
  code: AppErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
};

export const appError = (
  code: AppErrorCode,
  message: string,
  options: { fieldErrors?: FieldErrors } = {}
): AppError => ({
  code,
  message,
  ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {})
});

export const validationError = (
  message = "Validation failed",
  fieldErrors?: FieldErrors
): AppError =>
  fieldErrors
    ? appError("ValidationError", message, { fieldErrors })
    : appError("ValidationError", message);

export const unauthorized = (message = "Authentication required"): AppError =>
  appError("Unauthorized", message);

export const forbidden = (message = "Permission denied"): AppError =>
  appError("Forbidden", message);

export const notFound = (message = "Not found"): AppError =>
  appError("NotFound", message);

export const invalidTransition = (message: string): AppError =>
  appError("InvalidTransition", message);

export const idempotencyConflict = (
  message = "Idempotency key was reused with a different payload"
): AppError => appError("IdempotencyConflict", message);

export const conflict = (message = "Conflict"): AppError =>
  appError("Conflict", message);

export const unexpected = (message = "Unexpected error"): AppError =>
  appError("Unexpected", message);

type ZodSafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export const fromZod = <T>(result: ZodSafeParseResult<T>): Result<T> => {
  if (result.success) {
    return ok(result.data);
  }

  const fieldErrors: FieldErrors = {};

  for (const [field, messages] of Object.entries(
    result.error.flatten().fieldErrors
  )) {
    if (Array.isArray(messages) && messages.length > 0) {
      fieldErrors[field] = messages;
    }
  }

  return err(validationError("Validation failed", fieldErrors));
};

export const assertNever = (value: never, message = "Unexpected value"): never => {
  throw new Error(`${message}: ${String(value)}`);
};
