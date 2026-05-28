import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { workflowEventTypes } from "@accessflow/workflow";

import {
  createDraft,
  saveDraft,
  submitRequest
} from "./study-access";
import { db } from "../db/client";
import {
  idempotencyKeys,
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../db/schema";
import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "../test-helpers/db";

const validSubmission = {
  purpose: "Analyze synthetic outcomes for workspace access.",
  requestedRole: "analyst",
  justification: "Requester needs aggregate synthetic study data.",
  affiliation: "AccessFlow Research"
} as const;

describe("study access request commands", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lets a requester create an incomplete draft", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    const result = await createDraft(actor, { studyId: study.id });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [request] = await db
      .select()
      .from(studyAccessRequests)
      .where(eq(studyAccessRequests.id, result.value.requestId))
      .limit(1);
    const [draft] = await db
      .select()
      .from(studyAccessRequestDrafts)
      .where(eq(studyAccessRequestDrafts.id, result.value.draftId))
      .limit(1);

    expect(request?.status).toBe("draft");
    expect(request?.requestedRole).toBeNull();
    expect(draft?.ownerId).toBe(actor.id);
  });

  it("lets a requester save their own draft", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await saveDraft(actor, {
      draftId: created.value.draftId,
      purpose: "Need temporary synthetic workspace access.",
      requestedRole: "viewer"
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        draftId: created.value.draftId,
        requestId: created.value.requestId,
        status: "draft",
        draft: expect.objectContaining({
          purpose: "Need temporary synthetic workspace access.",
          requestedRole: "viewer"
        })
      })
    });
  });

  it("does not let a requester save another requester's draft", async () => {
    const owner = await createTestActor("requester", "owner@example.test");
    const other = await createTestActor("requester", "other@example.test");
    const study = await createTestStudy();
    const created = await createDraft(owner, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await saveDraft(other, {
      draftId: created.value.draftId,
      purpose: "Attempted update"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Forbidden");
    }
  });

  it("returns validation errors when submit fields are incomplete", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-invalid-1"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ValidationError");
      expect(result.error.formErrors).toEqual([
        "Complete the draft before submitting the access request."
      ]);
      expect(result.error.fieldErrors).toEqual(
        expect.objectContaining({
          purpose: expect.any(Array),
          requestedRole: expect.any(Array),
          justification: expect.any(Array),
          affiliation: expect.any(Array)
        })
      );
    }

    const [idempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-invalid-1")
        )
      );

    expect(idempotencyCount?.value).toBe(0);
  });

  it("submits a valid draft with one audit event and completed idempotency", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-valid-1",
      ...validSubmission
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [request] = await db
      .select()
      .from(studyAccessRequests)
      .where(eq(studyAccessRequests.id, result.value.requestId))
      .limit(1);
    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, result.value.requestId));
    const [idempotency] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-valid-1")
        )
      )
      .limit(1);

    expect(request?.status).toBe("submitted");
    expect(request?.requestedRole).toBe(validSubmission.requestedRole);
    expect(request?.submittedAt).toBeInstanceOf(Date);
    expect(auditCount?.value).toBe(1);
    expect(idempotency?.status).toBe("completed");
    expect(idempotency?.completedAt).toBeInstanceOf(Date);
    expect(idempotency?.responsePayload).toEqual(result.value);
  });

  it("replays the original result for the same actor, key, and payload", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const input = {
      draftId: created.value.draftId,
      idempotencyKey: "submit-replay-1",
      ...validSubmission
    };

    const first = await submitRequest(actor, input);
    const second = await submitRequest(actor, input);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);

    if (!first.ok) {
      return;
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, first.value.requestId));

    expect(auditCount?.value).toBe(1);
  });

  it("handles concurrent same-key submit retries as one durable result", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const input = {
      draftId: created.value.draftId,
      idempotencyKey: "submit-concurrent-replay-1",
      ...validSubmission
    };

    const [first, second] = await Promise.all([
      submitRequest(actor, input),
      submitRequest(actor, input)
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second).toEqual(first);

    if (!first.ok) {
      return;
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, first.value.requestId));
    const [idempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-concurrent-replay-1")
        )
      );

    expect(auditCount?.value).toBe(1);
    expect(idempotencyCount?.value).toBe(1);
  });

  it("rejects idempotency key reuse with a different payload", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const first = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-conflict-1",
      ...validSubmission
    });
    const second = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-conflict-1",
      ...validSubmission,
      purpose: "Different payload"
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("IdempotencyConflict");
    }

    if (first.ok) {
      const [auditCount] = await db
        .select({ value: count() })
        .from(studyAccessAuditEvents)
        .where(eq(studyAccessAuditEvents.requestId, first.value.requestId));
      expect(auditCount?.value).toBe(1);
    }
  });

  it("handles concurrent same-key different-payload submit attempts as a typed conflict", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const [first, second] = await Promise.all([
      submitRequest(actor, {
        draftId: created.value.draftId,
        idempotencyKey: "submit-concurrent-conflict-1",
        ...validSubmission
      }),
      submitRequest(actor, {
        draftId: created.value.draftId,
        idempotencyKey: "submit-concurrent-conflict-1",
        ...validSubmission,
        purpose: "Different concurrent payload"
      })
    ]);

    const results = [first, second];
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ok).toBe(false);
    if (failures[0] && !failures[0].ok) {
      expect(failures[0].error.code).toBe("IdempotencyConflict");
    }

    const success = successes[0];
    if (!success?.ok) {
      return;
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, success.value.requestId));

    expect(auditCount?.value).toBe(1);
  });

  it("does not keep pending idempotency when a concurrent different-key submit loses the draft transition", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const [first, second] = await Promise.all([
      submitRequest(actor, {
        draftId: created.value.draftId,
        idempotencyKey: "submit-concurrent-winner-1",
        ...validSubmission
      }),
      submitRequest(actor, {
        draftId: created.value.draftId,
        idempotencyKey: "submit-concurrent-loser-1",
        ...validSubmission
      })
    ]);

    const results = [first, second];
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ok).toBe(false);
    if (failures[0] && !failures[0].ok) {
      expect(failures[0].error.code).toBe("InvalidTransition");
    }

    const [pendingLoserCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-concurrent-loser-1")
        )
      );

    expect(pendingLoserCount?.value).toBe(0);
  });

  it("does not let a requester save a submitted draft", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-before-save-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const result = await saveDraft(actor, {
      draftId: created.value.draftId,
      purpose: "Attempted post-submit edit"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("InvalidTransition");
    }
  });

  it("keeps persisted audit event types aligned with workflow vocabulary", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-audit-type-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const [auditEvent] = await db
      .select()
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.id, submitted.value.auditEventId))
      .limit(1);

    expect(workflowEventTypes).toContain(auditEvent?.eventType);
  });
});
