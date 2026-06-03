import { describe, expect, it } from "vitest";

import {
  draftFieldErrorSummaryItems,
  draftFieldAccessibilityProps,
  draftFieldErrorId,
  draftFieldInputId,
  firstDraftFieldError,
  isRequiredSubmissionField
} from "./requester-field-accessibility";

describe("requester field accessibility", () => {
  it("uses stable ids for controls and errors", () => {
    expect(draftFieldInputId("purpose")).toBe("request-purpose");
    expect(draftFieldErrorId("purpose")).toBe("request-purpose-error");
  });

  it("associates field errors with invalid controls", () => {
    expect(
      draftFieldAccessibilityProps({
        field: "justification",
        error: "Justification is required"
      })
    ).toMatchObject({
      "aria-describedby": "request-justification-error",
      "aria-invalid": true,
      id: "request-justification",
      required: true
    });
  });

  it("does not describe fields without an error", () => {
    expect(
      draftFieldAccessibilityProps({
        field: "supportingNotes",
        error: null
      })
    ).toMatchObject({
      "aria-describedby": undefined,
      "aria-invalid": false,
      id: "request-supportingNotes",
      required: false
    });
  });

  it("marks only submit-required fields as required", () => {
    expect(isRequiredSubmissionField("purpose")).toBe(true);
    expect(isRequiredSubmissionField("requestedRole")).toBe(true);
    expect(isRequiredSubmissionField("justification")).toBe(true);
    expect(isRequiredSubmissionField("affiliation")).toBe(true);
    expect(isRequiredSubmissionField("supportingNotes")).toBe(false);
  });

  it("builds ordered field-error summary items", () => {
    expect(
      draftFieldErrorSummaryItems({
        affiliation: ["Affiliation is required"],
        purpose: ["Purpose is required"],
        requestedRole: ["Requested role is required"]
      })
    ).toEqual([
      {
        field: "purpose",
        inputId: "request-purpose",
        label: "Purpose",
        message: "Purpose is required"
      },
      {
        field: "requestedRole",
        inputId: "request-requestedRole",
        label: "Requested role",
        message: "Requested role is required"
      },
      {
        field: "affiliation",
        inputId: "request-affiliation",
        label: "Affiliation",
        message: "Affiliation is required"
      }
    ]);
  });

  it("reads the first message for a draft field", () => {
    expect(
      firstDraftFieldError(
        {
          justification: ["First", "Second"]
        },
        "justification"
      )
    ).toBe("First");
    expect(firstDraftFieldError(undefined, "justification")).toBeNull();
  });
});
