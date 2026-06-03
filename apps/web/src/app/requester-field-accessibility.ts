import type { DraftForm } from "./requester-workspace-model";
import type { FieldErrors } from "@accessflow/core";

export type DraftFieldName = keyof DraftForm;

const draftFieldOrder: DraftFieldName[] = [
  "purpose",
  "requestedRole",
  "justification",
  "affiliation",
  "supportingNotes"
];

const draftFieldLabels = {
  affiliation: "Affiliation",
  justification: "Justification",
  purpose: "Purpose",
  requestedRole: "Requested role",
  supportingNotes: "Supporting notes"
} satisfies Record<DraftFieldName, string>;

const requiredDraftFields = new Set<DraftFieldName>([
  "purpose",
  "requestedRole",
  "justification",
  "affiliation"
]);

const maxLengthByDraftField: Partial<Record<DraftFieldName, number>> = {
  affiliation: 300,
  justification: 2_000,
  purpose: 1_000,
  supportingNotes: 2_000
};

export const draftFieldInputId = (field: DraftFieldName) =>
  `request-${field}`;

export const draftFieldErrorId = (field: DraftFieldName) =>
  `request-${field}-error`;

export const draftErrorSummaryId = "request-error-summary";

export const draftErrorSummaryTitleId = `${draftErrorSummaryId}-title`;

export const isRequiredSubmissionField = (field: DraftFieldName) =>
  requiredDraftFields.has(field);

export const draftFieldAccessibilityProps = ({
  error,
  field
}: {
  error: string | null;
  field: DraftFieldName;
}) => ({
  "aria-describedby": error ? draftFieldErrorId(field) : undefined,
  "aria-invalid": Boolean(error),
  id: draftFieldInputId(field),
  maxLength: maxLengthByDraftField[field],
  required: isRequiredSubmissionField(field)
});

export const firstDraftFieldError = (
  fieldErrors: FieldErrors<DraftFieldName> | undefined,
  field: DraftFieldName
) => fieldErrors?.[field]?.[0] ?? null;

export const draftFieldErrorSummaryItems = (
  fieldErrors: FieldErrors<DraftFieldName> | undefined
) =>
  draftFieldOrder.flatMap((field) => {
    const message = firstDraftFieldError(fieldErrors, field);

    return message
      ? [
          {
            field,
            inputId: draftFieldInputId(field),
            label: draftFieldLabels[field],
            message
          }
        ]
      : [];
  });
