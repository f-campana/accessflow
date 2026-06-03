import { describe, expect, it } from "vitest";

import {
  appErrorTitle,
  commandErrorDescription,
  commandErrorFormMessages
} from "./requester-error-copy";
import {
  commandExceptionError,
  commandReloadError,
  refreshRetryError
} from "./requester-command-errors";
import type { AppError } from "./requester-workspace-model";

const errorWithCode = (code: AppError["code"]): AppError =>
  code === "ValidationError"
    ? {
        code,
        message: "Server message",
        fieldErrors: {},
        formErrors: []
      }
    : {
        code,
        message: "Server message"
      };

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

  it("does not render raw non-validation API messages", () => {
    const rawErrors: AppError[] = [
      {
        code: "Conflict",
        message: "unique_violation: study_access_requests_active_requester_study_idx"
      },
      {
        code: "Forbidden",
        message: "policy.requester_only failed for actor usr_123"
      },
      {
        code: "Unexpected",
        message: "{\"sql\":\"select * from users\",\"stack\":\"private\"}"
      }
    ];

    for (const error of rawErrors) {
      expect(commandErrorDescription(error)).not.toBe(error.message);
      expect(commandErrorDescription(error)).not.toContain("study_access");
      expect(commandErrorDescription(error)).not.toContain("actor usr");
      expect(commandErrorDescription(error)).not.toContain("select *");
      expect(commandErrorFormMessages(error)).toEqual([]);
    }
  });

  it("preserves known safe web-owned command messages", () => {
    expect(commandErrorDescription(commandExceptionError("submitRequest"))).toBe(
      "Request could not be submitted. No workflow change was confirmed. Try again."
    );
    expect(commandErrorDescription(commandReloadError("saveDraft"))).toBe(
      "Draft was saved, but the workspace could not refresh. Retry refresh before continuing."
    );
    expect(commandErrorDescription(refreshRetryError())).toBe(
      "Workspace could not refresh. Retry again before continuing."
    );
  });

  it("renders only whitelisted validation form messages", () => {
    const validationError: AppError = {
      code: "ValidationError",
      message: "Zod private parser state",
      fieldErrors: {
        purpose: ["Purpose is required"]
      },
      formErrors: [
        "Complete the draft before submitting the access request.",
        "raw backend validation details"
      ]
    };

    expect(commandErrorDescription(validationError)).toBe(
      "Fix the highlighted fields and try again."
    );
    expect(commandErrorFormMessages(validationError)).toEqual([
      "Complete the draft before submitting the access request."
    ]);
  });
});
