import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

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

describe("createDraft", () => {
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
});
