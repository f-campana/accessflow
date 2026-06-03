import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { workflowEventTypes } from "@accessflow/workflow";

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
import { submitRequest } from "./submit-request";
import { validSubmission } from "./test-data";

describe("submitRequest", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
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
    const [auditEvent] = await db
      .select()
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.id, result.value.auditEventId))
      .limit(1);
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
    expect(auditEvent).toMatchObject({
      eventType: "submitRequest",
      fromStatus: "draft",
      toStatus: "submitted"
    });
    expect(idempotency?.status).toBe("completed");
    expect(idempotency?.completedAt).toBeInstanceOf(Date);
    expect(idempotency?.responsePayload).toEqual(result.value);
  });

  it("rejects impossible audit event transition triples at the database boundary", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    let caught: unknown;

    try {
      await db.insert(studyAccessAuditEvents).values({
        requestId: created.value.requestId,
        actorId: actor.id,
        eventType: "submitRequest",
        fromStatus: "submitted",
        toStatus: "submitted"
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

  it("rejects expired idempotency key replay with the same payload", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const input = {
      draftId: created.value.draftId,
      idempotencyKey: "submit-expired-replay-1",
      ...validSubmission
    };

    const first = await submitRequest(actor, input);

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-expired-replay-1")
        )
      );

    const second = await submitRequest(actor, input);

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatchObject({
        code: "Conflict",
        message: "Idempotency key for submitRequest expired"
      });
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

  it("rejects expired idempotency key reuse with a different payload as expired", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const first = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-expired-conflict-1",
      ...validSubmission
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.key, "submit-expired-conflict-1")
        )
      );

    const second = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "submit-expired-conflict-1",
      ...validSubmission,
      purpose: "Different payload after expiry"
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatchObject({
        code: "Conflict",
        message: "Idempotency key for submitRequest expired"
      });
    }

    const [auditCount] = await db
      .select({ value: count() })
      .from(studyAccessAuditEvents)
      .where(eq(studyAccessAuditEvents.requestId, first.value.requestId));

    expect(auditCount?.value).toBe(1);
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

    const [pendingIdempotencyCount] = await db
      .select({ value: count() })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.actorId, actor.id),
          eq(idempotencyKeys.commandName, "submitRequest"),
          eq(idempotencyKeys.status, "pending")
        )
      );

    expect(pendingIdempotencyCount?.value).toBe(0);
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

  it("normalizes unexpected dependency failures", async () => {
    const actor = await createTestActor();
    const failure = new Error("database unavailable");
    const reportUnexpectedError = vi.fn();

    const result = await submitRequest(
      actor,
      {
        draftId: crypto.randomUUID(),
        idempotencyKey: "submit-unexpected-1",
        ...validSubmission
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
