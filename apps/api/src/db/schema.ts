import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import {
  activeStudyAccessRequestStatuses,
  requestedStudyRoles,
  studyAccessRequestStatuses,
  workflowEventTypes
} from "@accessflow/workflow";

const sqlStringList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));

export const appRoleValues = ["requester", "reviewer", "admin"] as const;
export const appRole = pgEnum("app_role", appRoleValues);

export const accessRequestStatus = pgEnum(
  "study_access_request_status",
  studyAccessRequestStatuses
);

export const workflowEventType = pgEnum("workflow_event_type", workflowEventTypes);

export const idempotencyStatusValues = [
  "pending",
  "completed",
  "failed"
] as const;
export const idempotencyStatus = pgEnum(
  "idempotency_status",
  idempotencyStatusValues
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: appRole("role").notNull().default("requester"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.token),
    userIdx: index("sessions_user_idx").on(table.userId)
  })
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    userIdx: index("accounts_user_idx").on(table.userId)
  })
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id),
    status: accessRequestStatus("status").notNull().default("draft"),
    // Drafts get a durable request identity before all submission fields exist.
    // submitRequest copies the final draft value here when the transition commits.
    requestedRole: text("requested_role"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requesterIdx: index("study_access_requests_requester_idx").on(table.requesterId),
    idRequesterIdx: uniqueIndex("study_access_requests_id_requester_idx").on(
      table.id,
      table.requesterId
    ),
    studyIdx: index("study_access_requests_study_idx").on(table.studyId),
    statusIdx: index("study_access_requests_status_idx").on(table.status),
    requestedRoleCheck: check(
      "study_access_requests_requested_role_check",
      sql`${table.requestedRole} is null or ${table.requestedRole} in (${sqlStringList(
        requestedStudyRoles
      )})`
    ),
    stateFieldsCheck: check(
      "study_access_requests_state_fields_check",
      sql`
        (
          ${table.status} = 'draft'
          and ${table.submittedAt} is null
          and ${table.decidedAt} is null
          and ${table.decisionNote} is null
        )
        or
        (
          ${table.status} <> 'draft'
          and ${table.submittedAt} is not null
          and ${table.requestedRole} is not null
        )
      `
    ),
    activeRequesterStudyIdx: uniqueIndex(
      "study_access_requests_active_requester_study_idx"
    )
      .on(table.requesterId, table.studyId)
      .where(
        sql`${table.status} in (${sql.raw(
          activeStudyAccessRequestStatuses
            .map((status) => `'${status}'`)
            .join(", ")
        )})`
      )
  })
);

export const studyAccessRequestDrafts = pgTable(
  "study_access_request_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => studyAccessRequests.id),
    ownerId: text("owner_id")
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
    ownerIdx: index("study_access_request_drafts_owner_idx").on(table.ownerId),
    requestOwnerFk: foreignKey({
      columns: [table.requestId, table.ownerId],
      foreignColumns: [studyAccessRequests.id, studyAccessRequests.requesterId],
      name: "study_access_request_drafts_request_owner_fk"
    }),
    requestedRoleCheck: check(
      "study_access_request_drafts_requested_role_check",
      sql`${table.requestedRole} is null or ${table.requestedRole} in (${sqlStringList(
        requestedStudyRoles
      )})`
    )
  })
);

export const studyAccessAuditEvents = pgTable(
  "study_access_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => studyAccessRequests.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    eventType: workflowEventType("event_type").notNull(),
    fromStatus: accessRequestStatus("from_status").notNull(),
    toStatus: accessRequestStatus("to_status").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requestIdx: index("study_access_audit_events_request_idx").on(table.requestId),
    actorIdx: index("study_access_audit_events_actor_idx").on(table.actorId),
    timelineIdx: index("study_access_audit_events_timeline_idx").on(
      table.requestId,
      table.createdAt,
      table.id
    )
  })
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    commandName: text("command_name").notNull(),
    key: text("key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: idempotencyStatus("status").notNull().default("pending"),
    resultReference: text("result_reference"),
    responsePayload: jsonb("response_payload").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
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
