import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";

const root = new URL("..", import.meta.url);

const portWeb = 3000;
const portApi = 4000;
const postgresContainerName = "accessflow-postgres";
const defaultPreviewDatabaseUrl =
  "postgres://accessflow:accessflow@localhost:55433/accessflow";

const children = [];
let shuttingDown = false;

const log = (message) => {
  process.stdout.write(`[preview] ${message}\n`);
};

const fail = (message) => {
  process.stderr.write(`[preview] ${message}\n`);
  process.exit(1);
};

const findLanAddress = () => {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  throw new Error("Could not find a non-internal IPv4 address");
};

const parseDatabaseName = (databaseUrl) => {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, "");
};

const assertSafePreviewDatabaseUrl = (databaseUrl) => {
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const databaseName = parseDatabaseName(databaseUrl);

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail("Preview DATABASE_URL must use postgres:// or postgresql://.");
  }

  if (!localHosts.has(parsed.hostname)) {
    fail(
      `Refusing to run mobile preview against non-local database host: ${parsed.hostname}`
    );
  }

  if (parsed.port !== "55433") {
    fail(
      `Refusing to run mobile preview against unexpected database port: ${parsed.port || "(default)"}`
    );
  }

  if (databaseName !== "accessflow") {
    fail(
      `Refusing to run mobile preview against database "${databaseName}". Expected "accessflow".`
    );
  }
};

const resolvePreviewDatabaseUrl = () => {
  const previewDatabaseUrl =
    process.env.ACCESSFLOW_PREVIEW_DATABASE_URL ?? defaultPreviewDatabaseUrl;

  assertSafePreviewDatabaseUrl(previewDatabaseUrl);

  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== previewDatabaseUrl
  ) {
    log("Ignoring shell DATABASE_URL for mobile preview; using local preview database.");
  }

  return previewDatabaseUrl;
};

const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit"
  });

  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const canRun = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore"
  });

  return result.status === 0;
};

const resolveComposeCommand = () => {
  if (canRun("docker", ["compose", "version"])) {
    return { command: "docker", args: ["compose"] };
  }

  if (canRun("docker-compose", ["version"])) {
    return { command: "docker-compose", args: [] };
  }

  fail("Docker Compose is required. Install either `docker compose` or `docker-compose`.");
};

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });

const assertPreviewPortsAvailable = async () => {
  for (const port of [portWeb, portApi]) {
    if (!(await isPortAvailable(port))) {
      fail(
        `Port ${port} is already in use. Stop the existing process before running mobile preview.`
      );
    }
  }
};

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const waitFor = async ({ label, timeoutMs, check }) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await wait(500);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  fail(`${label} was not ready within ${timeoutMs / 1000}s.${detail}`);
};

const waitForPostgres = async () => {
  await waitFor({
    label: "Postgres container",
    timeoutMs: 60_000,
    check: () => {
      const result = spawnSync(
        "docker",
        [
          "inspect",
          "--format={{.State.Health.Status}}",
          postgresContainerName
        ],
        {
          cwd: root,
          stdio: ["ignore", "pipe", "ignore"]
        }
      );

      return result.stdout.toString().trim() === "healthy";
    }
  });
};

const waitForHttpOk = async (label, url, timeoutMs = 60_000) => {
  await waitFor({
    label,
    timeoutMs,
    check: async () => {
      const response = await fetch(url, {
        redirect: "manual"
      });

      return response.status >= 200 && response.status < 400;
    }
  });
};

const start = (name, command, args, env) => {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.push(child);

  child.stdout.on("data", (data) => process.stdout.write(`${name} ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`${name} ${data}`));

  child.on("exit", (code, signal) => {
    if (shuttingDown || signal) {
      return;
    }

    process.stderr.write(`${name} exited with code ${code}\n`);
    process.exit(code ?? 1);
  });

  return child;
};

const stop = () => {
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
};

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

const lanAddress = process.env.ACCESSFLOW_LAN_HOST ?? findLanAddress();
const previewDatabaseUrl = resolvePreviewDatabaseUrl();
const compose = resolveComposeCommand();

const env = {
  ...process.env,
  DATABASE_URL: previewDatabaseUrl,
  HOST: "0.0.0.0",
  PORT: `${portApi}`,
  WEB_ORIGIN: `http://${lanAddress}:${portWeb}`,
  BETTER_AUTH_URL: `http://${lanAddress}:${portApi}`,
  NEXT_PUBLIC_API_URL: `http://${lanAddress}:${portApi}`,
  NEXT_ALLOWED_DEV_ORIGINS: lanAddress
};

await assertPreviewPortsAvailable();

log("Starting local Postgres.");
run(compose.command, [...compose.args, "up", "-d", "postgres"], env);
await waitForPostgres();

log("Applying migrations and seed data.");
run("pnpm", ["--filter", "@accessflow/api", "db:migrate"], env);
run("pnpm", ["--filter", "@accessflow/api", "db:seed"], env);

log("Building web app.");
run("pnpm", ["--filter", "@accessflow/web", "build"], env);

log("Starting API and web servers.");
start("[api]", "pnpm", ["--filter", "@accessflow/api", "exec", "tsx", "src/index.ts"], env);
await waitForHttpOk("API health", `http://127.0.0.1:${portApi}/health`);

start("[web]", "pnpm", ["--filter", "@accessflow/web", "start"], env);
await waitForHttpOk("Web app", `http://127.0.0.1:${portWeb}`);
await waitForHttpOk("LAN web app", `http://${lanAddress}:${portWeb}`);

console.log("");
console.log("AccessFlow mobile preview is ready.");
console.log(`Open this URL on your phone: http://${lanAddress}:${portWeb}`);
console.log(`API health: http://${lanAddress}:${portApi}/health`);
console.log("");
