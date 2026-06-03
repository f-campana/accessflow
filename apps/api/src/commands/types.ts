import type { AppDatabase } from "../db/client";

export type CommandDependencies = {
  db: AppDatabase;
  reportUnexpectedError: (error: unknown) => void;
};
