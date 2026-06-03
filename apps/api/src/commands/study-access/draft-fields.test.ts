import { describe, expect, it } from "vitest";

import { readDraftFields } from "./draft-fields";

const draftRecord = {
  purpose: "Synthetic access review",
  requestedRole: "viewer",
  justification: "Review aggregate outcomes",
  affiliation: "AccessFlow Research",
  supportingNotes: null
};

describe("draft field parsing", () => {
  it("parses persisted requested roles through the shared workflow parser", () => {
    expect(readDraftFields(draftRecord)).toEqual({
      ok: true,
      value: draftRecord
    });
  });

  it("fails closed when persisted requested roles are invalid", () => {
    const result = readDraftFields({
      ...draftRecord,
      requestedRole: "admin"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "Unexpected",
        message: "Persisted draft data is invalid"
      });
    }
  });
});
