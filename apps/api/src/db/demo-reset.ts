import { sql } from "drizzle-orm";

import { env } from "../env";
import { db } from "./client";

const localPreviewHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const expectedPreviewPort = "55433";
const expectedPreviewDatabase = "accessflow";

type DemoResetTarget = {
  databaseName: string;
  host: string;
  port: string;
};

export const assertSafeDemoResetTarget = (
  databaseUrl: string,
  nodeEnv = env.NODE_ENV
): DemoResetTarget => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");

  if (nodeEnv === "production") {
    throw new Error("Refusing to reset demo data while NODE_ENV=production");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Demo reset DATABASE_URL must use postgres:// or postgresql://");
  }

  if (!localPreviewHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to reset non-local demo database host: ${parsed.hostname}`
    );
  }

  if (parsed.port !== expectedPreviewPort) {
    throw new Error(
      `Refusing to reset unexpected demo database port: ${parsed.port || "(default)"}`
    );
  }

  if (databaseName !== expectedPreviewDatabase) {
    throw new Error(
      `Refusing to reset database "${databaseName}". Expected "${expectedPreviewDatabase}"`
    );
  }

  return {
    databaseName,
    host: parsed.hostname,
    port: parsed.port
  };
};

export const resetDemoDatabase = async (
  databaseUrl = env.DATABASE_URL,
  nodeEnv = env.NODE_ENV
) => {
  const target = assertSafeDemoResetTarget(databaseUrl, nodeEnv);

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

  return target;
};
