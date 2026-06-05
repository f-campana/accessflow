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
import {
  transitionWorkflowStatus,
  type WorkflowEventType
} from "@accessflow/workflow";

import type { AuthenticatedActor } from "../../context";
import {
  idempotencyKeys,
  studyAccessAuditEvents,
  studyAccessRequests
} from "../../db/schema";
import { hashPayload, resolveIdempotencyReplay } from "../idempotency";
import {
  approveRequestInputSchema,
  rejectRequestInputSchema,
  type ApproveRequestInput,
  type ApproveRequestInputFieldName,
  type RejectRequestInput,
  type RejectRequestInputFieldName
} from "../validation";
import { ensureReviewer } from "./authorization";
import {
  abortCommand,
  defaultDependencies,
  rollbackCommandError
} from "./command-transaction";

type ReviewDecisionStatus = "approved" | "rejected";

type ReviewDecisionResult<Status extends ReviewDecisionStatus> = {
  requestId: string;
  auditEventId: string;
  status: Status;
  decidedAt: string;
  updatedAt: string;
};

export type ApproveRequestResult = ReviewDecisionResult<"approved">;

export type RejectRequestResult = ReviewDecisionResult<"rejected"> & {
  decisionNote: string;
};

const approveRequestResultSchema = z.object({
  requestId: z.uuid(),
  auditEventId: z.uuid(),
  status: z.literal("approved"),
  decidedAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const rejectRequestResultSchema = approveRequestResultSchema.extend({
  status: z.literal("rejected"),
  decisionNote: z.string().min(1)
});

type ReviewDecisionCommand = {
  actor: AuthenticatedActor;
  requestId: string;
  idempotencyKey: string;
  eventType: Extract<WorkflowEventType, "approveRequest" | "rejectRequest">;
  decisionNote: string | null;
  dependencies: typeof defaultDependencies;
  payloadHash: string;
};

type ReviewDecisionResultContext = {
  requestId: string;
  auditEventId: string;
  decidedAt: string;
  updatedAt: string;
};

type ReviewDecisionCommandOptions<ResultValue> = ReviewDecisionCommand & {
  responseSchema: z.ZodType<ResultValue>;
  toResult: (context: ReviewDecisionResultContext) => ResultValue;
};

const decisionStatusChangedCopy = {
  approveRequest: "Request status changed before approval",
  rejectRequest: "Request status changed before rejection"
} satisfies Record<ReviewDecisionCommand["eventType"], string>;

const runReviewDecision = async <ResultValue>({
  actor,
  requestId,
  idempotencyKey,
  eventType,
  decisionNote,
  dependencies,
  payloadHash,
  responseSchema,
  toResult
}: ReviewDecisionCommandOptions<ResultValue>): Promise<
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
          status: studyAccessRequests.status
        })
        .from(studyAccessRequests)
        .where(eq(studyAccessRequests.id, requestId))
        .limit(1)
        .for("update");

      if (!request) {
        return abortCommand(notFound("Request not found"));
      }

      const transition = transitionWorkflowStatus(request.status, eventType);

      if (!transition.ok) {
        return abortCommand(transition.error);
      }

      const decidedAt = new Date();

      const [updatedRequest] = await tx
        .update(studyAccessRequests)
        .set({
          status: transition.value.to,
          decidedAt,
          decisionNote,
          updatedAt: decidedAt
        })
        .where(
          and(
            eq(studyAccessRequests.id, request.id),
            eq(studyAccessRequests.status, transition.value.from)
          )
        )
        .returning({ id: studyAccessRequests.id });

      if (!updatedRequest) {
        return abortCommand(conflict(decisionStatusChangedCopy[eventType]));
      }

      const [auditEvent] = await tx
        .insert(studyAccessAuditEvents)
        .values({
          requestId: request.id,
          actorId: actor.id,
          eventType: transition.value.eventType,
          fromStatus: transition.value.from,
          toStatus: transition.value.to,
          note: decisionNote,
          metadata: {
            commandName: eventType
          }
        })
        .returning({ id: studyAccessAuditEvents.id });

      if (!auditEvent) {
        return abortCommand(unexpected("Audit event could not be created"));
      }

      const resultContext = {
        requestId: request.id,
        auditEventId: auditEvent.id,
        decidedAt: decidedAt.toISOString(),
        updatedAt: decidedAt.toISOString()
      };

      const response = toResult(resultContext);

      const [completedIdempotency] = await tx
        .update(idempotencyKeys)
        .set({
          status: "completed",
          resultReference: request.id,
          responsePayload: response,
          completedAt: decidedAt
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

export const approveRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<ApproveRequestResult, AppError>> => {
  const actorResult = ensureReviewer(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<ApproveRequestInput, ApproveRequestInputFieldName>(
    approveRequestInputSchema.safeParse(input)
  );
  if (!parsed.ok) {
    return parsed;
  }

  const payloadHash = hashPayload(parsed.value);

  return runReviewDecision({
    actor,
    requestId: parsed.value.requestId,
    idempotencyKey: parsed.value.idempotencyKey,
    eventType: "approveRequest",
    decisionNote: null,
    dependencies,
    payloadHash,
    responseSchema: approveRequestResultSchema,
    toResult: (context) => ({
      ...context,
      status: "approved"
    })
  });
};

export const rejectRequest = async (
  actor: AuthenticatedActor,
  input: unknown,
  dependencies = defaultDependencies
): Promise<Result<RejectRequestResult, AppError>> => {
  const actorResult = ensureReviewer(actor);
  if (!actorResult.ok) {
    return actorResult;
  }

  const parsed = fromZod<RejectRequestInput, RejectRequestInputFieldName>(
    rejectRequestInputSchema.safeParse(input)
  );
  if (!parsed.ok) {
    return parsed;
  }

  const payloadHash = hashPayload(parsed.value);

  return runReviewDecision({
    actor,
    requestId: parsed.value.requestId,
    idempotencyKey: parsed.value.idempotencyKey,
    eventType: "rejectRequest",
    decisionNote: parsed.value.reason,
    dependencies,
    payloadHash,
    responseSchema: rejectRequestResultSchema,
    toResult: (context) => ({
      ...context,
      status: "rejected",
      decisionNote: parsed.value.reason
    })
  });
};
