import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { auth } from "../auth";
import { db } from "./client";
import { accounts, users, type appRoleValues } from "./schema";

type AppRole = (typeof appRoleValues)[number];

type DemoAccountSeed = {
  email: string;
  name: string;
  role: AppRole;
};

export const demoAuthPassword = "development-password";

export const demoAccounts = [
  {
    email: "requester@example.test",
    name: "AccessFlow Requester",
    role: "requester"
  },
  {
    email: "reviewer@example.test",
    name: "AccessFlow Reviewer",
    role: "reviewer"
  },
  {
    email: "admin@example.test",
    name: "AccessFlow Admin",
    role: "admin"
  }
] as const satisfies readonly DemoAccountSeed[];

const credentialProviderId = "credential";

const findUserByEmail = async (email: string) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
};

const ensureUserExists = async (seed: DemoAccountSeed) => {
  const existingUser = await findUserByEmail(seed.email);

  if (existingUser) {
    return existingUser;
  }

  await auth.api.signUpEmail({
    body: {
      email: seed.email,
      name: seed.name,
      password: demoAuthPassword
    }
  });

  const createdUser = await findUserByEmail(seed.email);

  if (!createdUser) {
    throw new Error(`Failed to create demo account ${seed.email}`);
  }

  return createdUser;
};

const ensureCredentialAccount = async (userId: string) => {
  const passwordHash = await hashPassword(demoAuthPassword);
  const [credentialAccount] = await db
    .select({
      id: accounts.id
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, credentialProviderId)
      )
    )
    .limit(1);

  if (credentialAccount) {
    await db
      .update(accounts)
      .set({
        accountId: userId,
        password: passwordHash,
        updatedAt: new Date()
      })
      .where(eq(accounts.id, credentialAccount.id));
    return;
  }

  await db.insert(accounts).values({
    accountId: userId,
    password: passwordHash,
    providerId: credentialProviderId,
    userId
  });
};

const seedDemoAccount = async (seed: DemoAccountSeed) => {
  const user = await ensureUserExists(seed);

  await db
    .update(users)
    .set({
      emailVerified: true,
      name: seed.name,
      role: seed.role,
      updatedAt: new Date()
    })
    .where(eq(users.id, user.id));

  await ensureCredentialAccount(user.id);

  return {
    id: user.id,
    email: seed.email,
    role: seed.role
  };
};

export const seedDemoAccounts = async () =>
  Promise.all(demoAccounts.map((seed) => seedDemoAccount(seed)));
