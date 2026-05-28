import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  conflict,
  err,
  idempotencyConflict,
  unexpected,
  type Result
} from "@accessflow/core";

import type { AuthenticatedActor } from "../context";
import { idempotencyKeys } from "../db/schema";
import type { CommandDependencies } from "./types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const sortJson = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)])
    );
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
};

export const hashPayload = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(sortJson(payload))).digest("hex");

export const idempotencyReplaySchema = <T extends z.ZodType>(
  payloadSchema: T
) =>
  z.object({
    requestId: z.uuid(),
    auditEventId: z.uuid(),
    status: z.literal("submitted"),
    submittedAt: z.string().datetime(),
    draft: payloadSchema
  });

export const resolveCompletedIdempotency = async <T>(
  dependencies: CommandDependencies,
  actor: AuthenticatedActor,
  commandName: string,
  key: string,
  payloadHash: string,
  responseSchema: z.ZodType<T>
): Promise<Result<T> | null> => {
  const [existing] = await dependencies.db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.actorId, actor.id),
        eq(idempotencyKeys.commandName, commandName),
        eq(idempotencyKeys.key, key)
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  if (existing.payloadHash !== payloadHash) {
    return err(idempotencyConflict());
  }

  if (existing.status !== "completed") {
    return err(conflict(`Command ${commandName} is already ${existing.status}`));
  }

  const parsed = responseSchema.safeParse(existing.responsePayload);

  if (!parsed.success) {
    return err(unexpected("Completed idempotency response could not be replayed"));
  }

  return { ok: true, value: parsed.data };
};

export const insertPendingIdempotency = async (
  dependencies: CommandDependencies,
  actor: AuthenticatedActor,
  commandName: string,
  key: string,
  payloadHash: string
) => {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const [created] = await dependencies.db
    .insert(idempotencyKeys)
    .values({
      actorId: actor.id,
      commandName,
      key,
      payloadHash,
      status: "pending",
      expiresAt
    })
    .returning({ id: idempotencyKeys.id });

  return created;
};
