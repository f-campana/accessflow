import { and, eq } from "drizzle-orm";

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
  studyAccessAuditEvents,
  studyAccessRequests
} from "../../db/schema";
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

type ReviewDecisionCommand = {
  actor: AuthenticatedActor;
  requestId: string;
  eventType: Extract<WorkflowEventType, "approveRequest" | "rejectRequest">;
  decisionNote: string | null;
  dependencies: typeof defaultDependencies;
};

type ReviewDecisionResultContext = {
  requestId: string;
  auditEventId: string;
  decidedAt: string;
  updatedAt: string;
};

type ReviewDecisionCommandOptions<ResultValue> = ReviewDecisionCommand & {
  toResult: (context: ReviewDecisionResultContext) => ResultValue;
};

const decisionStatusChangedCopy = {
  approveRequest: "Request status changed before approval",
  rejectRequest: "Request status changed before rejection"
} satisfies Record<ReviewDecisionCommand["eventType"], string>;

const runReviewDecision = async <ResultValue>({
  actor,
  requestId,
  eventType,
  decisionNote,
  dependencies,
  toResult
}: ReviewDecisionCommandOptions<ResultValue>): Promise<
  Result<ResultValue, AppError>
> => {
  try {
    return await dependencies.db.transaction(async (tx) => {
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

      return ok(toResult(resultContext));
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

  return runReviewDecision({
    actor,
    requestId: parsed.value.requestId,
    eventType: "approveRequest",
    decisionNote: null,
    dependencies,
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

  return runReviewDecision({
    actor,
    requestId: parsed.value.requestId,
    eventType: "rejectRequest",
    decisionNote: parsed.value.reason,
    dependencies,
    toResult: (context) => ({
      ...context,
      status: "rejected",
      decisionNote: parsed.value.reason
    })
  });
};
