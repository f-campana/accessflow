import { and, eq } from "drizzle-orm";

import {
  conflict,
  forbidden,
  fromZod,
  notFound,
  ok,
  unexpected,
  type AppError,
  type Result
} from "@accessflow/core";
import { transitionWorkflowStatus } from "@accessflow/workflow";

import type { AuthenticatedActor } from "../../context";
import {
  idempotencyKeys,
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import { hashPayload, resolveIdempotencyReplay } from "../idempotency";
import {
  submitRequestInputSchema,
  type SubmitRequestInput,
  type SubmitRequestInputFieldName
} from "../validation";
import { ensureRequester } from "./authorization";
import {
  abortCommand,
  defaultDependencies,
  rollbackCommandError
} from "./command-transaction";
import {
  finalDraftPatchValues,
  mergeDraftFields,
  validateFinalDraft
} from "./draft-fields";
import { readRequesterDraftForUpdate } from "./draft-record";
import {
  submitRequestResultSchema,
  type SubmitRequestResult
} from "./submit-result";

export const submitRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<SubmitRequestResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<SubmitRequestInput, SubmitRequestInputFieldName>(
    submitRequestInputSchema.safeParse(input)
  );
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

      const draftRecord = await readRequesterDraftForUpdate(
        tx,
        parsed.value.draftId
      );

      if (!draftRecord.ok) {
        return abortCommand(draftRecord.error);
      }

      if (!draftRecord.value) {
        return abortCommand(notFound("Draft not found"));
      }

      const ownedDraft = draftRecord.value;

      if (ownedDraft.requesterId !== actor.id || ownedDraft.ownerId !== actor.id) {
        return abortCommand(forbidden("Cannot submit another requester's draft"));
      }

      const finalDraftCandidate = mergeDraftFields(
        ownedDraft.draft,
        parsed.value
      );
      const finalDraft = validateFinalDraft(finalDraftCandidate);

      if (!finalDraft.ok) {
        return abortCommand(finalDraft.error);
      }

      const transition = transitionWorkflowStatus(
        ownedDraft.status,
        "submitRequest"
      );

      if (!transition.ok) {
        return abortCommand(transition.error);
      }

      const submittedAt = new Date();

      await tx
        .update(studyAccessRequestDrafts)
        .set(finalDraftPatchValues(finalDraft.value, submittedAt))
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
            eq(studyAccessRequests.id, ownedDraft.requestId),
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
          requestId: ownedDraft.requestId,
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
        requestId: ownedDraft.requestId,
        auditEventId: auditEvent.id,
        status: "submitted",
        submittedAt: submittedAt.toISOString(),
        draft: finalDraft.value
      };

      const [completedIdempotency] = await tx
        .update(idempotencyKeys)
        .set({
          status: "completed",
          resultReference: ownedDraft.requestId,
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
    return rollbackCommandError(error, dependencies);
  }
};
