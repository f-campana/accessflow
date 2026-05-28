import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "../../test-helpers/db";
import { createDraft } from "./create-draft";
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
});
