import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import {
  conflict,
  err,
  forbidden,
  fromZod,
  notFound,
  ok,
  unexpected,
  type AppError,
  type Result
} from "@accessflow/core";
import {
  activeStudyAccessRequestStatuses,
  transitionWorkflowStatus,
  type WorkflowEventType
} from "@accessflow/workflow";

import type { AuthenticatedActor } from "../../context";
import {
  idempotencyKeys,
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../../db/schema";
import { hashPayload, resolveIdempotencyReplay } from "../idempotency";
import {
  reopenRequestInputSchema,
  withdrawRequestInputSchema,
  type ReopenRequestInput,
  type ReopenRequestInputFieldName,
  type WithdrawRequestInput,
  type WithdrawRequestInputFieldName
} from "../validation";
import { isActiveRequestUniqueViolation } from "./active-request-constraint";
import { ensureRequester } from "./authorization";
import {
  abortCommand,
  defaultDependencies,
  rollbackCommandError
} from "./command-transaction";

type RequesterLifecycleEvent = Extract<
  WorkflowEventType,
  "withdrawRequest" | "reopenRequest"
>;

export type WithdrawRequestResult = {
  requestId: string;
  auditEventId: string;
  status: "withdrawn";
  updatedAt: string;
};

export type ReopenRequestResult = {
  requestId: string;
  draftId: string;
  auditEventId: string;
  status: "draft";
  updatedAt: string;
};

const withdrawRequestResultSchema = z.object({
  requestId: z.uuid(),
  auditEventId: z.uuid(),
  status: z.literal("withdrawn"),
  updatedAt: z.string().datetime()
});

const reopenRequestResultSchema = z.object({
  requestId: z.uuid(),
  draftId: z.uuid(),
  auditEventId: z.uuid(),
  status: z.literal("draft"),
  updatedAt: z.string().datetime()
});

type RequesterLifecycleCommandOptions<ResultValue> = {
  actor: AuthenticatedActor;
  eventType: RequesterLifecycleEvent;
  idempotencyKey: string;
  payloadHash: string;
  requestId: string;
  responseSchema: z.ZodType<ResultValue>;
  toResult: (context: {
    auditEventId: string;
    draftId: string | null;
    requestId: string;
    updatedAt: string;
  }) => ResultValue;
  resetToDraft: boolean;
  dependencies: typeof defaultDependencies;
};

const runRequesterLifecycleCommand = async <ResultValue>({
  actor,
  eventType,
  idempotencyKey,
  payloadHash,
  requestId,
  responseSchema,
  toResult,
  resetToDraft,
  dependencies
}: RequesterLifecycleCommandOptions<ResultValue>): Promise<
  Result<ResultValue, AppError>
> => {
  try {
    return await dependencies.db.transaction(async (tx) => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      const [pendingIdempotency] = await tx
        .insert(idempotencyKeys)
        .values({
          actorId: actor.id,
          commandName: eventType,
          key: idempotencyKey,
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
              eq(idempotencyKeys.commandName, eventType),
              eq(idempotencyKeys.key, idempotencyKey)
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
          eventType,
          payloadHash,
          existing,
          responseSchema
        );
      }

      const [request] = await tx
        .select({
          id: studyAccessRequests.id,
          requesterId: studyAccessRequests.requesterId,
          studyId: studyAccessRequests.studyId,
          status: studyAccessRequests.status
        })
        .from(studyAccessRequests)
        .where(eq(studyAccessRequests.id, requestId))
        .limit(1)
        .for("update");

      if (!request) {
        return abortCommand(notFound("Request not found"));
      }

      if (request.requesterId !== actor.id) {
        return abortCommand(forbidden("Cannot change another requester's access request"));
      }

      const transition = transitionWorkflowStatus(request.status, eventType);

      if (!transition.ok) {
        return abortCommand(transition.error);
      }

      let draftId: string | null = null;

      if (resetToDraft) {
        const [activeRequest] = await tx
          .select({ id: studyAccessRequests.id })
          .from(studyAccessRequests)
          .where(
            and(
              eq(studyAccessRequests.requesterId, actor.id),
              eq(studyAccessRequests.studyId, request.studyId),
              ne(studyAccessRequests.id, request.id),
              inArray(
                studyAccessRequests.status,
                activeStudyAccessRequestStatuses
              )
            )
          )
          .limit(1)
          .for("update");

        if (activeRequest) {
          return abortCommand(
            conflict("Requester already has an active request for this study")
          );
        }

        const [draft] = await tx
          .select({ id: studyAccessRequestDrafts.id })
          .from(studyAccessRequestDrafts)
          .where(eq(studyAccessRequestDrafts.requestId, request.id))
          .limit(1)
          .for("update");

        if (!draft) {
          return abortCommand(unexpected("Rejected request is missing its draft"));
        }

        draftId = draft.id;
      }

      const updatedAt = new Date();

      const [updatedRequest] = await tx
        .update(studyAccessRequests)
        .set(
          resetToDraft
            ? {
                status: transition.value.to,
                requestedRole: null,
                submittedAt: null,
                decidedAt: null,
                decisionNote: null,
                updatedAt
              }
            : {
                status: transition.value.to,
                updatedAt
              }
        )
        .where(
          and(
            eq(studyAccessRequests.id, request.id),
            eq(studyAccessRequests.status, transition.value.from)
          )
        )
        .returning({ id: studyAccessRequests.id });

      if (!updatedRequest) {
        return abortCommand(conflict("Request status changed before update"));
      }

      if (resetToDraft && draftId) {
        await tx
          .update(studyAccessRequestDrafts)
          .set({ updatedAt })
          .where(eq(studyAccessRequestDrafts.id, draftId));
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
            commandName: eventType
          }
        })
        .returning({ id: studyAccessAuditEvents.id });

      if (!auditEvent) {
        return abortCommand(unexpected("Audit event could not be created"));
      }

      const response = toResult({
        auditEventId: auditEvent.id,
        draftId,
        requestId: request.id,
        updatedAt: updatedAt.toISOString()
      });

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
    if (resetToDraft && isActiveRequestUniqueViolation(error)) {
      return err(
        conflict("Requester already has an active request for this study")
      );
    }

    return rollbackCommandError(error, dependencies);
  }
};

