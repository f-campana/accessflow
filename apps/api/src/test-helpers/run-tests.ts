import { spawn } from "node:child_process";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const defaultDatabaseUrl =
  "postgres://accessflow:accessflow@localhost:55433/accessflow";

const quoteIdentifier = (identifier: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }

  return `"${identifier}"`;
};

const toTestDatabaseUrl = () => {
  if (process.env.ACCESSFLOW_TEST_DATABASE_URL) {
    return process.env.ACCESSFLOW_TEST_DATABASE_URL;
  }

  const parsedUrl = new URL(process.env.DATABASE_URL ?? defaultDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "") || "accessflow";

  if (databaseName.includes("test")) {
    return parsedUrl.toString();
  }

  parsedUrl.pathname = `/${databaseName}_test`;
  return parsedUrl.toString();
};

const toMaintenanceDatabaseUrl = (databaseUrl: string) => {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.pathname = "/postgres";
  return parsedUrl.toString();
};

const databaseNameFromUrl = (databaseUrl: string) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (!databaseName.includes("test")) {
    throw new Error(`Refusing to use non-test database "${databaseName}"`);
  }

  return databaseName;
};

const ensureTestDatabase = async (databaseUrl: string) => {
  const databaseName = databaseNameFromUrl(databaseUrl);
  const maintenancePool = new Pool({
    connectionString: toMaintenanceDatabaseUrl(databaseUrl),
    allowExitOnIdle: true
  });

  try {
    const existingDatabase = await maintenancePool.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1) as exists",
      [databaseName]
    );

    if (!existingDatabase.rows[0]?.exists) {
      await maintenancePool.query(
        `create database ${quoteIdentifier(databaseName)}`
      );
    }
  } finally {
    await maintenancePool.end();
  }
};

const migrateTestDatabase = async (databaseUrl: string) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    allowExitOnIdle: true
  });
  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: "drizzle"
    });
  } finally {
    await pool.end();
  }
};

const runVitest = (databaseUrl: string) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "vitest", "run", "--passWithNoTests", "--no-file-parallelism"],
      {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test"
        },
        stdio: "inherit"
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

const testDatabaseUrl = toTestDatabaseUrl();
const testDatabaseName = databaseNameFromUrl(testDatabaseUrl);

console.log(`Using isolated API test database: ${testDatabaseName}`);

await ensureTestDatabase(testDatabaseUrl);
await migrateTestDatabase(testDatabaseUrl);

const exitCode = await runVitest(testDatabaseUrl);
process.exitCode = exitCode;
