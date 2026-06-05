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
import { createDraft } from "./create-draft";
import { defaultDependencies } from "./command-transaction";
import { startReview } from "./start-review";
import { submitRequest } from "./submit-request";
import { validSubmission } from "./test-data";

const createSubmittedRequest = async () => {
  const requester = await createTestActor("requester");
  const study = await createTestStudy();
  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: `start-review-submit-${crypto.randomUUID()}`,
    ...validSubmission
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  return {
    requestId: submitted.value.requestId
  };
};

const reviewKey = (name: string) => `${name}-${crypto.randomUUID()}`;

describe("startReview", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it("moves a submitted request under review with one durable audit event", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequest();

    const result = await startReview(reviewer, {
      requestId: submitted.requestId,
      idempotencyKey: reviewKey("start")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [request] = await db
      .select()
      .from(studyAccessRequests)
      .where(eq(studyAccessRequests.id, submitted.requestId))
      .limit(1);
    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, submitted.requestId));
    const [auditEvent] = await db
      .select()
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.id, result.value.auditEventId))
      .limit(1);

    expect(result.value).toMatchObject({
      requestId: submitted.requestId,
      status: "under_review"
    });
    expect(request?.status).toBe("under_review");
    expect(request?.updatedAt).toBeInstanceOf(Date);
    expect(auditCount?.value).toBe(2);
    expect(auditEvent).toMatchObject({
      actorId: reviewer.id,
      eventType: "startReview",
      fromStatus: "submitted",
      toStatus: "under_review",
      metadata: {
        commandName: "startReview"
      }
    });
  });

  it("allows admin users to start review", async () => {
    const admin = await createTestActor("admin");
    const submitted = await createSubmittedRequest();

    const result = await startReview(admin, {
      requestId: submitted.requestId,
      idempotencyKey: reviewKey("admin-start")
    });

    expect(result.ok).toBe(true);
  });

  it("forbids requester users from starting review", async () => {
    const requester = await createTestActor("requester");
    const submitted = await createSubmittedRequest();

    const result = await startReview(requester, {
      requestId: submitted.requestId
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "Forbidden",
        message: "Reviewer access required"
      });
    }
  });

  it("returns not found for an unknown request", async () => {
    const reviewer = await createTestActor("reviewer");

    const result = await startReview(reviewer, {
      requestId: crypto.randomUUID(),
      idempotencyKey: reviewKey("not-found-start")
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NotFound");
    }
  });

  it("rejects draft requests as invalid transitions", async () => {
    const requester = await createTestActor("requester");
    const reviewer = await createTestActor("reviewer");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await startReview(reviewer, {
      requestId: created.value.requestId,
      idempotencyKey: reviewKey("draft-start")
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("InvalidTransition");
    }
  });

  it("replays duplicate starts with the same idempotency key", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequest();
    const idempotencyKey = reviewKey("replay-start");

    const first = await startReview(reviewer, {
      requestId: submitted.requestId,
      idempotencyKey
    });
    const second = await startReview(reviewer, {
      requestId: submitted.requestId,
      idempotencyKey
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toEqual(first.value);
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, submitted.requestId));
    const [idempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey));

    expect(auditCount?.value).toBe(2);
    expect(idempotencyCount?.value).toBe(1);
  });

  it("rejects duplicate start keys with different payloads", async () => {
    const reviewer = await createTestActor("reviewer");
    const firstSubmitted = await createSubmittedRequest();
    const secondSubmitted = await createSubmittedRequest();
    const idempotencyKey = reviewKey("start-conflict");

    const first = await startReview(reviewer, {
      requestId: firstSubmitted.requestId,
      idempotencyKey
    });
    const second = await startReview(reviewer, {
      requestId: secondSubmitted.requestId,
      idempotencyKey
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("IdempotencyConflict");
    }

    const [firstAuditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, firstSubmitted.requestId));
    const [secondAuditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, secondSubmitted.requestId));

    expect(firstAuditCount?.value).toBe(2);
    expect(secondAuditCount?.value).toBe(1);
  });

  it("does not write a second audit event on a new duplicate start", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequest();

    const first = await startReview(reviewer, {
      requestId: submitted.requestId,
      idempotencyKey: reviewKey("first-start")
    });
    const second = await startReview(reviewer, {
      requestId: submitted.requestId,
      idempotencyKey: reviewKey("second-start")
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("InvalidTransition");
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, submitted.requestId));

    expect(auditCount?.value).toBe(2);
  });

  it("rejects impossible start-review audit triples at the database boundary", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequest();

    let caught: unknown;

    try {
      await db.insert(studyAccessAuditEvents).values({
        requestId: submitted.requestId,
        actorId: reviewer.id,
        eventType: "startReview",
        fromStatus: "draft",
        toStatus: "under_review"
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

  it("normalizes unexpected dependency failures", async () => {
    const reviewer = await createTestActor("reviewer");
    const failure = new Error("database unavailable");
    const reportUnexpectedError = vi.fn();

    const result = await startReview(
      reviewer,
      {
        requestId: crypto.randomUUID(),
        idempotencyKey: reviewKey("dependency-start")
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
