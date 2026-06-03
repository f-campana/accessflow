import { eq } from "drizzle-orm";

import { err, ok, type AppError, type Result } from "@accessflow/core";

import type { AppDatabase } from "../../db/client";
import {
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import type { DraftFields } from "../validation";
import { readDraftFields } from "./draft-fields";

type AppTransaction = Parameters<
  Parameters<AppDatabase["transaction"]>[0]
>[0];

export type RequesterDraftForUpdate = {
  draft: DraftFields;
  draftId: string;
  ownerId: string;
  requesterId: string;
  requestId: string;
  status: typeof studyAccessRequests.$inferSelect.status;
};

export const readRequesterDraftForUpdate = async (
  tx: AppTransaction,
  draftId: string
): Promise<Result<RequesterDraftForUpdate | null, AppError>> => {
  const [draftRecord] = await tx
    .select({
      draftId: studyAccessRequestDrafts.id,
      requestId: studyAccessRequestDrafts.requestId,
      ownerId: studyAccessRequestDrafts.ownerId,
      requesterId: studyAccessRequests.requesterId,
      status: studyAccessRequests.status,
      purpose: studyAccessRequestDrafts.purpose,
      requestedRole: studyAccessRequestDrafts.requestedRole,
      justification: studyAccessRequestDrafts.justification,
      affiliation: studyAccessRequestDrafts.affiliation,
      supportingNotes: studyAccessRequestDrafts.supportingNotes
    })
    .from(studyAccessRequestDrafts)
    .innerJoin(
      studyAccessRequests,
      eq(studyAccessRequestDrafts.requestId, studyAccessRequests.id)
    )
    .where(eq(studyAccessRequestDrafts.id, draftId))
    .limit(1)
    .for("update");

  if (!draftRecord) {
    return ok(null);
  }

  const draft = readDraftFields(draftRecord);

  if (!draft.ok) {
    return err(draft.error);
  }

  return ok({
    draft: draft.value,
    draftId: draftRecord.draftId,
    ownerId: draftRecord.ownerId,
    requesterId: draftRecord.requesterId,
    requestId: draftRecord.requestId,
    status: draftRecord.status
  });
};
