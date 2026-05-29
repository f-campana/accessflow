import { describe, expect, it } from "vitest";

import { appErrorTitle } from "./requester-error-copy";
import type { AppError } from "./requester-workspace-model";

const errorWithCode = (code: AppError["code"]): AppError => ({
  code,
  message: "Server message"
});

describe("requester error copy", () => {
  it("maps implementation error codes to user-facing titles", () => {
    expect(appErrorTitle(errorWithCode("ValidationError"))).toBe(
      "Review the highlighted fields"
    );
    expect(appErrorTitle(errorWithCode("IdempotencyConflict"))).toBe(
      "Retry was blocked"
    );
    expect(appErrorTitle(errorWithCode("Unexpected"))).toBe(
      "Something went wrong"
    );
  });
});
