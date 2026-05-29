import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../db/client";
import {
  studyAccessRequestDrafts,
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

describe("createDraft", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
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

  it("returns the existing draft for repeated create attempts", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    const first = await createDraft(actor, { studyId: study.id });
    const second = await createDraft(actor, { studyId: study.id });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(second.value).toEqual(first.value);

    const requests = await db
      .select({ id: studyAccessRequests.id })
      .from(studyAccessRequests)
      .where(
        and(
          eq(studyAccessRequests.requesterId, actor.id),
          eq(studyAccessRequests.studyId, study.id)
        )
      );
    const drafts = await db
      .select({ id: studyAccessRequestDrafts.id })
      .from(studyAccessRequestDrafts)
      .where(eq(studyAccessRequestDrafts.requestId, first.value.requestId));

    expect(requests).toHaveLength(1);
    expect(drafts).toHaveLength(1);
  });

  it("does not create duplicates under concurrent create attempts", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => createDraft(actor, { studyId: study.id }))
    );

    const failures = results.filter((result) => !result.ok);
    expect(failures).toEqual([]);

    const requestIds = results.map((result) => {
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value.requestId;
    });
    const draftIds = results.map((result) => {
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value.draftId;
    });

    expect(new Set(requestIds).size).toBe(1);
    expect(new Set(draftIds).size).toBe(1);

    const requests = await db
      .select({ id: studyAccessRequests.id })
      .from(studyAccessRequests)
      .where(
        and(
          eq(studyAccessRequests.requesterId, actor.id),
          eq(studyAccessRequests.studyId, study.id)
        )
      );

    expect(requests).toHaveLength(1);
  });

  it("returns a conflict when an active request is already submitted", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "create-after-submit-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const result = await createDraft(actor, { studyId: study.id });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Conflict");
    }

    const requests = await db
      .select({ id: studyAccessRequests.id })
      .from(studyAccessRequests)
      .where(
        and(
          eq(studyAccessRequests.requesterId, actor.id),
          eq(studyAccessRequests.studyId, study.id)
        )
      );

    expect(requests).toHaveLength(1);
  });

  it("rejects direct duplicate active rows at the database boundary", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    await db.insert(studyAccessRequests).values({
      requesterId: actor.id,
      studyId: study.id,
      status: "draft"
    });

    await expect(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "submitted",
        requestedRole: "viewer",
        submittedAt: new Date()
      })
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "study_access_requests_active_requester_study_idx"
      }
    });
  });

  it("normalizes unexpected dependency failures", async () => {
    const actor = await createTestActor();
    const failure = new Error("database unavailable");
    const reportUnexpectedError = vi.fn();

    const result = await createDraft(
      actor,
      { studyId: crypto.randomUUID() },
      {
        ...defaultDependencies,
        db: {
          select: () => {
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
