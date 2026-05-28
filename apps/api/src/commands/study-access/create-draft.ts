import { eq } from "drizzle-orm";

import {
  err,
  fromZod,
  notFound,
  ok,
  unexpected,
  type AppError,
  type Result
} from "@accessflow/core";

import type { AuthenticatedActor } from "../../context";
import {
  studies,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import { createDraftInputSchema } from "../validation";
import { ensureRequester } from "./authorization";
import {
  abortCommand,
  defaultDependencies,
  rollbackCommandError
} from "./command-transaction";
import { definedDraftValues } from "./draft-fields";

export type CreateDraftResult = {
  requestId: string;
  draftId: string;
  status: "draft";
};

export const createDraft = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<CreateDraftResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod(createDraftInputSchema.safeParse(input));
  if (!parsed.ok) {
    return parsed;
  }

  const [study] = await dependencies.db
    .select({ id: studies.id })
    .from(studies)
    .where(eq(studies.id, parsed.value.studyId))
    .limit(1);

  if (!study) {
    return err(notFound("Study not found"));
  }

  try {
    return await dependencies.db.transaction(async (tx) => {
      const draftValues = definedDraftValues(parsed.value);

      const [request] = await tx
        .insert(studyAccessRequests)
        .values({
          requesterId: actor.id,
          studyId: parsed.value.studyId,
          status: "draft",
          requestedRole: parsed.value.requestedRole ?? null
        })
        .returning({ id: studyAccessRequests.id });

      if (!request) {
        return abortCommand(unexpected("Draft request could not be created"));
      }

      const [draft] = await tx
        .insert(studyAccessRequestDrafts)
        .values({
          requestId: request.id,
          ownerId: actor.id,
          ...draftValues
        })
        .returning({ id: studyAccessRequestDrafts.id });

      if (!draft) {
        return abortCommand(unexpected("Draft could not be created"));
      }

      return ok({
        requestId: request.id,
        draftId: draft.id,
        status: "draft"
      });
    });
  } catch (error) {
    return rollbackCommandError(error);
  }
};
