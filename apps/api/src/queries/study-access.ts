import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  parsePersistedRequestedStudyRole,
  requesterVisibleStudyAccessRequestStatuses,
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
  studyAccessRequests,
  users
} from "../db/schema";

const toIso = (value: Date | null) => (value ? value.toISOString() : null);

export type StudySummary = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription: string;
  sensitivityLabel: string;
};

type ReviewerVisibleStatus = Extract<
  StudyAccessRequestStatus,
  "submitted" | "under_review" | "approved" | "rejected"
>;

const reviewerVisibleStatuses = [
  "submitted",
  "under_review",
  "approved",
  "rejected"
] as const satisfies readonly ReviewerVisibleStatus[];

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

export type ReviewerInboxItem = {
  request: {
    id: string;
    status: ReviewerVisibleStatus;
    requestedRole: RequestedStudyRole;
    submittedAt: string;
    decidedAt: string | null;
    decisionNote: string | null;
    updatedAt: string;
  };
  requester: {
    id: string;
    email: string;
    name: string;
  };
  study: StudySummary;
  draft: {
    purpose: string | null;
    affiliation: string | null;
  } | null;
};

export type ReviewerStudyAccessDetail = {
  request: {
    id: string;
    status: ReviewerVisibleStatus;
    requestedRole: RequestedStudyRole;
    submittedAt: string;
    decidedAt: string | null;
    decisionNote: string | null;
    updatedAt: string;
  };
  requester: {
    id: string;
    email: string;
    name: string;
  };
  study: StudySummary;
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
        inArray(
          studyAccessRequests.status,
          requesterVisibleStudyAccessRequestStatuses
        )
      )
    )
    .orderBy(desc(studyAccessRequests.updatedAt), desc(studyAccessRequests.id))
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

const parseSubmittedRequestedRole = (value: string | null): RequestedStudyRole => {
  const requestedRole = parsePersistedRequestedStudyRole(value);

  if (!requestedRole) {
    throw new Error("Submitted request is missing a requested role");
  }

  return requestedRole;
};

const parseReviewerVisibleStatus = (
  value: StudyAccessRequestStatus
): ReviewerVisibleStatus => {
  if (
    value === "submitted" ||
    value === "under_review" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value;
  }

  throw new Error("Reviewer projection received an unsupported request status");
};

const reviewerVisibleRequestWhere = (requestId?: string) =>
  requestId
    ? and(
        eq(studyAccessRequests.id, requestId),
        inArray(studyAccessRequests.status, reviewerVisibleStatuses)
      )
    : inArray(studyAccessRequests.status, reviewerVisibleStatuses);

export const listReviewerStudyAccessRequests = async (): Promise<
  ReviewerInboxItem[]
> => {
  const rows = await db
    .select({
      requestId: studyAccessRequests.id,
      status: studyAccessRequests.status,
      requestedRole: studyAccessRequests.requestedRole,
      submittedAt: studyAccessRequests.submittedAt,
      decidedAt: studyAccessRequests.decidedAt,
      decisionNote: studyAccessRequests.decisionNote,
      requestUpdatedAt: studyAccessRequests.updatedAt,
      requesterId: users.id,
      requesterEmail: users.email,
      requesterName: users.name,
      studyId: studies.id,
      studySlug: studies.slug,
      studyDisplayName: studies.displayName,
      studyShortDescription: studies.shortDescription,
      studySensitivityLabel: studies.sensitivityLabel,
      draftPurpose: studyAccessRequestDrafts.purpose,
      draftAffiliation: studyAccessRequestDrafts.affiliation
    })
    .from(studyAccessRequests)
    .innerJoin(users, eq(users.id, studyAccessRequests.requesterId))
    .innerJoin(studies, eq(studies.id, studyAccessRequests.studyId))
    .leftJoin(
      studyAccessRequestDrafts,
      eq(studyAccessRequestDrafts.requestId, studyAccessRequests.id)
    )
    .where(reviewerVisibleRequestWhere())
    .orderBy(
      asc(studyAccessRequests.submittedAt),
      asc(studyAccessRequests.id)
    );

  return rows.map((row) => ({
    request: {
      id: row.requestId,
      status: parseReviewerVisibleStatus(row.status),
      requestedRole: parseSubmittedRequestedRole(row.requestedRole),
      submittedAt: row.submittedAt?.toISOString() ?? "",
      decidedAt: toIso(row.decidedAt),
      decisionNote: row.decisionNote,
      updatedAt: row.requestUpdatedAt.toISOString()
    },
    requester: {
      id: row.requesterId,
      email: row.requesterEmail,
      name: row.requesterName
    },
    study: {
      id: row.studyId,
      slug: row.studySlug,
      displayName: row.studyDisplayName,
      shortDescription: row.studyShortDescription,
      sensitivityLabel: row.studySensitivityLabel
    },
    draft: row.draftPurpose || row.draftAffiliation
      ? {
          purpose: row.draftPurpose,
          affiliation: row.draftAffiliation
        }
      : null
  }));
};

export const getReviewerStudyAccessDetail = async (
  requestId: string
): Promise<ReviewerStudyAccessDetail | null> => {
  const [row] = await db
    .select({
      requestId: studyAccessRequests.id,
      status: studyAccessRequests.status,
      requestedRole: studyAccessRequests.requestedRole,
      submittedAt: studyAccessRequests.submittedAt,
      decidedAt: studyAccessRequests.decidedAt,
      decisionNote: studyAccessRequests.decisionNote,
      requestUpdatedAt: studyAccessRequests.updatedAt,
      requesterId: users.id,
      requesterEmail: users.email,
      requesterName: users.name,
      studyId: studies.id,
      studySlug: studies.slug,
      studyDisplayName: studies.displayName,
      studyShortDescription: studies.shortDescription,
      studySensitivityLabel: studies.sensitivityLabel
    })
    .from(studyAccessRequests)
    .innerJoin(users, eq(users.id, studyAccessRequests.requesterId))
    .innerJoin(studies, eq(studies.id, studyAccessRequests.studyId))
    .where(reviewerVisibleRequestWhere(requestId))
    .limit(1);

  if (!row) {
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
    .where(eq(studyAccessRequestDrafts.requestId, requestId))
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
    .where(eq(studyAccessAuditEvents.requestId, requestId))
    .orderBy(
      asc(studyAccessAuditEvents.createdAt),
      asc(studyAccessAuditEvents.id)
    );

  return {
    request: {
      id: row.requestId,
      status: parseReviewerVisibleStatus(row.status),
      requestedRole: parseSubmittedRequestedRole(row.requestedRole),
      submittedAt: row.submittedAt?.toISOString() ?? "",
      decidedAt: toIso(row.decidedAt),
      decisionNote: row.decisionNote,
      updatedAt: row.requestUpdatedAt.toISOString()
    },
    requester: {
      id: row.requesterId,
      email: row.requesterEmail,
      name: row.requesterName
    },
    study: {
      id: row.studyId,
      slug: row.studySlug,
      displayName: row.studyDisplayName,
      shortDescription: row.studyShortDescription,
      sensitivityLabel: row.studySensitivityLabel
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
