import { z } from "zod";

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error
});

type AppErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "InvalidTransition"
  | "IdempotencyConflict"
  | "Conflict"
  | "Unexpected";

export type FieldErrors<FieldName extends string = string> = Partial<
  Record<FieldName, string[]>
>;

export type ValidationAppError<FieldName extends string = string> = {
  code: "ValidationError";
  message: string;
  formErrors: string[];
  fieldErrors: FieldErrors<FieldName>;
};

type NonValidationAppErrorCode = Exclude<AppErrorCode, "ValidationError">;

export type NonValidationAppError = {
  code: NonValidationAppErrorCode;
  message: string;
};

export type AppError<FieldName extends string = string> =
  | ValidationAppError<FieldName>
  | NonValidationAppError;

export const appError = (
  code: NonValidationAppErrorCode,
  message: string
): NonValidationAppError => ({
  code,
  message
});

export const validationError = <FieldName extends string = string>(
  message = "Validation failed",
  options: {
    formErrors?: string[];
    fieldErrors?: FieldErrors<FieldName>;
  } = {}
): ValidationAppError<FieldName> => ({
  code: "ValidationError",
  message,
  formErrors: options.formErrors ?? [],
  fieldErrors: options.fieldErrors ?? {}
});

export const forbidden = (message = "Permission denied"): NonValidationAppError =>
  appError("Forbidden", message);

export const notFound = (message = "Not found"): NonValidationAppError =>
  appError("NotFound", message);

export const invalidTransition = (message: string): NonValidationAppError =>
  appError("InvalidTransition", message);

export const idempotencyConflict = (
  message = "Idempotency key was reused with a different payload"
): NonValidationAppError => appError("IdempotencyConflict", message);

export const conflict = (message = "Conflict"): NonValidationAppError =>
  appError("Conflict", message);

export const unexpected = (message = "Unexpected error"): NonValidationAppError =>
  appError("Unexpected", message);

type ZodSafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export const fromZod = <T, FieldName extends string = string>(
  result: ZodSafeParseResult<T>
): Result<T, ValidationAppError<FieldName>> => {
  if (result.success) {
    return ok(result.data);
  }

  const fieldErrors: FieldErrors<FieldName> = {};
  const flattened = result.error.flatten();

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      fieldErrors[field as FieldName] = messages;
    }
  }

  return err(
    validationError("Validation failed", {
      fieldErrors,
      formErrors: flattened.formErrors
    })
  );
};

export type CommandResponse<T, E = AppError> = Result<T, E>;

export const toCommandResponse = <T, E>(
  result: Result<T, E>
): CommandResponse<T, E> => result;
