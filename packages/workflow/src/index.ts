import { err, invalidTransition, ok, type Result } from "@accessflow/core";
import { createMachine, getNextSnapshot, type SnapshotFrom } from "xstate";

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

export const workflowEventTypes = [
  "submitRequest",
  "startReview",
  "approveRequest",
  "rejectRequest",
  "withdrawRequest",
  "reviseRejectedRequest",
  "revokeAccess"
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

export const studyAccessWorkflowMachine = createMachine({
  types: {} as {
    events: WorkflowEvent;
  },
  id: "studyAccessRequest",
  initial: "draft",
  states: {
    draft: {
      on: {
        submitRequest: "submitted"
      }
    },
    submitted: {
      on: {
        startReview: "under_review",
        withdrawRequest: "withdrawn"
      }
    },
    under_review: {
      on: {
        approveRequest: "approved",
        rejectRequest: "rejected"
      }
    },
    approved: {
      on: {
        revokeAccess: "revoked"
      }
    },
    rejected: {
      on: {
        reviseRejectedRequest: "draft"
      }
    },
    withdrawn: {},
    revoked: {}
  }
});

type WorkflowSnapshot = SnapshotFrom<typeof studyAccessWorkflowMachine>;

const snapshotForStatus = (
  status: StudyAccessRequestStatus
): WorkflowSnapshot =>
  studyAccessWorkflowMachine.resolveState({
    value: status,
    context: {}
  });

export const transitionWorkflowStatus = (
  from: StudyAccessRequestStatus,
  eventType: WorkflowEventType
): Result<WorkflowTransition> => {
  const currentSnapshot = snapshotForStatus(from);
  const nextSnapshot = getNextSnapshot(studyAccessWorkflowMachine, currentSnapshot, {
    type: eventType
  });
  const to = nextSnapshot.value as StudyAccessRequestStatus;

  if (to === from) {
    return err(
      invalidTransition(`Cannot apply ${eventType} while request is ${from}`)
    );
  }

  return ok({ eventType, from, to });
};

export const isWorkflowTransitionAllowed = (
  from: StudyAccessRequestStatus,
  eventType: WorkflowEventType
): boolean => transitionWorkflowStatus(from, eventType).ok;

export const allowedWorkflowTransitionsFrom = (
  from: StudyAccessRequestStatus
): WorkflowTransition[] =>
  workflowEventTypes.flatMap((eventType) => {
    const result = transitionWorkflowStatus(from, eventType);

    return result.ok ? [result.value] : [];
  });
