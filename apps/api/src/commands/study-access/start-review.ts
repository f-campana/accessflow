import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  conflict,
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
  studyAccessRequests
} from "../../db/schema";
import { hashPayload, resolveIdempotencyReplay } from "../idempotency";
import {
  startReviewInputSchema,
  type StartReviewInput,
  type StartReviewInputFieldName
} from "../validation";
import { ensureReviewer } from "./authorization";
import {
  abortCommand,
  defaultDependencies,
  rollbackCommandError
} from "./command-transaction";

export type StartReviewResult = {
  requestId: string;
  auditEventId: string;
  status: "under_review";
  updatedAt: string;
};

const startReviewResultSchema = z.object({
  requestId: z.uuid(),
  auditEventId: z.uuid(),
  status: z.literal("under_review"),
  updatedAt: z.string().datetime()
});

export const startReview = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<StartReviewResult, AppError>> => {
  const actorResult = ensureReviewer(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<StartReviewInput, StartReviewInputFieldName>(
    startReviewInputSchema.safeParse(input)
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
          commandName: "startReview",
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
              eq(idempotencyKeys.commandName, "startReview"),
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
          "startReview",
          payloadHash,
          existing,
          startReviewResultSchema
        );
      }

      const [request] = await tx
        .select({
          id: studyAccessRequests.id,
          status: studyAccessRequests.status
        })
        .from(studyAccessRequests)
        .where(eq(studyAccessRequests.id, parsed.value.requestId))
        .limit(1)
        .for("update");

      if (!request) {
        return abortCommand(notFound("Request not found"));
      }

      const transition = transitionWorkflowStatus(request.status, "startReview");

      if (!transition.ok) {
        return abortCommand(transition.error);
      }

      const updatedAt = new Date();

      const [updatedRequest] = await tx
        .update(studyAccessRequests)
        .set({
          status: transition.value.to,
          updatedAt
        })
        .where(
          and(
            eq(studyAccessRequests.id, request.id),
            eq(studyAccessRequests.status, transition.value.from)
          )
        )
        .returning({ id: studyAccessRequests.id });

      if (!updatedRequest) {
        return abortCommand(
          conflict("Request status changed before review started")
        );
      }

      const [auditEvent] = await tx
        .insert(studyAccessAuditEvents)
        .values({
          requestId: request.id,
          actorId: actor.id,
          eventType: transition.value.eventType,
          fromStatus: transition.value.from,
          toStatus: transition.value.to,
          metadata: {
            commandName: "startReview"
          }
        })
        .returning({ id: studyAccessAuditEvents.id });

      if (!auditEvent) {
        return abortCommand(unexpected("Audit event could not be created"));
      }

      const response = {
        requestId: request.id,
        auditEventId: auditEvent.id,
        status: "under_review",
        updatedAt: updatedAt.toISOString()
      } satisfies StartReviewResult;

      const [completedIdempotency] = await tx
        .update(idempotencyKeys)
        .set({
          status: "completed",
          resultReference: request.id,
          responsePayload: response,
          completedAt: updatedAt
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
