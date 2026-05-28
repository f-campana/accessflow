import { z } from "zod";

import {
  err,
  fromZod,
  ok,
  unexpected,
  validationError,
  type AppError,
  type Result
} from "@accessflow/core";

import {
  finalDraftFieldsSchema,
  type DraftFields,
  type FinalDraftFields
} from "../validation";

export const definedDraftValues = (draft: DraftFields) =>
  ({
    ...(draft.purpose !== undefined ? { purpose: draft.purpose } : {}),
    ...(draft.requestedRole !== undefined
      ? { requestedRole: draft.requestedRole }
      : {}),
    ...(draft.justification !== undefined
      ? { justification: draft.justification }
      : {}),
    ...(draft.affiliation !== undefined ? { affiliation: draft.affiliation } : {}),
    ...(draft.supportingNotes !== undefined
      ? { supportingNotes: draft.supportingNotes }
      : {})
  }) satisfies Partial<DraftFields>;

export const mergeDraftFields = (
  current: DraftFields,
  updates: DraftFields
): DraftFields => ({
  purpose: updates.purpose !== undefined ? updates.purpose : current.purpose,
  requestedRole:
    updates.requestedRole !== undefined
      ? updates.requestedRole
      : current.requestedRole,
  justification:
    updates.justification !== undefined
      ? updates.justification
      : current.justification,
  affiliation:
    updates.affiliation !== undefined ? updates.affiliation : current.affiliation,
  supportingNotes:
    updates.supportingNotes !== undefined
      ? updates.supportingNotes
      : current.supportingNotes
});

export const readDraftFields = (draft: {
  purpose: string | null;
  requestedRole: string | null;
  justification: string | null;
  affiliation: string | null;
  supportingNotes: string | null;
}): Result<DraftFields, AppError> => {
  const parsed = fromZod(
    z
      .object({
        purpose: z.string().nullable(),
        requestedRole: z.enum(["viewer", "analyst"]).nullable(),
        justification: z.string().nullable(),
        affiliation: z.string().nullable(),
        supportingNotes: z.string().nullable()
      })
      .safeParse(draft)
  );

  if (!parsed.ok) {
    return err(unexpected("Persisted draft data is invalid"));
  }

  return parsed;
};

export const validateFinalDraft = (
  draft: DraftFields
): Result<FinalDraftFields, AppError> => {
  const parsed = finalDraftFieldsSchema.safeParse(draft);

  if (parsed.success) {
    return ok(parsed.data);
  }

  const base = fromZod<FinalDraftFields>(parsed);

  if (base.ok) {
    return base;
  }

  const validationOptions = base.error.fieldErrors
    ? {
        fieldErrors: base.error.fieldErrors,
        formErrors: ["Complete the draft before submitting the access request."]
      }
    : {
        formErrors: ["Complete the draft before submitting the access request."]
      };

  return err(
    validationError(
      "Draft is missing required submission fields",
      validationOptions
    )
  );
};
