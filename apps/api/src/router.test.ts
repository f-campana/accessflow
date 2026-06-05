import { TRPCError } from "@trpc/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "./router";
import type { RequestContext } from "./context";
import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "./test-helpers/db";
import { createDraft, submitRequest } from "./commands/study-access";
import { validSubmission } from "./commands/study-access/test-data";

const unauthenticatedContext = {
  actor: null,
  requestId: "test-request",
  req: {},
  res: {}
} as RequestContext;

const decisionKey = (name: string) => `${name}-${crypto.randomUUID()}`;

const createSubmittedRequestForRouter = async (
  idempotencyKey: string
) => {
  const requester = await createTestActor("requester");
  const study = await createTestStudy();
  const created = await createDraft(requester, { studyId: study.id });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const submitted = await submitRequest(requester, {
    draftId: created.value.draftId,
    idempotencyKey,
    ...validSubmission
  });

  if (!submitted.ok) {
    throw new Error(submitted.error.message);
  }

  return {
    requester,
    study,
    requestId: submitted.value.requestId
  };
};

describe("tRPC auth boundary", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it("returns the current actor when authenticated", async () => {
    const actor = await createTestActor();
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor
    });

    await expect(caller.me()).resolves.toEqual(actor);
  });

  it("returns null for me when unauthenticated", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(caller.me()).resolves.toBeNull();
  });

  it("requires auth for studies", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(caller.studies()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("lists seeded study workspaces for authenticated users", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor
    });

    await expect(caller.studies()).resolves.toEqual([
      expect.objectContaining({ id: study.id })
    ]);
  });

  it("returns the requester's current request and persisted timeline", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const created = await createDraft(actor, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(actor, {
      draftId: created.value.draftId,
      idempotencyKey: "router-submit-1",
      purpose: "Review aggregate synthetic outcomes.",
      requestedRole: "analyst",
      justification: "Requester needs access for aggregate analysis.",
      affiliation: "AccessFlow Research"
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor
    });

    await expect(
      caller.myStudyAccess({ studyId: study.id })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId,
          status: "submitted"
        }),
        auditEvents: [
          expect.objectContaining({
            id: submitted.value.auditEventId,
            eventType: "submitRequest",
            fromStatus: "draft",
            toStatus: "submitted"
          })
        ]
      })
    );
  });

  it("forbids requester users from reviewer reads", async () => {
    const actor = await createTestActor("requester");
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor
    });

    await expect(caller.reviewerInbox()).rejects.toMatchObject({
      code: "FORBIDDEN"
    } satisfies Partial<TRPCError>);

    await expect(
      caller.reviewerStudyAccessDetail({ requestId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    } satisfies Partial<TRPCError>);
  });

  it("lets reviewer users read submitted requests and persisted detail", async () => {
    const requester = await createTestActor("requester");
    const reviewer = await createTestActor("reviewer");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(requester, {
      draftId: created.value.draftId,
      idempotencyKey: "reviewer-router-submit-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: reviewer
    });

    await expect(caller.reviewerInbox()).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId,
          status: "submitted",
          requestedRole: validSubmission.requestedRole
        }),
        requester: expect.objectContaining({
          id: requester.id,
          email: requester.email
        }),
        study: expect.objectContaining({
          id: study.id
        }),
        draft: expect.objectContaining({
          purpose: validSubmission.purpose,
          affiliation: validSubmission.affiliation
        })
      })
    ]);

    await expect(
      caller.reviewerStudyAccessDetail({ requestId: submitted.value.requestId })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId,
          status: "submitted"
        }),
        draft: expect.objectContaining({
          purpose: validSubmission.purpose,
          justification: validSubmission.justification
        }),
        auditEvents: [
          expect.objectContaining({
            id: submitted.value.auditEventId,
            eventType: "submitRequest"
          })
        ]
      })
    );
  });

  it("lets reviewer users start review and keep the request visible", async () => {
    const requester = await createTestActor("requester");
    const reviewer = await createTestActor("reviewer");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(requester, {
      draftId: created.value.draftId,
      idempotencyKey: "reviewer-router-start-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: reviewer
    });

    const started = await caller.startReview({
      requestId: submitted.value.requestId
    });

    expect(started.ok).toBe(true);

    await expect(caller.reviewerInbox()).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId,
          status: "under_review"
        })
      })
    ]);

    await expect(
      caller.reviewerStudyAccessDetail({ requestId: submitted.value.requestId })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId,
          status: "under_review"
        }),
        auditEvents: [
          expect.objectContaining({
            eventType: "submitRequest"
          }),
          expect.objectContaining({
            eventType: "startReview",
            fromStatus: "submitted",
            toStatus: "under_review"
          })
        ]
      })
    );
  });

  it("lets reviewer users approve under-review requests and keep final detail visible", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequestForRouter(
      "reviewer-router-approve-1"
    );
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: reviewer
    });

    const started = await caller.startReview({
      requestId: submitted.requestId
    });
    const approveIdempotencyKey = decisionKey("router-approve");
    const approved = await caller.approveRequest({
      requestId: submitted.requestId,
      idempotencyKey: approveIdempotencyKey
    });
    const replayedApproval = await caller.approveRequest({
      requestId: submitted.requestId,
      idempotencyKey: approveIdempotencyKey
    });

    expect(started.ok).toBe(true);
    expect(approved.ok).toBe(true);
    expect(replayedApproval).toEqual(approved);

    await expect(caller.reviewerInbox()).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "approved",
          decisionNote: null
        })
      })
    ]);

    await expect(
      caller.reviewerStudyAccessDetail({ requestId: submitted.requestId })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "approved",
          decisionNote: null
        }),
        auditEvents: [
          expect.objectContaining({ eventType: "submitRequest" }),
          expect.objectContaining({ eventType: "startReview" }),
          expect.objectContaining({
            eventType: "approveRequest",
            fromStatus: "under_review",
            toStatus: "approved",
            note: null
          })
        ]
      })
    );

    const requesterCaller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: submitted.requester
    });

    await expect(
      requesterCaller.myStudyAccess({ studyId: submitted.study.id })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "approved",
          decisionNote: null
        }),
        auditEvents: [
          expect.objectContaining({ eventType: "submitRequest" }),
          expect.objectContaining({ eventType: "startReview" }),
          expect.objectContaining({
            eventType: "approveRequest",
            fromStatus: "under_review",
            toStatus: "approved",
            note: null
          })
        ]
      })
    );
  });

  it("lets reviewer users reject under-review requests with a durable note", async () => {
    const reviewer = await createTestActor("reviewer");
    const submitted = await createSubmittedRequestForRouter(
      "reviewer-router-reject-1"
    );
    const reason = "Requester needs a narrower access purpose.";
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: reviewer
    });

    const started = await caller.startReview({
      requestId: submitted.requestId
    });
    const rejected = await caller.rejectRequest({
      requestId: submitted.requestId,
      idempotencyKey: decisionKey("router-reject"),
      reason
    });

    expect(started.ok).toBe(true);
    expect(rejected.ok).toBe(true);

    await expect(caller.reviewerInbox()).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "rejected",
          decisionNote: reason
        })
      })
    ]);

    await expect(
      caller.reviewerStudyAccessDetail({ requestId: submitted.requestId })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "rejected",
          decisionNote: reason
        }),
        auditEvents: [
          expect.objectContaining({ eventType: "submitRequest" }),
          expect.objectContaining({ eventType: "startReview" }),
          expect.objectContaining({
            eventType: "rejectRequest",
            fromStatus: "under_review",
            toStatus: "rejected",
            note: reason
          })
        ]
      })
    );

    const requesterCaller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: submitted.requester
    });

    await expect(
      requesterCaller.myStudyAccess({ studyId: submitted.study.id })
    ).resolves.toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.requestId,
          status: "rejected",
          decisionNote: reason
        }),
        auditEvents: [
          expect.objectContaining({ eventType: "submitRequest" }),
          expect.objectContaining({ eventType: "startReview" }),
          expect.objectContaining({
            eventType: "rejectRequest",
            fromStatus: "under_review",
            toStatus: "rejected",
            note: reason
          })
        ]
      })
    );
  });

  it("forbids requester users from starting review through tRPC", async () => {
    const requester = await createTestActor("requester");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(requester, {
      draftId: created.value.draftId,
      idempotencyKey: "requester-router-start-forbidden-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: requester
    });

    await expect(
      caller.startReview({ requestId: submitted.value.requestId })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    } satisfies Partial<TRPCError>);
  });

  it("forbids requester users from deciding requests through tRPC", async () => {
    const requester = await createTestActor("requester");
    const submitted = await createSubmittedRequestForRouter(
      "requester-router-decision-forbidden-1"
    );
    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: requester
    });

    await expect(
      caller.approveRequest({
        requestId: submitted.requestId,
        idempotencyKey: decisionKey("requester-forbidden-approve")
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    } satisfies Partial<TRPCError>);

    await expect(
      caller.rejectRequest({
        requestId: submitted.requestId,
        idempotencyKey: decisionKey("requester-forbidden-reject"),
        reason: "Requester cannot reject their own request."
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    } satisfies Partial<TRPCError>);
  });

  it("lets admin users read reviewer projections", async () => {
    const requester = await createTestActor("requester");
    const admin = await createTestActor("admin");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const submitted = await submitRequest(requester, {
      draftId: created.value.draftId,
      idempotencyKey: "admin-router-submit-1",
      ...validSubmission
    });

    if (!submitted.ok) {
      throw new Error(submitted.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: admin
    });

    await expect(caller.reviewerInbox()).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          id: submitted.value.requestId
        })
      })
    ]);
  });

  it("does not include requester drafts in reviewer reads", async () => {
    const requester = await createTestActor("requester");
    const reviewer = await createTestActor("reviewer");
    const study = await createTestStudy();
    const created = await createDraft(requester, { studyId: study.id });

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const caller = appRouter.createCaller({
      ...unauthenticatedContext,
      actor: reviewer
    });

    await expect(caller.reviewerInbox()).resolves.toEqual([]);
    await expect(
      caller.reviewerStudyAccessDetail({ requestId: created.value.requestId })
    ).resolves.toBeNull();
  });

  it("requires auth for createDraft", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.createDraft({ studyId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for saveDraft", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.saveDraft({ draftId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for submitRequest", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.submitRequest({
        draftId: crypto.randomUUID(),
        idempotencyKey: "unauthenticated-submit"
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for startReview", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.startReview({ requestId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for reviewer decision commands", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.approveRequest({
        requestId: crypto.randomUUID(),
        idempotencyKey: decisionKey("unauthenticated-approve")
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);

    await expect(
      caller.rejectRequest({
        requestId: crypto.randomUUID(),
        idempotencyKey: decisionKey("unauthenticated-reject"),
        reason: "Unauthenticated users cannot reject requests."
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });
});
