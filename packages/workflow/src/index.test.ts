import { describe, expect, it } from "vitest";

import {
  allowedWorkflowTransitionsFrom,
  isWorkflowTransitionAllowed,
  transitionWorkflowStatus,
  type StudyAccessRequestStatus,
  type WorkflowEventType
} from ".";

const allowedTransitions: Array<{
  from: StudyAccessRequestStatus;
  eventType: WorkflowEventType;
  to: StudyAccessRequestStatus;
}> = [
  { from: "draft", eventType: "submitRequest", to: "submitted" },
  { from: "submitted", eventType: "startReview", to: "under_review" },
  { from: "submitted", eventType: "withdrawRequest", to: "withdrawn" },
  { from: "under_review", eventType: "approveRequest", to: "approved" },
  { from: "under_review", eventType: "rejectRequest", to: "rejected" },
  { from: "rejected", eventType: "reviseRejectedRequest", to: "draft" },
  { from: "approved", eventType: "revokeAccess", to: "revoked" }
];

const rejectedTransitions: Array<{
  from: StudyAccessRequestStatus;
  eventType: WorkflowEventType;
}> = [
  { from: "draft", eventType: "approveRequest" },
  { from: "submitted", eventType: "approveRequest" },
  { from: "under_review", eventType: "withdrawRequest" },
  { from: "withdrawn", eventType: "submitRequest" },
  { from: "revoked", eventType: "submitRequest" }
];

describe("study access workflow transitions", () => {
  it.each(allowedTransitions)(
    "allows $eventType from $from to $to",
    ({ from, eventType, to }) => {
      expect(transitionWorkflowStatus(from, eventType)).toEqual({
        ok: true,
        value: { from, eventType, to }
      });
      expect(isWorkflowTransitionAllowed(from, eventType)).toBe(true);
    }
  );

  it.each(rejectedTransitions)(
    "rejects $eventType from $from",
    ({ from, eventType }) => {
      const result = transitionWorkflowStatus(from, eventType);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("InvalidTransition");
      }
      expect(isWorkflowTransitionAllowed(from, eventType)).toBe(false);
    }
  );

  it("returns only allowed transitions for a status", () => {
    expect(allowedWorkflowTransitionsFrom("submitted")).toEqual([
      {
        eventType: "startReview",
        from: "submitted",
        to: "under_review"
      },
      {
        eventType: "withdrawRequest",
        from: "submitted",
        to: "withdrawn"
      }
    ]);
  });
});