export const withdrawRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<WithdrawRequestResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<WithdrawRequestInput, WithdrawRequestInputFieldName>(
    withdrawRequestInputSchema.safeParse(input)
  );
  if (!parsed.ok) {
    return parsed;
  }

  const payloadHash = hashPayload(parsed.value);

  return runRequesterLifecycleCommand({
    actor,
    eventType: "withdrawRequest",
    idempotencyKey: parsed.value.idempotencyKey,
    payloadHash,
    requestId: parsed.value.requestId,
    responseSchema: withdrawRequestResultSchema,
    resetToDraft: false,
    dependencies,
    toResult: (context) => ({
      requestId: context.requestId,
      auditEventId: context.auditEventId,
      status: "withdrawn",
      updatedAt: context.updatedAt
    })
  });
};

export const reopenRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<ReopenRequestResult, AppError>> => {
  const actorResult = ensureRequester(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<ReopenRequestInput, ReopenRequestInputFieldName>(
    reopenRequestInputSchema.safeParse(input)
  );
  if (!parsed.ok) {
    return parsed;
  }

  const payloadHash = hashPayload(parsed.value);

  return runRequesterLifecycleCommand({
    actor,
    eventType: "reopenRequest",
    idempotencyKey: parsed.value.idempotencyKey,
    payloadHash,
    requestId: parsed.value.requestId,
    responseSchema: reopenRequestResultSchema,
    resetToDraft: true,
    dependencies,
    toResult: (context) => {
      if (!context.draftId) {
        throw new Error("Reopened request is missing its draft");
      }

      return {
        requestId: context.requestId,
        draftId: context.draftId,
        auditEventId: context.auditEventId,
        status: "draft",
        updatedAt: context.updatedAt
      };
    }
  });
};
