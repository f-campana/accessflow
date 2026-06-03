import { and, asc, eq, inArray } from "drizzle-orm";
import {
  activeStudyAccessRequestStatuses,
  parsePersistedRequestedStudyRole,
  type RequestedStudyRole,
  type StudyAccessRequestStatus,
  type WorkflowEventType
} from "@accessflow/workflow";

import type { AuthenticatedActor } from "../context";
import { db } from "../db/client";
import {
  studies,
  studyAccessAuditEvents,
  studyAccessRequestDrafts,
  studyAccessRequests
} from "../db/schema";

const toIso = (value: Date | null) => (value ? value.toISOString() : null);

export type StudySummary = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription: string;
  sensitivityLabel: string;
};

export type RequesterStudyAccess = {
  request: {
    id: string;
    status: StudyAccessRequestStatus;
    requestedRole: RequestedStudyRole | null;
    submittedAt: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    createdAt: string;
    updatedAt: string;
  };
  draft: {
    id: string;
    purpose: string | null;
    requestedRole: RequestedStudyRole | null;
    justification: string | null;
    affiliation: string | null;
    supportingNotes: string | null;
    updatedAt: string;
  } | null;
  auditEvents: Array<{
    id: string;
    eventType: WorkflowEventType;
    fromStatus: StudyAccessRequestStatus;
    toStatus: StudyAccessRequestStatus;
    note: string | null;
    createdAt: string;
  }>;
};

export const listStudies = async (): Promise<StudySummary[]> => {
  const rows = await db
    .select({
      id: studies.id,
      slug: studies.slug,
      displayName: studies.displayName,
      shortDescription: studies.shortDescription,
      sensitivityLabel: studies.sensitivityLabel
    })
    .from(studies)
    .orderBy(asc(studies.displayName));

  return rows;
};

export const getRequesterStudyAccess = async (
  actor: AuthenticatedActor,
  studyId: string
): Promise<RequesterStudyAccess | null> => {
  const [request] = await db
    .select({
      id: studyAccessRequests.id,
      status: studyAccessRequests.status,
      requestedRole: studyAccessRequests.requestedRole,
      submittedAt: studyAccessRequests.submittedAt,
      decidedAt: studyAccessRequests.decidedAt,
      decisionNote: studyAccessRequests.decisionNote,
      createdAt: studyAccessRequests.createdAt,
      updatedAt: studyAccessRequests.updatedAt
    })
    .from(studyAccessRequests)
    .where(
      and(
        eq(studyAccessRequests.requesterId, actor.id),
        eq(studyAccessRequests.studyId, studyId),
        inArray(studyAccessRequests.status, activeStudyAccessRequestStatuses)
      )
    )
    .limit(1);

  if (!request) {
    return null;
  }

  const [draft] = await db
    .select({
      id: studyAccessRequestDrafts.id,
      purpose: studyAccessRequestDrafts.purpose,
      requestedRole: studyAccessRequestDrafts.requestedRole,
      justification: studyAccessRequestDrafts.justification,
      affiliation: studyAccessRequestDrafts.affiliation,
      supportingNotes: studyAccessRequestDrafts.supportingNotes,
      updatedAt: studyAccessRequestDrafts.updatedAt
    })
    .from(studyAccessRequestDrafts)
    .where(eq(studyAccessRequestDrafts.requestId, request.id))
    .limit(1);

  const auditEvents = await db
    .select({
      id: studyAccessAuditEvents.id,
      eventType: studyAccessAuditEvents.eventType,
      fromStatus: studyAccessAuditEvents.fromStatus,
      toStatus: studyAccessAuditEvents.toStatus,
      note: studyAccessAuditEvents.note,
      createdAt: studyAccessAuditEvents.createdAt
    })
    .from(studyAccessAuditEvents)
    .where(eq(studyAccessAuditEvents.requestId, request.id))
    .orderBy(
      asc(studyAccessAuditEvents.createdAt),
      asc(studyAccessAuditEvents.id)
    );

  return {
    request: {
      id: request.id,
      status: request.status,
      requestedRole: parsePersistedRequestedStudyRole(request.requestedRole),
      submittedAt: toIso(request.submittedAt),
      decidedAt: toIso(request.decidedAt),
      decisionNote: request.decisionNote,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString()
    },
    draft: draft
      ? {
          id: draft.id,
          purpose: draft.purpose,
          requestedRole: parsePersistedRequestedStudyRole(draft.requestedRole),
          justification: draft.justification,
          affiliation: draft.affiliation,
          supportingNotes: draft.supportingNotes,
          updatedAt: draft.updatedAt.toISOString()
        }
      : null,
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      createdAt: event.createdAt.toISOString()
    }))
  };
};
