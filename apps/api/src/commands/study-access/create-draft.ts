import { and, eq, inArray } from "drizzle-orm";

import {
  conflict,
  err,
  fromZod,
  notFound,
  ok,
  unexpected,
  type AppError,
  type Result
} from "@accessflow/core";
import {
  activeStudyAccessRequestStatuses,
  type StudyAccessRequestStatus
} from "@accessflow/workflow";

import type { AuthenticatedActor } from "../../context";
import {
  studies,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import {
  createDraftInputSchema,
  type CreateDraftInput,
  type CreateDraftInputFieldName
} from "../validation";
import type { CommandDependencies } from "../types";
import { isActiveRequestUniqueViolation } from "./active-request-constraint";
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

type ActiveRequesterStudyRequest = {
  requestId: string;
  status: StudyAccessRequestStatus;
  draftId: string | null;
};

const readActiveRequesterStudyRequest = async (
  actorId: string,
  studyId: string,
  dependencies: CommandDependencies
): Promise<ActiveRequesterStudyRequest | null> => {
  const [activeRequest] = await dependencies.db
    .select({
      requestId: studyAccessRequests.id,
      status: studyAccessRequests.status,
      draftId: studyAccessRequestDrafts.id
    })
    .from(studyAccessRequests)
    .leftJoin(
      studyAccessRequestDrafts,
      eq(studyAccessRequestDrafts.requestId, studyAccessRequests.id)
    )
    .where(
      and(
        eq(studyAccessRequests.requesterId, actorId),
        eq(studyAccessRequests.studyId, studyId),
        inArray(studyAccessRequests.status, activeStudyAccessRequestStatuses)
      )
    )
    .limit(1);

  return activeRequest ?? null;
};

const activeRequestResult = (
  activeRequest: ActiveRequesterStudyRequest
): Result<CreateDraftResult, AppError> => {
  if (activeRequest.status !== "draft") {
    return err(
      conflict(
        `Requester already has an active ${activeRequest.status} request for this study`
      )
    );
  }

  if (!activeRequest.draftId) {
    return err(unexpected("Active draft request is missing its draft"));
  }

  return ok({
    requestId: activeRequest.requestId,
    draftId: activeRequest.draftId,
    status: "draft"
  });
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

  const parsed = fromZod<CreateDraftInput, CreateDraftInputFieldName>(
    createDraftInputSchema.safeParse(input)
  );
  if (!parsed.ok) {
    return parsed;
  }

  try {
    const [study] = await dependencies.db
      .select({ id: studies.id })
      .from(studies)
      .where(eq(studies.id, parsed.value.studyId))
      .limit(1);

    if (!study) {
      return err(notFound("Study not found"));
    }

    const activeRequest = await readActiveRequesterStudyRequest(
      actor.id,
      parsed.value.studyId,
      dependencies
    );

    if (activeRequest) {
      return activeRequestResult(activeRequest);
    }

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
    if (isActiveRequestUniqueViolation(error)) {
      try {
        const currentActiveRequest = await readActiveRequesterStudyRequest(
          actor.id,
          parsed.value.studyId,
          dependencies
        );

        if (currentActiveRequest) {
          return activeRequestResult(currentActiveRequest);
        }

        return err(
          conflict("Requester already has an active request for this study")
        );
      } catch (readError) {
        dependencies.reportUnexpectedError(readError);
        return err(unexpected("Unexpected command failure"));
      }
    }

    return rollbackCommandError(error, dependencies);
  }
};
