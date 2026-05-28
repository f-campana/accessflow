import { err, type AppError, type Result } from "@accessflow/core";

import { db } from "../../db/client";
import type { CommandDependencies } from "../types";

export const defaultDependencies: CommandDependencies = {
  db
};

class CommandAbort extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

export const abortCommand = (error: AppError): never => {
  throw new CommandAbort(error);
};

export const rollbackCommandError = (error: unknown): Result<never, AppError> => {
  if (error instanceof CommandAbort) {
    return err(error.appError);
  }

  throw error;
};
