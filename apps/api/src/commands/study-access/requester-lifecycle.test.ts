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
import { rejectRequest } from "./review-decision";
import { reopenRequest, withdrawRequest } from "./requester-lifecycle";
import { saveDraft } from "./save-draft";
import { startReview } from "./start-review";
import { submitRequest } from "./submit-request";
import { validSubmission } from "./test-data";

const commandKey = (name: string) => `${name}-${crypto.randomUUID()}`;

const createSubmittedRequest = async () => {
  const requester = await createTestActor("requester");
  const study = await createTestStudy();
  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey: commandKey("submit"),
    ...validSubmission
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  return {
    draftId: created.value.draftId,
    requester,
    requestId: submitted.value.requestId,
    study
  };
};

const createUnderReviewRequest = async () => {
  const submitted = await createSubmittedRequest();
  const reviewer = await createTestActor("reviewer");
  const started = await startReview(reviewer, {
    requestId: submitted.requestId,
    idempotencyKey: commandKey("start")
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  return submitted;
};

const createRejectedRequest = async () => {
  const underReview = await createUnderReviewRequest();
  const reviewer = await createTestActor("reviewer");
  const rejected = await rejectRequest(reviewer, {
    requestId: underReview.requestId,
    idempotencyKey: commandKey("reject"),
    reason: "Requester needs a narrower access purpose."
  });

  if (!rejected.ok) {
    throw new Error(rejected.error.message);
  }

  return underReview;
};

const requestAuditCount = async (requestId: string) => {
  const [auditCount] = await db
    .select({ value: count() })
    .from(studyAccessAuditEvents)
    .where(eq(studyAccessAuditEvents.requestId, requestId));

  return auditCount?.value ?? 0;
};

describe("requester lifecycle commands", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it("withdraws a submitted request and replays same-key retries", async () => {
    const submitted = await createSubmittedRequest();
    const idempotencyKey = commandKey("withdraw-submitted");

    const first = await withdrawRequest(submitted.requester, {
      requestId: submitted.requestId,
      idempotencyKey
    });
    const second = await withdrawRequest(submitted.requester, {
      requestId: submitted.requestId,
      idempotencyKey
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toEqual(first.value);
    }

    const [request] = await db
      .select({
        status: studyAccessRequests.status,
        submittedAt: studyAccessRequests.submittedAt,
        requestedRole: studyAccessRequests.requestedRole
      })
      .from(studyAccessRequests)
      .where(eq(studyAccessRequests.id, submitted.requestId));
    const [idempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey));

    expect(request).toMatchObject({
      status: "withdrawn",
      requestedRole: validSubmission.requestedRole
    });
    expect(request?.submittedAt).toBeInstanceOf(Date);
    expect(await requestAuditCount(submitted.requestId)).toBe(2);
    expect(idempotencyCount?.value).toBe(1);
  });

  it("withdraws an under-review request", async () => {
    const underReview = await createUnderReviewRequest();

    const result = await withdrawRequest(underReview.requester, {
      requestId: underReview.requestId,
      idempotencyKey: commandKey("withdraw-under-review")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("withdrawn");
    }

    const [auditEvent] = await db
      .select({
        eventType: studyAccessAuditEvents.eventType,
        fromStatus: studyAccessAuditEvents.fromStatus,
        toStatus: studyAccessAuditEvents.toStatus
      })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.id, result.ok ? result.value.auditEventId : ""))
      .limit(1);

    expect(auditEvent).toEqual({
      eventType: "withdrawRequest",
      fromStatus: "under_review",
      toStatus: "withdrawn"
    });
  });

  it("rejects withdrawal by another requester", async () => {
    const submitted = await createSubmittedRequest();
    const otherRequester = await createTestActor("requester");

    const result = await withdrawRequest(otherRequester, {
      requestId: submitted.requestId,
      idempotencyKey: commandKey("withdraw-other")
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Forbidden");
    }
    expect(await requestAuditCount(submitted.requestId)).toBe(1);
  });

  it("reopens a rejected request to an editable draft", async () => {
    const rejected = await createRejectedRequest();
    const idempotencyKey = commandKey("reopen");

    const first = await reopenRequest(rejected.requester, {
      requestId: rejected.requestId,
      idempotencyKey
    });
    const second = await reopenRequest(rejected.requester, {
      requestId: rejected.requestId,
      idempotencyKey
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toEqual(first.value);
    }

    const [request] = await db
      .select({
        status: studyAccessRequests.status,
        requestedRole: studyAccessRequests.requestedRole,
        submittedAt: studyAccessRequests.submittedAt,
        decidedAt: studyAccessRequests.decidedAt,
        decisionNote: studyAccessRequests.decisionNote
      })
      .from(studyAccessRequests)
      .where(eq(studyAccessRequests.id, rejected.requestId));

    expect(request).toEqual({
      status: "draft",
      requestedRole: null,
      submittedAt: null,
      decidedAt: null,
      decisionNote: null
    });

    const saved = await saveDraft(rejected.requester, {
      draftId: rejected.draftId,
      purpose: "Updated purpose after reviewer feedback."
    });

    expect(saved.ok).toBe(true);
    expect(await requestAuditCount(rejected.requestId)).toBe(4);
  });

  it("rejects same-key lifecycle retries with different payloads", async () => {
    const firstSubmitted = await createSubmittedRequest();
    const secondSubmitted = await createSubmittedRequest();
    const idempotencyKey = commandKey("withdraw-conflict");

    const first = await withdrawRequest(firstSubmitted.requester, {
      requestId: firstSubmitted.requestId,
      idempotencyKey
    });
    const second = await withdrawRequest(firstSubmitted.requester, {
      requestId: secondSubmitted.requestId,
      idempotencyKey
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("IdempotencyConflict");
    }
    expect(await requestAuditCount(firstSubmitted.requestId)).toBe(2);
    expect(await requestAuditCount(secondSubmitted.requestId)).toBe(1);
  });

  it("rejects unsupported requester lifecycle transitions", async () => {
    const submitted = await createSubmittedRequest();
    const draft = await createDraft(submitted.requester, {
      studyId: (await createTestStudy()).id
    });

    if (!draft.ok) {
      throw new Error(draft.error.message);
    }

    const withdrawDraft = await withdrawRequest(submitted.requester, {
      requestId: draft.value.requestId,
      idempotencyKey: commandKey("withdraw-draft")
    });
    const reopenSubmitted = await reopenRequest(submitted.requester, {
      requestId: submitted.requestId,
      idempotencyKey: commandKey("reopen-submitted")
    });

    expect(withdrawDraft.ok).toBe(false);
    if (!withdrawDraft.ok) {
      expect(withdrawDraft.error.code).toBe("InvalidTransition");
    }
    expect(reopenSubmitted.ok).toBe(false);
    if (!reopenSubmitted.ok) {
      expect(reopenSubmitted.error.code).toBe("InvalidTransition");
    }
  });

  it("maps reopen active-request unique-index races to conflict", async () => {
    const reportUnexpectedError = vi.fn();
    const uniqueViolation = {
      cause: {
        code: "23505",
        constraint: "study_access_requests_active_requester_study_idx"
      }
    };

    const result = await reopenRequest(
      {
        id: crypto.randomUUID(),
        email: "requester@example.test",
        role: "requester"
      },
      {
        requestId: crypto.randomUUID(),
        idempotencyKey: commandKey("reopen-race")
      },
      {
        ...defaultDependencies,
        db: {
          transaction: async () => {
            throw uniqueViolation;
          }
        } as unknown as typeof defaultDependencies.db,
        reportUnexpectedError
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Conflict");
      expect(result.error.message).toBe(
        "Requester already has an active request for this study"
      );
    }
    expect(reportUnexpectedError).not.toHaveBeenCalled();
  });
});
