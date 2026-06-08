import { describe, expect, it } from "vitest";

import {
  getOrCreateRequesterCommandAttempt,
  isRequesterCommandAttemptConfirmed,
  reconcileRequesterCommandAttempt
} from "./requester-command-attempt";

describe("requester command attempt", () => {
  it("creates one idempotency key for a draft submit attempt", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );

    expect(attempt).toMatchObject({
      commandName: "submitRequest",
      idempotencyKey: "submit-key-1",
      subjectId: "draft-1",
      subjectKind: "draft"
    });
  });

  it("reuses the same idempotency key when retrying the same command subject", () => {
    const first = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "withdrawRequest",
        subjectId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateRequesterCommandAttempt(
      first,
      {
        commandName: "withdrawRequest",
        subjectId: "request-1"
      },
      () => "key-2"
    );

    expect(second).toBe(first);
    expect(second.idempotencyKey).toBe("withdrawRequest-key-1");
  });

  it("creates a new key when the command changes", () => {
    const first = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "withdrawRequest",
        subjectId: "request-1"
      },
      () => "key-1"
    );
    const second = getOrCreateRequesterCommandAttempt(
      first,
      {
        commandName: "reopenRequest",
        subjectId: "request-1"
      },
      () => "key-2"
    );

    expect(second.idempotencyKey).toBe("reopenRequest-key-2");
  });

  it("creates a new key when the active draft changes", () => {
    const first = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );
    const second = getOrCreateRequesterCommandAttempt(
      first,
      {
        commandName: "submitRequest",
        subjectId: "draft-2"
      },
      () => "key-2"
    );

    expect(second.idempotencyKey).toBe("submit-key-2");
  });

  it("keeps an ambiguous submit attempt while the same draft remains draft", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );

    expect(
      reconcileRequesterCommandAttempt(attempt, {
        request: { id: "request-1", status: "draft" },
        draft: { id: "draft-1" }
      })
    ).toBe(attempt);
  });

  it("clears a submit attempt after the same draft reaches submit-confirmed status", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );

    for (const status of [
      "submitted",
      "under_review",
      "approved",
      "rejected"
    ] as const) {
      const access = {
        request: { id: "request-1", status },
        draft: { id: "draft-1" }
      };

      expect(isRequesterCommandAttemptConfirmed(attempt, access)).toBe(true);
      expect(reconcileRequesterCommandAttempt(attempt, access)).toBeNull();
    }
  });

  it("does not clear a submit attempt when reload returns no confirmed access", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );

    expect(reconcileRequesterCommandAttempt(attempt, null)).toBe(attempt);
  });

  it("clears a submit attempt when reload confirms a different active draft", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "submitRequest",
        subjectId: "draft-1"
      },
      () => "key-1"
    );

    expect(
      reconcileRequesterCommandAttempt(attempt, {
        request: { id: "request-1", status: "draft" },
        draft: { id: "other-draft" }
      })
    ).toBeNull();
  });

  it("clears withdrawal and reopen attempts at their typed target statuses", () => {
    const withdrawalAttempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "withdrawRequest",
        subjectId: "request-1"
      },
      () => "withdraw-key"
    );
    const reopenAttempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "reopenRequest",
        subjectId: "request-1"
      },
      () => "reopen-key"
    );

    expect(
      isRequesterCommandAttemptConfirmed(withdrawalAttempt, {
        request: { id: "request-1", status: "withdrawn" },
        draft: { id: "draft-1" }
      })
    ).toBe(true);
    expect(
      reconcileRequesterCommandAttempt(reopenAttempt, {
        request: { id: "request-1", status: "draft" },
        draft: { id: "draft-1" }
      })
    ).toBeNull();
  });

  it("keeps lifecycle attempts while refreshed state has not reached the target status", () => {
    const attempt = getOrCreateRequesterCommandAttempt(
      null,
      {
        commandName: "withdrawRequest",
        subjectId: "request-1"
      },
      () => "key-1"
    );

    expect(
      reconcileRequesterCommandAttempt(attempt, {
        request: {
          id: "request-1",
          status: "under_review"
        },
        draft: { id: "draft-1" }
      })
    ).toBe(attempt);
  });
});
