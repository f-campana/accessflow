import type { DraftForm } from "./requester-workspace-model";

export type DraftFieldName = keyof DraftForm;

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
