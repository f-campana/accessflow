import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "./client";
import {
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "./schema";
import {
  createTestActor,
  createTestStudy,
  resetDatabase
} from "../test-helpers/db";

const expectConstraintViolation = async (
  operation: Promise<unknown>,
  constraint: string
) => {
  await expect(operation).rejects.toMatchObject({
    cause: {
      code: "23514",
      constraint
    }
  });
};

const expectForeignKeyViolation = async (
  operation: Promise<unknown>,
  constraint: string
) => {
  await expect(operation).rejects.toMatchObject({
    cause: {
      code: "23503",
      constraint
    }
  });
};

describe("database workflow invariants", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it("rejects submitted requests without submittedAt", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    await expectConstraintViolation(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "submitted",
        requestedRole: "viewer"
      }),
      "study_access_requests_state_fields_check"
    );
  });

  it("rejects submitted requests without requestedRole", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    await expectConstraintViolation(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "submitted",
        submittedAt: new Date()
      }),
      "study_access_requests_state_fields_check"
    );
  });

  it("rejects draft requests with submission or decision metadata", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    await expectConstraintViolation(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "draft",
        submittedAt: new Date()
      }),
      "study_access_requests_state_fields_check"
    );

    await expectConstraintViolation(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "draft",
        decisionNote: "A draft cannot carry review metadata"
      }),
      "study_access_requests_state_fields_check"
    );
  });

  it("rejects unknown requested roles on requests and drafts", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();

    await expectConstraintViolation(
      db.insert(studyAccessRequests).values({
        requesterId: actor.id,
        studyId: study.id,
        status: "draft",
        requestedRole: "admin"
      }),
      "study_access_requests_requested_role_check"
    );

    const [request] = await db
      .insert(studyAccessRequests)
      .values({
        requesterId: actor.id,
        studyId: study.id,
        status: "draft",
        requestedRole: "viewer"
      })
      .returning({ id: studyAccessRequests.id });

    if (!request) {
      throw new Error("Expected request fixture");
    }

    await expectConstraintViolation(
      db.insert(studyAccessRequestDrafts).values({
        requestId: request.id,
        ownerId: actor.id,
        requestedRole: "admin"
      }),
      "study_access_request_drafts_requested_role_check"
    );
  });

  it("rejects drafts owned by a user other than the request requester", async () => {
    const requester = await createTestActor();
    const otherActor = await createTestActor();
    const study = await createTestStudy();

    const [request] = await db
      .insert(studyAccessRequests)
      .values({
        requesterId: requester.id,
        studyId: study.id,
        status: "draft"
      })
      .returning({ id: studyAccessRequests.id });

    if (!request) {
      throw new Error("Expected request fixture");
    }

    await expectForeignKeyViolation(
      db.insert(studyAccessRequestDrafts).values({
        requestId: request.id,
        ownerId: otherActor.id
      }),
      "study_access_request_drafts_request_owner_fk"
    );
  });

  it("accepts legal withdrawal audit triples and rejects impossible reopen triples", async () => {
    const actor = await createTestActor();
    const study = await createTestStudy();
    const [request] = await db
      .insert(studyAccessRequests)
      .values({
        requesterId: actor.id,
        studyId: study.id,
        status: "withdrawn",
        requestedRole: "viewer",
        submittedAt: new Date()
      })
      .returning({ id: studyAccessRequests.id });

    if (!request) {
      throw new Error("Expected request fixture");
    }

    await expect(
      db.insert(studyAccessAuditEvents).values({
        requestId: request.id,
        actorId: actor.id,
        eventType: "withdrawRequest",
        fromStatus: "submitted",
        toStatus: "withdrawn"
      })
    ).resolves.toBeDefined();

    await expectConstraintViolation(
      db.insert(studyAccessAuditEvents).values({
        requestId: request.id,
        actorId: actor.id,
        eventType: "reopenRequest",
        fromStatus: "submitted",
        toStatus: "draft"
      }),
      "study_access_audit_events_transition_check"
    );
  });
});
