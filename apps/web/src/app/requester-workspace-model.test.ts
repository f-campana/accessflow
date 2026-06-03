import { describe, expect, it } from "vitest";

import {
  toDraftForm,
  toDraftRequestedRole,
  type StudyAccess
} from "./requester-workspace-model";

const accessWithRequestedRole = (requestedRole: unknown) =>
  ({
    draft: {
      purpose: "Synthetic access review",
      requestedRole,
      justification: "Review aggregate outcomes",
      affiliation: "AccessFlow Research",
      supportingNotes: null
    }
  }) as unknown as StudyAccess;

describe("requester workspace model", () => {
  it("normalizes draft requested roles through the workflow parser", () => {
    expect(toDraftRequestedRole("viewer")).toBe("viewer");
    expect(toDraftRequestedRole("analyst")).toBe("analyst");
    expect(toDraftRequestedRole("admin")).toBe("");
    expect(toDraftRequestedRole(null)).toBe("");
  });

  it("keeps invalid requested roles out of draft form state", () => {
    expect(toDraftForm(accessWithRequestedRole("viewer")).requestedRole).toBe(
      "viewer"
    );
    expect(toDraftForm(accessWithRequestedRole("admin")).requestedRole).toBe("");
  });
});
