import { describe, expect, it } from "vitest";

import {
  getOrCreateRequesterLifecycleAttempt,
  isRequesterLifecycleAttemptConfirmed,
  reconcileRequesterLifecycleAttempt
} from "./requester-lifecycle-attempt";

describe("requester lifecycle attempt", () => {
  it("creates a stable idempotency key for the same requester command", () => {
    const first = getOrCreateRequesterLifecycleAttempt(
      null,
      {
        commandName: "withdrawRequest",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateRequesterLifecycleAttempt(
      first,
      {
        commandName: "withdrawRequest",
        requestId: "request-1"
      },
      () => "key-2"
    );

    expect(second).toBe(first);
    expect(second.idempotencyKey).toBe("withdrawRequest-key-1");
  });

  it("creates a new key when the command changes", () => {
    const first = getOrCreateRequesterLifecycleAttempt(
      null,
      {
        commandName: "withdrawRequest",
        requestId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateRequesterLifecycleAttempt(
      first,
      {
        commandName: "reopenRequest",
        requestId: "request-1"
      },
      () => "key-2"
    );

    expect(second.idempotencyKey).toBe("reopenRequest-key-2");
  });

  it("clears a withdrawal attempt after refreshed state confirms withdrawal", () => {
    const attempt = getOrCreateRequesterLifecycleAttempt(
      null,
      {
        commandName: "withdrawRequest",
        requestId: "request-1"
      },
      () => "key-1"
    );

    const access = {
      request: {
        id: "request-1",
        status: "withdrawn"
      }
    };

    expect(isRequesterLifecycleAttemptConfirmed(attempt, access)).toBe(true);
    expect(reconcileRequesterLifecycleAttempt(attempt, access)).toBeNull();
  });

  it("clears a reopen attempt after refreshed state confirms draft", () => {
    const attempt = getOrCreateRequesterLifecycleAttempt(
      null,
      {
        commandName: "reopenRequest",
        requestId: "request-1"
      },
      () => "key-1"
    );

    const access = {
      request: {
        id: "request-1",
        status: "draft"
      }
    };

    expect(isRequesterLifecycleAttemptConfirmed(attempt, access)).toBe(true);
    expect(reconcileRequesterLifecycleAttempt(attempt, access)).toBeNull();
  });

  it("keeps the attempt when refreshed state has not reached the target status", () => {
    const attempt = getOrCreateRequesterLifecycleAttempt(
      null,
      {
        commandName: "withdrawRequest",
        requestId: "request-1"
      },
      () => "key-1"
    );

    expect(
      reconcileRequesterLifecycleAttempt(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        }
      })
    ).toBe(attempt);
  });
});
