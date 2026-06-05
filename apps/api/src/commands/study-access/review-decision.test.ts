import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../db/client";
import {
  idempotencyKeys,
  studyAccessAuditEvents,
  studyAccessRequests
} from "../../db/schema";
import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "../../test-helpers/db";
import type { AuthenticatedActor } from "../../context";
import { createDraft } from "./create-draft";
import { defaultDependencies } from "./command-transaction";
import { approveRequest, rejectRequest } from "./review-decision";
import { startReview } from "./start-review";
import { submitRequest } from "./submit-request";
import { validSubmission } from "./test-data";

const createUnderReviewRequest = async () => {
  const requester = await createTestActor("requester");
  const reviewer = await createTestActor("reviewer");
  const study = await createTestStudy();
  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: `review-decision-submit-${crypto.randomUUID()}`,
    ...validSubmission
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  const started = await startReview(reviewer, {
    requestId: submitted.value.requestId,
    idempotencyKey: `review-decision-start-${crypto.randomUUID()}`
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  return {
    requestId: submitted.value.requestId,
    requester,
    reviewer
  };
};

const getRequest = async (requestId: string) => {
  const [request] = await db
    .select()
    .from(studyAccessRequests)
    .where(eq(studyAccessRequests.id, requestId))
    .limit(1);

  return request;
};

const getAuditEvents = async (requestId: string) =>
  db
    .select()
    .from(studyAccessAuditEvents)
    .where(eq(studyAccessAuditEvents.requestId, requestId))
    .orderBy(studyAccessAuditEvents.createdAt, studyAccessAuditEvents.id);

const decisionKey = (name: string) => `${name}-${crypto.randomUUID()}`;

describe("review decisions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it("approves an under-review request and writes a durable audit event", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();

    const result = await approveRequest(reviewer, {
      requestId,
      idempotencyKey: decisionKey("approve")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const request = await getRequest(requestId);
    const auditEvents = await getAuditEvents(requestId);

    expect(result.value).toMatchObject({
      requestId,
      status: "approved"
    });
    expect(request).toMatchObject({
      status: "approved",
      decisionNote: null
    });
    expect(request?.decidedAt).toBeInstanceOf(Date);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents.at(-1)).toMatchObject({
      id: result.value.auditEventId,
      actorId: reviewer.id,
      eventType: "approveRequest",
      fromStatus: "under_review",
      toStatus: "approved",
      note: null,
      metadata: {
        commandName: "approveRequest"
      }
    });
  });

  it("rejects an under-review request with a required durable note", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();
    const reason = "Requested access is broader than the current study need.";

    const result = await rejectRequest(reviewer, {
      requestId,
      idempotencyKey: decisionKey("reject"),
      reason
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const request = await getRequest(requestId);
    const auditEvents = await getAuditEvents(requestId);

    expect(result.value).toMatchObject({
      requestId,
      status: "rejected",
      decisionNote: reason
    });
    expect(request).toMatchObject({
      status: "rejected",
      decisionNote: reason
    });
    expect(request?.decidedAt).toBeInstanceOf(Date);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents.at(-1)).toMatchObject({
      id: result.value.auditEventId,
      actorId: reviewer.id,
      eventType: "rejectRequest",
      fromStatus: "under_review",
      toStatus: "rejected",
      note: reason,
      metadata: {
        commandName: "rejectRequest"
      }
    });
  });

  it("allows admin users to decide an under-review request", async () => {
    const { requestId } = await createUnderReviewRequest();
    const admin = await createTestActor("admin");

    const result = await approveRequest(admin, {
      requestId,
      idempotencyKey: decisionKey("admin-approve")
    });

    expect(result.ok).toBe(true);
  });

  it("forbids requester users from deciding requests", async () => {
    const { requestId, requester } = await createUnderReviewRequest();

    const result = await approveRequest(requester, { requestId });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "Forbidden",
        message: "Reviewer access required"
      });
    }
  });

  it("rejects blank rejection reasons without changing the request", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();

    const result = await rejectRequest(reviewer, {
      idempotencyKey: decisionKey("blank-reject"),
      requestId,
      reason: "   "
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "ValidationError",
        fieldErrors: {
          reason: ["Rejection reason is required"]
        }
      });
    }

    const request = await getRequest(requestId);
    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, requestId));

    expect(request?.status).toBe("under_review");
    expect(request?.decidedAt).toBeNull();
    expect(request?.decisionNote).toBeNull();
    expect(auditCount?.value).toBe(2);
  });

  it("returns not found for an unknown request", async () => {
    const reviewer = await createTestActor("reviewer");

    const result = await approveRequest(reviewer, {
      requestId: crypto.randomUUID(),
      idempotencyKey: decisionKey("not-found-approve")
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NotFound");
    }
  });

  it("rejects decisions before review starts", async () => {
    const requester = await createTestActor("requester");
    const reviewer = await createTestActor("reviewer");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(requester, {
      draftId: created.value.draftId,
      idempotencyKey: `review-decision-invalid-${crypto.randomUUID()}`,
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const result = await approveRequest(reviewer, {
      requestId: submitted.value.requestId,
      idempotencyKey: decisionKey("invalid-approve")
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("InvalidTransition");
    }
  });

  it("replays duplicate decisions with the same idempotency key", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();
    const idempotencyKey = decisionKey("replay-approve");

    const first = await approveRequest(reviewer, { requestId, idempotencyKey });
    const second = await approveRequest(reviewer, { requestId, idempotencyKey });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toEqual(first.value);
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, requestId));
    const [idempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey));

    expect(auditCount?.value).toBe(3);
    expect(idempotencyCount?.value).toBe(1);
  });

  it("rejects duplicate decision keys with different payloads", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();
    const idempotencyKey = decisionKey("reject-conflict");
    const firstReason = "Initial reviewer reason.";
    const secondReason = "Changed reviewer reason.";

    const first = await rejectRequest(reviewer, {
      requestId,
      idempotencyKey,
      reason: firstReason
    });
    const second = await rejectRequest(reviewer, {
      requestId,
      idempotencyKey,
      reason: secondReason
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("IdempotencyConflict");
    }

    const request = await getRequest(requestId);
    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, requestId));

    expect(request?.decisionNote).toBe(firstReason);
    expect(auditCount?.value).toBe(3);
  });

  it("does not write a second decision audit event for a new duplicate decision", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();

    const first = await approveRequest(reviewer, {
      requestId,
      idempotencyKey: decisionKey("first-approve")
    });
    const second = await approveRequest(reviewer, {
      requestId,
      idempotencyKey: decisionKey("second-approve")
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("InvalidTransition");
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, requestId));

    expect(auditCount?.value).toBe(3);
  });

  it("rejects impossible decision audit triples at the database boundary", async () => {
    const { requestId, reviewer } = await createUnderReviewRequest();

    let caught: unknown;

    try {
      await db.insert(studyAccessAuditEvents).values({
        requestId,
        actorId: reviewer.id,
        eventType: "approveRequest",
        fromStatus: "submitted",
        toStatus: "approved"
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { cause?: unknown }).cause).toMatchObject({
      code: "23514",
      constraint: "study_access_audit_events_transition_check"
    });
  });

  it("rejects rejected requests without a decision note at the database boundary", async () => {
    const { requestId } = await createUnderReviewRequest();

    let caught: unknown;

    try {
      await db
        .update(studyAccessRequests)
        .set({
          status: "rejected",
          decidedAt: new Date(),
          decisionNote: null
        })
        .where(eq(studyAccessRequests.id, requestId));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { cause?: unknown }).cause).toMatchObject({
      code: "23514",
      constraint: "study_access_requests_state_fields_check"
    });
  });

  it("normalizes unexpected dependency failures", async () => {
    const reviewer: AuthenticatedActor = {
      id: crypto.randomUUID(),
      email: "reviewer@example.test",
      role: "reviewer"
    };
    const failure = new Error("database unavailable");
    const reportUnexpectedError = vi.fn();

    const result = await approveRequest(
      reviewer,
      {
        requestId: crypto.randomUUID(),
        idempotencyKey: decisionKey("dependency-approve")
      },
      {
        ...defaultDependencies,
        db: {
          transaction: async () => {
            throw failure;
          }
        } as unknown as typeof defaultDependencies.db,
        reportUnexpectedError
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Unexpected");
      expect(result.error.message).toBe("Unexpected command failure");
    }
    expect(reportUnexpectedError).toHaveBeenCalledWith(failure);
  });
});
