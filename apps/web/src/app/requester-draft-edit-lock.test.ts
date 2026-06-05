import { describe, expect, it } from "vitest";

import {
  canEditDraftFields,
  isDraftCommandInFlight
} from "./requester-draft-edit-lock";
import { requesterOperationStatus } from "./requester-operation-state";

describe("requester draft edit lock", () => {
  it("locks draft fields while save or submit is in flight", () => {
    expect(isDraftCommandInFlight("savingDraft")).toBe(true);
    expect(isDraftCommandInFlight("submittingRequest")).toBe(true);
  });

  it("does not lock draft fields for unrelated loading states", () => {
    expect(isDraftCommandInFlight("loadingWorkspace")).toBe(false);
    expect(isDraftCommandInFlight("withdrawingRequest")).toBe(false);
    expect(isDraftCommandInFlight("idle")).toBe(false);
  });

  it("derives status copy separately from edit-lock behavior", () => {
    expect(requesterOperationStatus("savingDraft")).toBe("Saving draft");
    expect(requesterOperationStatus("withdrawingRequest")).toBe(
      "Withdrawing request"
    );
    expect(isDraftCommandInFlight("savingDraft")).toBe(true);
  });

  it("allows edits only for draft requests with no draft command in flight", () => {
    expect(
      canEditDraftFields({
        canRetryRefresh: false,
        operation: "idle",
        isDraft: true
      })
    ).toBe(true);
    expect(
      canEditDraftFields({
        canRetryRefresh: false,
        operation: "savingDraft",
        isDraft: true
      })
    ).toBe(false);
    expect(
      canEditDraftFields({
        canRetryRefresh: false,
        operation: "idle",
        isDraft: false
      })
    ).toBe(false);
  });

  it("locks draft fields while refresh retry is required", () => {
    expect(
      canEditDraftFields({
        canRetryRefresh: true,
        operation: "idle",
        isDraft: true
      })
    ).toBe(false);
  });
});
