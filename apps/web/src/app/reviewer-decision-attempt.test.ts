import { describe, expect, it } from "vitest";

import {
  getOrCreateReviewerDecisionAttempt,
  isReviewerDecisionAttemptConfirmed,
  reconcileReviewerDecisionAttempt
} from "./reviewer-decision-attempt";

describe("reviewer decision attempt", () => {
  it("creates a stable idempotency key for the same decision attempt", () => {
    const first = getOrCreateReviewerDecisionAttempt(
      null,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateReviewerDecisionAttempt(
      first,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-2"
    );

    expect(second).toBe(first);
    expect(second.idempotencyKey).toBe("approveRequest-key-1");
  });

  it("creates a new key when the decision payload changes", () => {
    const first = getOrCreateReviewerDecisionAttempt(
      null,
      {
        commandName: "rejectRequest",
        payloadFingerprint: "first reason",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateReviewerDecisionAttempt(
      first,
      {
        commandName: "rejectRequest",
        payloadFingerprint: "second reason",
        requestId: "request-1"
      },
      () => "key-2"
    );

    expect(second.idempotencyKey).toBe("rejectRequest-key-2");
  });

  it("clears the attempt after refreshed state confirms the decision", () => {
    const attempt = getOrCreateReviewerDecisionAttempt(
      null,
      {
        commandName: "rejectRequest",
        payloadFingerprint: "reason",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      isReviewerDecisionAttemptConfirmed(attempt, {
        request: {
          id: "request-1",
          status: "rejected"
        }
      })
    ).toBe(true);
    expect(
      reconcileReviewerDecisionAttempt(attempt, {
        request: {
          id: "request-1",
          status: "rejected"
        }
      })
    ).toBeNull();
  });

  it("keeps the attempt when refreshed state is still not final", () => {
    const attempt = getOrCreateReviewerDecisionAttempt(
      null,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      reconcileReviewerDecisionAttempt(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        }
      })
    ).toBe(attempt);
  });
});
