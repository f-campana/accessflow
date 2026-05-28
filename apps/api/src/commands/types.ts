import type { AppError, Result } from "@accessflow/core";

import type { AuthenticatedActor } from "../context";
import type { AppDatabase } from "../db/client";

export type CommandDependencies = {
  db: AppDatabase;
};

export type CommandHandler<Input, Output> = (
  actor: AuthenticatedActor,
  input: Input,
  dependencies?: CommandDependencies
) => Promise<Result<Output, AppError>>;

export const requesterOnly = (actor: AuthenticatedActor): boolean =>
  actor.role === "requester";
