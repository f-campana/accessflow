import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { studyAccessRequestStatuses } from "@accessflow/workflow";

export const appRole = pgEnum("app_role", ["requester", "reviewer", "admin"]);

export const accessRequestStatus = pgEnum(
  "study_access_request_status",
  studyAccessRequestStatuses
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: appRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const studies = pgTable("studies", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  shortDescription: text("short_description").notNull(),
  sensitivityLabel: text("sensitivity_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const studyAccessRequests = pgTable(
  "study_access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id),
    status: accessRequestStatus("status").notNull().default("draft"),
    requestedRole: text("requested_role").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requesterIdx: index("study_access_requests_requester_idx").on(table.requesterId),
    studyIdx: index("study_access_requests_study_idx").on(table.studyId),
    statusIdx: index("study_access_requests_status_idx").on(table.status)
  })
);

export const studyAccessRequestDrafts = pgTable(
  "study_access_request_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => studyAccessRequests.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    purpose: text("purpose"),
    requestedRole: text("requested_role"),
    justification: text("justification"),
    affiliation: text("affiliation"),
    supportingNotes: text("supporting_notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requestIdx: uniqueIndex("study_access_request_drafts_request_idx").on(table.requestId),
    ownerIdx: index("study_access_request_drafts_owner_idx").on(table.ownerId)
  })
);

export const studyAccessAuditEvents = pgTable(
  "study_access_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => studyAccessRequests.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    eventType: text("event_type").notNull(),
    fromStatus: accessRequestStatus("from_status").notNull(),
    toStatus: accessRequestStatus("to_status").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requestIdx: index("study_access_audit_events_request_idx").on(table.requestId),
    actorIdx: index("study_access_audit_events_actor_idx").on(table.actorId)
  })
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    commandName: text("command_name").notNull(),
    key: text("key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    resultReference: text("result_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    actorCommandKeyIdx: uniqueIndex("idempotency_actor_command_key_idx").on(
      table.actorId,
      table.commandName,
      table.key
    )
  })
);
