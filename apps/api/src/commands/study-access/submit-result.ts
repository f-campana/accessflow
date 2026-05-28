import { z } from "zod";

import { finalDraftFieldsSchema, type FinalDraftFields } from "../validation";

export type SubmitRequestResult = {
  requestId: string;
  auditEventId: string;
  status: "submitted";
  submittedAt: string;
  draft: FinalDraftFields;
};

export const submitRequestResultSchema = z.object({
  requestId: z.uuid(),
  auditEventId: z.uuid(),
  status: z.literal("submitted"),
  submittedAt: z.string().datetime(),
  draft: finalDraftFieldsSchema
});
