import { describe, expect, it } from "vitest";

import {
  activeStudyAccessRequestStatuses,
  allowedWorkflowTransitionsFrom,
  isWorkflowTransitionAllowed,
  isRequestedStudyRole,
  parsePersistedRequestedStudyRole,
  parseRequestedStudyRole,
  requesterVisibleStudyAccessRequestStatuses,
  requestedStudyRoles,
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
}> = [...workflowTransitions];

const rejectedTransitions: Array<{
  from: StudyAccessRequestStatus;
  eventType: WorkflowEventType;
}> = studyAccessRequestStatuses.flatMap((from) =>
  workflowEventTypes
    .filter(
      (eventType) =>
        !workflowTransitions.some(
          (transition) =>
            transition.from === from && transition.eventType === eventType
        )
    )
    .map((eventType) => ({ from, eventType }))
);

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
    expect(allowedWorkflowTransitionsFrom("under_review")).toEqual([
      {
        eventType: "approveRequest",
        from: "under_review",
        to: "approved"
      },
      {
        eventType: "rejectRequest",
        from: "under_review",
        to: "rejected"
      },
      {
        eventType: "withdrawRequest",
        from: "under_review",
        to: "withdrawn"
      }
    ]);
    expect(allowedWorkflowTransitionsFrom("rejected")).toEqual([
      {
        eventType: "reopenRequest",
        from: "rejected",
        to: "draft"
      }
    ]);
  });

  it("keeps configured transitions aligned with status and event vocabularies", () => {
    const statuses = new Set<string>(studyAccessRequestStatuses);
    const events = new Set<string>(workflowEventTypes);

    expect(workflowEventTypes).toEqual([
      "submitRequest",
      "startReview",
      "approveRequest",
      "rejectRequest",
      "withdrawRequest",
      "reopenRequest"
    ]);
    for (const transition of workflowTransitions) {
      expect(events.has(transition.eventType)).toBe(true);
      expect(statuses.has(transition.from)).toBe(true);
      expect(statuses.has(transition.to)).toBe(true);
    }
  });

  it("keeps active statuses aligned with status vocabulary", () => {
    const statuses = new Set<string>(studyAccessRequestStatuses);

    for (const status of activeStudyAccessRequestStatuses) {
      expect(statuses.has(status)).toBe(true);
    }
  });

  it("keeps requester-visible statuses aligned without making rejection active", () => {
    const statuses = new Set<string>(studyAccessRequestStatuses);

    for (const status of requesterVisibleStudyAccessRequestStatuses) {
      expect(statuses.has(status)).toBe(true);
    }

    expect(requesterVisibleStudyAccessRequestStatuses).toContain("rejected");
    expect(requesterVisibleStudyAccessRequestStatuses).toContain("withdrawn");
    expect(activeStudyAccessRequestStatuses).not.toContain("rejected");
    expect(activeStudyAccessRequestStatuses).not.toContain("withdrawn");
  });

  it("has only one transition target for each status and event pair", () => {
    const transitionKeys = new Set<string>();

    for (const transition of workflowTransitions) {
      const key = `${transition.from}:${transition.eventType}`;

      expect(transitionKeys.has(key)).toBe(false);
      transitionKeys.add(key);
    }
  });

  it("uses workflowTransitions as the canonical transition source", () => {
    for (const from of studyAccessRequestStatuses) {
      for (const eventType of workflowEventTypes) {
        const configuredTransition = workflowTransitions.find(
          (transition) =>
            transition.from === from && transition.eventType === eventType
        );
        const result = transitionWorkflowStatus(from, eventType);

        if (configuredTransition) {
          expect(result).toEqual({
            ok: true,
            value: configuredTransition
          });
        } else {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe("InvalidTransition");
          }
        }
      }
    }
  });
});

describe("requested study roles", () => {
  it("parses only configured requested study roles", () => {
    expect(requestedStudyRoles).toEqual(["viewer", "analyst"]);

    for (const role of requestedStudyRoles) {
      expect(isRequestedStudyRole(role)).toBe(true);
      expect(parseRequestedStudyRole(role)).toBe(role);
    }

    expect(isRequestedStudyRole("admin")).toBe(false);
    expect(parseRequestedStudyRole("admin")).toBeNull();
    expect(parseRequestedStudyRole(null)).toBeNull();
  });

  it("keeps persisted role parsing fail-closed", () => {
    expect(parsePersistedRequestedStudyRole(null)).toBeNull();
    expect(parsePersistedRequestedStudyRole("viewer")).toBe("viewer");
    expect(() => parsePersistedRequestedStudyRole("admin")).toThrow(
      "Persisted requested role is invalid"
    );
  });
});
