import { createHash } from "node:crypto";

import { z } from "zod";

import {
  conflict,
  err,
  idempotencyConflict,
  unexpected,
  type Result
} from "@accessflow/core";

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

export const resolveIdempotencyReplay = <T>(
  commandName: string,
  payloadHash: string,
  existing: {
    payloadHash: string;
    status: "pending" | "completed" | "failed";
    responsePayload: unknown;
    expiresAt: Date;
  },
  responseSchema: z.ZodType<T>
): Result<T> => {
  // Expired keys are not replayable. The caller must start a new attempt with
  // a new idempotency key so the stored expiry field has real command meaning.
  if (existing.expiresAt.getTime() <= Date.now()) {
    return err(conflict(`Idempotency key for ${commandName} expired`));
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
