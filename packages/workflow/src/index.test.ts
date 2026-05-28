import { describe, expect, it } from "vitest";

import {
  allowedWorkflowTransitionsFrom,
  isWorkflowTransitionAllowed,
  studyAccessRequestStatuses,
  transitionWorkflowStatus,
  workflowEventTypes,
  workflowTransitions,
  type StudyAccessRequestStatus,
  type WorkflowEventType
} from ".";

const allowedTransitions: Array<{
  from: StudyAccessRequestStatus;
  eventType: WorkflowEventType;
  to: StudyAccessRequestStatus;
}> = [
  { from: "draft", eventType: "submitRequest", to: "submitted" }
];

const rejectedTransitions: Array<{
  from: StudyAccessRequestStatus;
  eventType: WorkflowEventType;
}> = [
  { from: "submitted", eventType: "submitRequest" },
  { from: "under_review", eventType: "submitRequest" },
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
    expect(allowedWorkflowTransitionsFrom("draft")).toEqual([
      {
        eventType: "submitRequest",
        from: "draft",
        to: "submitted"
      }
    ]);
    expect(allowedWorkflowTransitionsFrom("submitted")).toEqual([]);
  });

  it("keeps configured transitions aligned with status and event vocabularies", () => {
    const statuses = new Set<string>(studyAccessRequestStatuses);
    const events = new Set<string>(workflowEventTypes);

    expect(workflowEventTypes).toEqual(["submitRequest"]);
    for (const transition of workflowTransitions) {
      expect(events.has(transition.eventType)).toBe(true);
      expect(statuses.has(transition.from)).toBe(true);
      expect(statuses.has(transition.to)).toBe(true);
    }
  });
});
