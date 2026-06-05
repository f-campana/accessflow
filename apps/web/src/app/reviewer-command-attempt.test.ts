import { describe, expect, it } from "vitest";

import {
  getOrCreateReviewerCommandAttempt,
  isReviewerCommandAttemptConfirmed,
  reconcileReviewerCommandAttempt
} from "./reviewer-command-attempt";

describe("reviewer command attempt", () => {
  it("creates a stable idempotency key for the same decision attempt", () => {
    const first = getOrCreateReviewerCommandAttempt(
      null,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateReviewerCommandAttempt(
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
    const first = getOrCreateReviewerCommandAttempt(
      null,
      {
        commandName: "rejectRequest",
        payloadFingerprint: "first reason",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateReviewerCommandAttempt(
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

  it("clears the attempt after refreshed state confirms start-review", () => {
    const attempt = getOrCreateReviewerCommandAttempt(
      null,
      {
        commandName: "startReview",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      isReviewerCommandAttemptConfirmed(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        }
      })
    ).toBe(true);
    expect(
      reconcileReviewerCommandAttempt(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        }
      })
    ).toBeNull();
  });

  it("clears the attempt after refreshed state confirms the decision", () => {
    const attempt = getOrCreateReviewerCommandAttempt(
      null,
      {
        commandName: "rejectRequest",
        payloadFingerprint: "reason",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      isReviewerCommandAttemptConfirmed(attempt, {
        request: {
          id: "request-1",
          status: "rejected"
        }
      })
    ).toBe(true);
    expect(
      reconcileReviewerCommandAttempt(attempt, {
        request: {
          id: "request-1",
          status: "rejected"
        }
      })
    ).toBeNull();
  });

  it("keeps the attempt when refreshed state is still not final", () => {
    const attempt = getOrCreateReviewerCommandAttempt(
      null,
      {
        commandName: "approveRequest",
        payloadFingerprint: "",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      reconcileReviewerCommandAttempt(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        }
      })
    ).toBe(attempt);
  });
});
