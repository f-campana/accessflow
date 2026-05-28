import { sql } from "drizzle-orm";

import { db } from "../db/client";
import { studies, users, type appRoleValues } from "../db/schema";
import type { AuthenticatedActor } from "../context";
import { env } from "../env";

type ActorRole = (typeof appRoleValues)[number];

const currentDatabaseName = () => {
  const parsedUrl = new URL(env.DATABASE_URL);
  return parsedUrl.pathname.replace(/^\//, "");
};

export const resetDatabase = async () => {
  const databaseName = currentDatabaseName();

  if (env.NODE_ENV !== "test" || !databaseName.includes("test")) {
    throw new Error(
      `Refusing to reset non-test database "${databaseName}" with NODE_ENV="${env.NODE_ENV}"`
    );
  }

  await db.execute(sql`
    TRUNCATE TABLE
      "accounts",
      "idempotency_keys",
      "sessions",
      "study_access_audit_events",
      "study_access_request_drafts",
      "study_access_requests",
      "studies",
      "users",
      "verifications"
    RESTART IDENTITY CASCADE
  `);
};

export const createTestActor = async (
  role: ActorRole = "requester",
  email = `${role}-${crypto.randomUUID()}@example.test`
): Promise<AuthenticatedActor> => {
  const actor = {
    id: crypto.randomUUID(),
    email,
    role
  };

  await db.insert(users).values({
    id: actor.id,
    name: email,
    email: actor.email,
    emailVerified: true,
    role: actor.role
  });

  return actor;
};

export const createTestStudy = async () => {
  const [study] = await db
    .insert(studies)
    .values({
      slug: `study-${crypto.randomUUID()}`,
      displayName: "Synthetic Study",
      shortDescription: "Synthetic workspace used by command tests.",
      sensitivityLabel: "Synthetic"
    })
    .returning({ id: studies.id });

  if (!study) {
    throw new Error("Failed to create test study");
  }

  return study;
};
