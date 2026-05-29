import { describe, expect, it } from "vitest";

import {
  commandExceptionError,
  commandReloadError,
  refreshRetryError
} from "./requester-command-errors";

describe("requester command errors", () => {
  it("renders safe messages for thrown command failures", () => {
    expect(commandExceptionError("createDraft")).toEqual({
      code: "Unexpected",
      message:
        "Draft could not be created. No workflow change was confirmed. Try again."
    });
    expect(commandExceptionError("saveDraft").message).toContain(
      "No workflow change was confirmed"
    );
    expect(commandExceptionError("submitRequest").message).toContain(
      "Request could not be submitted"
    );
  });

  it("distinguishes committed commands from reload failures", () => {
    expect(commandReloadError("createDraft")).toEqual({
      code: "Unexpected",
      message:
        "Draft was created, but the workspace could not refresh. Retry refresh before continuing."
    });
    expect(commandReloadError("submitRequest").message).toContain(
      "Request was submitted"
    );
  });

  it("keeps retry refresh copy generic and user-safe", () => {
    expect(refreshRetryError()).toEqual({
      code: "Unexpected",
      message: "Workspace could not refresh. Retry again before continuing."
    });
  });
});
