import { z } from "zod";

import { requestedStudyRoles } from "@accessflow/workflow";

const optionalDraftText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable();

const requiredSubmissionText = (fieldName: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(max);

export const draftFieldsSchema = z.object({
  purpose: optionalDraftText(1_000),
  requestedRole: z.enum(requestedStudyRoles).optional().nullable(),
  justification: optionalDraftText(2_000),
  affiliation: optionalDraftText(300),
  supportingNotes: optionalDraftText(2_000)
});

export const createDraftInputSchema = draftFieldsSchema.extend({
  studyId: z.uuid()
});

export const saveDraftInputSchema = draftFieldsSchema.extend({
  draftId: z.uuid()
});

export const submitRequestInputSchema = draftFieldsSchema.extend({
  draftId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128)
});

export const finalDraftFieldsSchema = z.object({
  purpose: requiredSubmissionText("Purpose", 1_000),
  requestedRole: z.enum(requestedStudyRoles),
  justification: requiredSubmissionText("Justification", 2_000),
  affiliation: requiredSubmissionText("Affiliation", 300),
  supportingNotes: optionalDraftText(2_000)
});

export type DraftFields = z.infer<typeof draftFieldsSchema>;
export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type SubmitRequestInput = z.infer<typeof submitRequestInputSchema>;
export type FinalDraftFields = z.infer<typeof finalDraftFieldsSchema>;
