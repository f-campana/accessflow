import { resolve } from "node:path";

import { config } from "dotenv";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const developmentAuthSecret = "development-only-change-me-development-only";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default(developmentAuthSecret),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://accessflow:accessflow@localhost:55433/accessflow")
});

const parsedEnv = envSchema.parse(process.env);

if (parsedEnv.NODE_ENV === "production") {
  const missingProductionKeys = [
    "DATABASE_URL",
    "WEB_ORIGIN",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET"
  ].filter((key) => !process.env[key]);

  if (missingProductionKeys.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingProductionKeys.join(", ")}`
    );
  }

  if (parsedEnv.BETTER_AUTH_SECRET === developmentAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET must not use the development default");
  }
}

export const env = parsedEnv;
