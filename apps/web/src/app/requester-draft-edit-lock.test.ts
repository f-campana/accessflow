import { describe, expect, it } from "vitest";

import {
  canEditDraftFields,
  isDraftCommandInFlight
} from "./requester-draft-edit-lock";

describe("requester draft edit lock", () => {
  it("locks draft fields while save or submit is in flight", () => {
    expect(isDraftCommandInFlight("Saving draft")).toBe(true);
    expect(isDraftCommandInFlight("Submitting request")).toBe(true);
  });

  it("does not lock draft fields for unrelated loading states", () => {
    expect(isDraftCommandInFlight("Loading workspace")).toBe(false);
    expect(isDraftCommandInFlight(null)).toBe(false);
  });

  it("allows edits only for draft requests with no draft command in flight", () => {
    expect(canEditDraftFields({ busy: null, isDraft: true })).toBe(true);
    expect(canEditDraftFields({ busy: "Saving draft", isDraft: true })).toBe(
      false
    );
    expect(canEditDraftFields({ busy: null, isDraft: false })).toBe(false);
  });
});
