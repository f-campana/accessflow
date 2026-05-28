import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "./db/client";
import {
  accounts,
  sessions,
  users,
  verifications,
  appRoleValues
} from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  appName: "AccessFlow",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.WEB_ORIGIN],
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications
    }
  }),
  emailAndPassword: {
    enabled: true
  },
  user: {
    additionalFields: {
      role: {
        type: [...appRoleValues],
        input: false,
        required: true,
        defaultValue: "requester"
      }
    }
  },
  advanced: {
    database: {
      generateId: "uuid"
    }
  }
});
