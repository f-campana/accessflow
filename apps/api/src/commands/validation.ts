import { z } from "zod";

import {
  isRequestedStudyRole,
  parseRequestedStudyRole,
  type RequestedStudyRole
} from "@accessflow/workflow";

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

const requestedStudyRoleInputSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z
    .string()
    .trim()
    .refine(isRequestedStudyRole, {
      error: "Requested role is required"
    })
    .transform((value): RequestedStudyRole => {
      const role = parseRequestedStudyRole(value);

      if (!role) {
        throw new Error("Requested role parser rejected refined value");
      }

      return role;
    })
);

export const draftFieldsSchema = z.object({
  purpose: optionalDraftText(1_000),
  requestedRole: requestedStudyRoleInputSchema.optional().nullable(),
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

export const startReviewInputSchema = z.object({
  requestId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128)
});

export const approveRequestInputSchema = z.object({
  requestId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128)
});

export const rejectRequestInputSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  requestId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Rejection reason is required")
    .max(1_000, "Rejection reason must be 1000 characters or less")
});

export const withdrawRequestInputSchema = z.object({
  requestId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128)
});

export const reopenRequestInputSchema = z.object({
  requestId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128)
});

export const finalDraftFieldsSchema = z.object({
  purpose: requiredSubmissionText("Purpose", 1_000),
  requestedRole: requestedStudyRoleInputSchema,
  justification: requiredSubmissionText("Justification", 2_000),
  affiliation: requiredSubmissionText("Affiliation", 300),
  supportingNotes: optionalDraftText(2_000)
});

export type DraftFields = z.infer<typeof draftFieldsSchema>;
export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type SubmitRequestInput = z.infer<typeof submitRequestInputSchema>;
export type StartReviewInput = z.infer<typeof startReviewInputSchema>;
export type ApproveRequestInput = z.infer<typeof approveRequestInputSchema>;
export type RejectRequestInput = z.infer<typeof rejectRequestInputSchema>;
export type WithdrawRequestInput = z.infer<typeof withdrawRequestInputSchema>;
export type ReopenRequestInput = z.infer<typeof reopenRequestInputSchema>;
export type FinalDraftFields = z.infer<typeof finalDraftFieldsSchema>;
export type DraftFieldName = keyof DraftFields;
export type CreateDraftInputFieldName = keyof CreateDraftInput;
export type SaveDraftInputFieldName = keyof SaveDraftInput;
export type SubmitRequestInputFieldName = keyof SubmitRequestInput;
export type StartReviewInputFieldName = keyof StartReviewInput;
export type ApproveRequestInputFieldName = keyof ApproveRequestInput;
export type RejectRequestInputFieldName = keyof RejectRequestInput;
export type WithdrawRequestInputFieldName = keyof WithdrawRequestInput;
export type ReopenRequestInputFieldName = keyof ReopenRequestInput;
