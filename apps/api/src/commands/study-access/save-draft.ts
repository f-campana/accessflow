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
import { studyAccessRequestDrafts } from "../../db/schema";
import { saveDraftInputSchema, type DraftFields } from "../validation";
import { ensureRequester } from "./authorization";
import { defaultDependencies, rollbackCommandError } from "./command-transaction";
import { draftPatchValues, mergeDraftFields } from "./draft-fields";
import { readRequesterDraftForUpdate } from "./draft-record";

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

  try {
    return await dependencies.db.transaction(async (tx) => {
      const draftRecord = await readRequesterDraftForUpdate(
        tx,
        parsed.value.draftId
      );

      if (!draftRecord.ok) {
        return draftRecord;
      }

      if (!draftRecord.value) {
        return err(notFound("Draft not found"));
      }

      const ownedDraft = draftRecord.value;

      if (ownedDraft.requesterId !== actor.id || ownedDraft.ownerId !== actor.id) {
        return err(forbidden("Cannot update another requester's draft"));
      }

      if (ownedDraft.status !== "draft") {
        return err(invalidTransition("Only draft requests can be edited"));
      }

      const nextDraft = mergeDraftFields(ownedDraft.draft, parsed.value);

      await tx
        .update(studyAccessRequestDrafts)
        .set(draftPatchValues(parsed.value, new Date()))
        .where(eq(studyAccessRequestDrafts.id, parsed.value.draftId));

      return ok({
        requestId: ownedDraft.requestId,
        draftId: ownedDraft.draftId,
        status: "draft",
        draft: nextDraft
      });
    });
  } catch (error) {
    return rollbackCommandError(error, dependencies);
  }
};
