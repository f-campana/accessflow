import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  err,
  forbidden,
  fromZod,
  conflict,
  invalidTransition,
  notFound,
  ok,
  unexpected,
  validationError,
  type AppError,
  type Result
} from "@accessflow/core";
import { transitionWorkflowStatus } from "@accessflow/workflow";

import type { AuthenticatedActor } from "../context";
import { db } from "../db/client";
import {
  idempotencyKeys,
  studies,
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../db/schema";
import {
  finalDraftFieldsSchema,
  createDraftInputSchema,
  saveDraftInputSchema,
  submitRequestInputSchema,
  type DraftFields,
  type FinalDraftFields
} from "./validation";
import { hashPayload, resolveIdempotencyReplay } from "./idempotency";
import type { CommandDependencies } from "./types";
import { requesterOnly } from "./types";

const defaultDependencies: CommandDependencies = {
  db
};

class CommandAbort extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

const abortCommand = (error: AppError): never => {
  throw new CommandAbort(error);
};

const rollbackCommandError = (error: unknown): Result<never, AppError> => {
  if (error instanceof CommandAbort) {
    return err(error.appError);
  }

  throw error;
};

export type CreateDraftResult = {
  requestId: string;
  draftId: string;
  status: "draft";
};

export type SaveDraftResult = {
  requestId: string;
  draftId: string;
  status: "draft";
  draft: DraftFields;
};

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

const ensureRequester = (actor: AuthenticatedActor): Result<true, AppError> =>
  requesterOnly(actor)
    ? ok(true)
    : err(forbidden("Only requesters can manage access request drafts"));

const definedDraftValues = (draft: DraftFields) =>
  ({
    ...(draft.purpose !== undefined ? { purpose: draft.purpose } : {}),
    ...(draft.requestedRole !== undefined
      ? { requestedRole: draft.requestedRole }
      : {}),
    ...(draft.justification !== undefined
      ? { justification: draft.justification }
      : {}),
    ...(draft.affiliation !== undefined
      ? { affiliation: draft.affiliation }
      : {}),
    ...(draft.supportingNotes !== undefined
      ? { supportingNotes: draft.supportingNotes }
      : {})
  }) satisfies Partial<DraftFields>;

const mergeDraftFields = (
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

const readDraftFields = (draft: {
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

const validateFinalDraft = (
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
        formErrors: [
          "Complete the draft before submitting the access request."
        ]
      }
    : {
        formErrors: [
          "Complete the draft before submitting the access request."
        ]
      };

  return err(
    validationError(
      "Draft is missing required submission fields",
      validationOptions
    )
  );
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

export const submitRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<SubmitRequestResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod(submitRequestInputSchema.safeParse(input));
  if (!parsed.ok) {
    return parsed;
  }

  const payloadHash = hashPayload(parsed.value);

  try {
    return await dependencies.db.transaction(async (tx) => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      const [pendingIdempotency] = await tx
        .insert(idempotencyKeys)
        .values({
          actorId: actor.id,
          commandName: "submitRequest",
          key: parsed.value.idempotencyKey,
          payloadHash,
          status: "pending",
          expiresAt
        })
        .onConflictDoNothing({
          target: [
            idempotencyKeys.actorId,
            idempotencyKeys.commandName,
            idempotencyKeys.key
          ]
        })
        .returning({ id: idempotencyKeys.id });

      if (!pendingIdempotency) {
        const [existing] = await tx
          .select()
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.actorId, actor.id),
              eq(idempotencyKeys.commandName, "submitRequest"),
              eq(idempotencyKeys.key, parsed.value.idempotencyKey)
            )
          )
          .limit(1)
          .for("update");

        if (!existing) {
          return abortCommand(
            unexpected("Idempotency record could not be resolved")
          );
        }

        return resolveIdempotencyReplay(
          "submitRequest",
          payloadHash,
          existing,
          submitRequestResultSchema
        );
      }

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
        return abortCommand(notFound("Draft not found"));
      }

      if (draftRecord.ownerId !== actor.id) {
        return abortCommand(forbidden("Cannot submit another requester's draft"));
      }

      const currentDraft = readDraftFields(draftRecord);

      if (!currentDraft.ok) {
        return abortCommand(currentDraft.error);
      }

      const finalDraftCandidate = mergeDraftFields(
        currentDraft.value,
        parsed.value
      );
      const finalDraft = validateFinalDraft(finalDraftCandidate);

      if (!finalDraft.ok) {
        return abortCommand(finalDraft.error);
      }

      const transition = transitionWorkflowStatus(
        draftRecord.status,
        "submitRequest"
      );

      if (!transition.ok) {
        return abortCommand(transition.error);
      }

      const submittedAt = new Date();

      await tx
        .update(studyAccessRequestDrafts)
        .set({
          purpose: finalDraft.value.purpose,
          requestedRole: finalDraft.value.requestedRole,
          justification: finalDraft.value.justification,
          affiliation: finalDraft.value.affiliation,
          supportingNotes: finalDraft.value.supportingNotes ?? null,
          updatedAt: submittedAt
        })
        .where(eq(studyAccessRequestDrafts.id, parsed.value.draftId));

      const [updatedRequest] = await tx
        .update(studyAccessRequests)
        .set({
          requestedRole: finalDraft.value.requestedRole,
          status: transition.value.to,
          submittedAt,
          updatedAt: submittedAt
        })
        .where(
          and(
            eq(studyAccessRequests.id, draftRecord.requestId),
            eq(studyAccessRequests.status, transition.value.from)
          )
        )
        .returning({ id: studyAccessRequests.id });

      if (!updatedRequest) {
        return abortCommand(conflict("Request status changed before submission"));
      }

      const [auditEvent] = await tx
        .insert(studyAccessAuditEvents)
        .values({
          requestId: draftRecord.requestId,
          actorId: actor.id,
          eventType: transition.value.eventType,
          fromStatus: transition.value.from,
          toStatus: transition.value.to,
          metadata: {
            commandName: "submitRequest",
            idempotencyKey: parsed.value.idempotencyKey,
            payloadHash
          }
        })
        .returning({ id: studyAccessAuditEvents.id });

      if (!auditEvent) {
        return abortCommand(unexpected("Audit event could not be created"));
      }

      const response: SubmitRequestResult = {
        requestId: draftRecord.requestId,
        auditEventId: auditEvent.id,
        status: "submitted",
        submittedAt: submittedAt.toISOString(),
        draft: finalDraft.value
      };

      const [completedIdempotency] = await tx
        .update(idempotencyKeys)
        .set({
          status: "completed",
          resultReference: draftRecord.requestId,
          responsePayload: response,
          completedAt: submittedAt
        })
        .where(eq(idempotencyKeys.id, pendingIdempotency.id))
        .returning({ id: idempotencyKeys.id });

      if (!completedIdempotency) {
        return abortCommand(
          unexpected("Idempotency record could not be completed")
        );
      }

      return ok(response);
    });
  } catch (error) {
    return rollbackCommandError(error);
  }
};
