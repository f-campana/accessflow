import { eq } from "drizzle-orm";

import {
  err,
  forbidden,
  fromZod,
  invalidTransition,
  notFound,
  ok,
  type AppError,
  type Result
} from "@accessflow/core";

import type { AuthenticatedActor } from "../../context";
import {
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import { saveDraftInputSchema, type DraftFields } from "../validation";
import { ensureRequester } from "./authorization";
import { defaultDependencies } from "./command-transaction";
import {
  definedDraftValues,
  mergeDraftFields,
  readDraftFields
} from "./draft-fields";

export type SaveDraftResult = {
  requestId: string;
  draftId: string;
  status: "draft";
  draft: DraftFields;
};

export const saveDraft = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<SaveDraftResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod(saveDraftInputSchema.safeParse(input));
  if (!parsed.ok) {
    return parsed;
  }

  return dependencies.db.transaction(async (tx) => {
    const [draftRecord] = await tx
      .select({
        draftId: studyAccessRequestDrafts.id,
        requestId: studyAccessRequestDrafts.requestId,
        ownerId: studyAccessRequestDrafts.ownerId,
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
      .where(eq(studyAccessRequestDrafts.id, parsed.value.draftId))
      .limit(1)
      .for("update");

    if (!draftRecord) {
      return err(notFound("Draft not found"));
    }

    if (draftRecord.ownerId !== actor.id) {
      return err(forbidden("Cannot update another requester's draft"));
    }

    if (draftRecord.status !== "draft") {
      return err(invalidTransition("Only draft requests can be edited"));
    }

    const currentDraft = readDraftFields(draftRecord);

    if (!currentDraft.ok) {
      return currentDraft;
    }

    const nextDraft = mergeDraftFields(currentDraft.value, parsed.value);
    const updateValues = definedDraftValues(parsed.value);

    await tx
      .update(studyAccessRequestDrafts)
      .set({
        ...updateValues,
        updatedAt: new Date()
      })
      .where(eq(studyAccessRequestDrafts.id, parsed.value.draftId));

    return ok({
      requestId: draftRecord.requestId,
      draftId: draftRecord.draftId,
      status: "draft",
      draft: nextDraft
    });
  });
};
