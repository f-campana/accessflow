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
  formErrors?: string[];
  fieldErrors?: FieldErrors;
};

export const appError = (
  code: AppErrorCode,
  message: string,
  options: { formErrors?: string[]; fieldErrors?: FieldErrors } = {}
): AppError => ({
  code,
  message,
  ...(options.formErrors?.length ? { formErrors: options.formErrors } : {}),
  ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {})
});

export const validationError = (
  message = "Validation failed",
  options: { formErrors?: string[]; fieldErrors?: FieldErrors } = {}
): AppError =>
  options.formErrors?.length || options.fieldErrors
    ? appError("ValidationError", message, options)
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
  const flattened = result.error.flatten();

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      fieldErrors[field] = messages;
    }
  }

  return err(
    validationError("Validation failed", {
      ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
      ...(flattened.formErrors.length > 0
        ? { formErrors: flattened.formErrors }
        : {})
    })
  );
};

export const assertNever = (value: never, message = "Unexpected value"): never => {
  throw new Error(`${message}: ${String(value)}`);
};

export type CommandResponse<T, E = AppError> = Result<T, E>;

export const toCommandResponse = <T, E>(
  result: Result<T, E>
): CommandResponse<T, E> => result;
