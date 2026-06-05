import { err, invalidTransition, ok, type Result } from "@accessflow/core";

export const studyAccessRequestStatuses = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
  "revoked"
] as const;

export type StudyAccessRequestStatus =
  (typeof studyAccessRequestStatuses)[number];

export const activeStudyAccessRequestStatuses = [
  "draft",
  "submitted",
  "under_review",
  "approved"
] as const satisfies readonly StudyAccessRequestStatus[];

export const requesterVisibleStudyAccessRequestStatuses = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected"
] as const satisfies readonly StudyAccessRequestStatus[];

export const requestedStudyRoles = ["viewer", "analyst"] as const;

export type RequestedStudyRole = (typeof requestedStudyRoles)[number];

const requestedStudyRoleSet = new Set<string>(requestedStudyRoles);

export const isRequestedStudyRole = (
  value: unknown
): value is RequestedStudyRole =>
  typeof value === "string" && requestedStudyRoleSet.has(value);

export const parseRequestedStudyRole = (
  value: unknown
): RequestedStudyRole | null =>
  isRequestedStudyRole(value) ? value : null;

export const parsePersistedRequestedStudyRole = (
  value: string | null
): RequestedStudyRole | null => {
  if (value === null) {
    return null;
  }

  const parsed = parseRequestedStudyRole(value);

  if (!parsed) {
    throw new Error("Persisted requested role is invalid");
  }

  return parsed;
};

export const workflowEventTypes = [
  "submitRequest",
  "startReview",
  "approveRequest",
  "rejectRequest"
] as const;

export type WorkflowEventType = (typeof workflowEventTypes)[number];

export type WorkflowEvent = {
  type: WorkflowEventType;
};

export type WorkflowTransition = {
  eventType: WorkflowEventType;
  from: StudyAccessRequestStatus;
  to: StudyAccessRequestStatus;
};

export const workflowTransitions = [
  {
    eventType: "submitRequest",
    from: "draft",
    to: "submitted"
  },
  {
    eventType: "startReview",
    from: "submitted",
    to: "under_review"
  },
  {
    eventType: "approveRequest",
    from: "under_review",
    to: "approved"
  },
  {
    eventType: "rejectRequest",
    from: "under_review",
    to: "rejected"
  }
] as const satisfies readonly WorkflowTransition[];

export const transitionWorkflowStatus = (
  from: StudyAccessRequestStatus,
  eventType: WorkflowEventType
): Result<WorkflowTransition> => {
  const configuredTransition = workflowTransitions.find(
    (transition) =>
      transition.from === from && transition.eventType === eventType
  );

  if (!configuredTransition) {
    return err(
      invalidTransition(`Cannot apply ${eventType} while request is ${from}`)
    );
  }

  return ok(configuredTransition);
};

export const isWorkflowTransitionAllowed = (
  from: StudyAccessRequestStatus,
  eventType: WorkflowEventType
): boolean => transitionWorkflowStatus(from, eventType).ok;

export const allowedWorkflowTransitionsFrom = (
  from: StudyAccessRequestStatus
): WorkflowTransition[] =>
  workflowTransitions.filter((transition) => transition.from === from);
