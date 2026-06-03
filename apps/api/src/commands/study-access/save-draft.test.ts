import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../db/client";
import { studyAccessRequestDrafts } from "../../db/schema";
import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "../../test-helpers/db";
import { createDraft } from "./create-draft";
import { defaultDependencies } from "./command-transaction";
import { saveDraft } from "./save-draft";
import { submitRequest } from "./submit-request";
import { validSubmission } from "./test-data";

describe("saveDraft", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
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

  it("merges partial saves without clearing omitted draft fields", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, {
      studyId: study.id,
      purpose: "Initial synthetic access purpose",
      justification: "Initial study justification",
      affiliation: "Initial research team",
      requestedRole: "viewer"
    });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = await saveDraft(actor, {
      draftId: created.value.draftId,
      requestedRole: "analyst"
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        draft: expect.objectContaining({
          purpose: "Initial synthetic access purpose",
          justification: "Initial study justification",
          affiliation: "Initial research team",
          requestedRole: "analyst"
        })
      })
    });

    const [persistedDraft] = await db
      .select({
        purpose: studyAccessRequestDrafts.purpose,
        requestedRole: studyAccessRequestDrafts.requestedRole,
        justification: studyAccessRequestDrafts.justification,
        affiliation: studyAccessRequestDrafts.affiliation
      })
      .from(studyAccessRequestDrafts)
      .where(eq(studyAccessRequestDrafts.id, created.value.draftId))
      .limit(1);

    expect(persistedDraft).toEqual({
      purpose: "Initial synthetic access purpose",
      requestedRole: "analyst",
      justification: "Initial study justification",
      affiliation: "Initial research team"
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

  it("normalizes unexpected dependency failures", async () => {
    const actor = await createTestActor();
    const failure = new Error("database unavailable");
    const reportUnexpectedError = vi.fn();

    const result = await saveDraft(
      actor,
      {
        draftId: crypto.randomUUID(),
        purpose: "Attempted update"
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
