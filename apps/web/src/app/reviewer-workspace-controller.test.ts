import { describe, expect, it } from "vitest";

import { shouldRefreshReviewerStateAfterCommandError } from "./reviewer-workspace-controller";

describe("reviewer workspace controller state", () => {
  it("refreshes server truth for reviewer command state conflicts", () => {
    expect(
      shouldRefreshReviewerStateAfterCommandError({
        code: "InvalidTransition",
        message: "Action is no longer available"
      })
    ).toBe(true);
    expect(
      shouldRefreshReviewerStateAfterCommandError({
        code: "Conflict",
        message: "Request changed"
      })
    ).toBe(true);
    expect(
      shouldRefreshReviewerStateAfterCommandError({
        code: "ValidationError",
        message: "Validation failed",
        formErrors: [],
        fieldErrors: {}
      })
    ).toBe(false);
  });
});
