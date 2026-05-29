import { describe, expect, it } from "vitest";

import {
  getOrCreateSubmitAttempt,
  isSubmitAttemptConfirmedSubmitted,
  reconcileSubmitAttempt
} from "./requester-submit-attempt";

describe("requester submit attempt", () => {
  it("creates one idempotency key for a draft submit attempt", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(attempt).toEqual({
      draftId: "draft-1",
      idempotencyKey: "submit-key-1"
    });
  });

  it("reuses the same idempotency key when retrying the same draft", () => {
    const firstAttempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");
    const retryAttempt = getOrCreateSubmitAttempt(
      firstAttempt,
      "draft-1",
      () => "key-2"
    );

    expect(retryAttempt).toBe(firstAttempt);
    expect(retryAttempt.idempotencyKey).toBe("submit-key-1");
  });

  it("uses a new idempotency key when the active draft changes", () => {
    const firstAttempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");
    const nextAttempt = getOrCreateSubmitAttempt(
      firstAttempt,
      "draft-2",
      () => "key-2"
    );

    expect(nextAttempt).toEqual({
      draftId: "draft-2",
      idempotencyKey: "submit-key-2"
    });
  });

  it("keeps the attempt after a reload confirms the same draft is still draft", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(
      reconcileSubmitAttempt(attempt, {
        request: { status: "draft" },
        draft: { id: "draft-1" }
      })
    ).toBe(attempt);
  });

  it("clears the attempt only after reload confirms the same draft submitted", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(
      reconcileSubmitAttempt(attempt, {
        request: { status: "submitted" },
        draft: { id: "draft-1" }
      })
    ).toBeNull();
  });

  it("does not clear the attempt when reload returns no confirmed access", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(reconcileSubmitAttempt(attempt, null)).toBe(attempt);
  });

  it("clears the attempt when reload confirms a different active draft", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(
      reconcileSubmitAttempt(attempt, {
        request: { status: "draft" },
        draft: { id: "other-draft" }
      })
    ).toBeNull();
  });

  it("recognizes only the same submitted draft as a confirmed submit", () => {
    const attempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");

    expect(
      isSubmitAttemptConfirmedSubmitted(attempt, {
        request: { status: "submitted" },
        draft: { id: "draft-1" }
      })
    ).toBe(true);

    expect(
      isSubmitAttemptConfirmedSubmitted(attempt, {
        request: { status: "draft" },
        draft: { id: "draft-1" }
      })
    ).toBe(false);
  });

  it("reuses the same key after an ambiguous submit result without a submitted reload", () => {
    const firstAttempt = getOrCreateSubmitAttempt(null, "draft-1", () => "key-1");
    const retryAttempt = getOrCreateSubmitAttempt(
      firstAttempt,
      "draft-1",
      () => "key-2"
    );

    expect(retryAttempt.idempotencyKey).toBe(firstAttempt.idempotencyKey);
  });
});
