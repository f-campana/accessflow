import { describe, expect, it } from "vitest";

import { requestedStudyRoles } from "@accessflow/workflow";

import {
  draftFieldsSchema,
  finalDraftFieldsSchema
} from "./validation";

describe("command validation requested roles", () => {
  it("accepts every requested role from the workflow vocabulary", () => {
    for (const requestedRole of requestedStudyRoles) {
      expect(draftFieldsSchema.safeParse({ requestedRole }).success).toBe(true);
      expect(
        finalDraftFieldsSchema.safeParse({
          purpose: "Analyze synthetic outcomes",
          requestedRole,
          justification: "Reviewer needs aggregate data",
          affiliation: "AccessFlow Research"
        }).success
      ).toBe(true);
    }
  });

  it("rejects roles outside the workflow parser vocabulary", () => {
    const draftResult = draftFieldsSchema.safeParse({
      requestedRole: "admin"
    });
    const finalResult = finalDraftFieldsSchema.safeParse({
      purpose: "Analyze synthetic outcomes",
      requestedRole: "admin",
      justification: "Reviewer needs aggregate data",
      affiliation: "AccessFlow Research"
    });

    expect(draftResult.success).toBe(false);
    expect(finalResult.success).toBe(false);
  });

  it("uses product copy when final requested role is missing", () => {
    const result = finalDraftFieldsSchema.safeParse({
      purpose: "Analyze synthetic outcomes",
      requestedRole: null,
      justification: "Reviewer needs aggregate data",
      affiliation: "AccessFlow Research"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.requestedRole).toEqual([
        "Requested role is required"
      ]);
    }
  });
});
