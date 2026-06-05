export const activeRequestConstraintName =
  "study_access_requests_active_requester_study_idx";

export const isActiveRequestUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybePgError = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };

  const isDirectUniqueViolation =
    maybePgError.code === "23505" &&
    maybePgError.constraint === activeRequestConstraintName;

  return (
    isDirectUniqueViolation || isActiveRequestUniqueViolation(maybePgError.cause)
  );
};
