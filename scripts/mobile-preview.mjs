import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const portWeb = 3000;
const portApi = 4000;

const findLanAddress = () => {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  throw new Error("Could not find a non-internal IPv4 address for mobile preview");
};

const lanAddress = process.env.ACCESSFLOW_LAN_HOST ?? findLanAddress();

const env = {
  ...process.env,
  WEB_ORIGIN: `http://${lanAddress}:${portWeb}`,
  BETTER_AUTH_URL: `http://${lanAddress}:${portApi}`,
  NEXT_PUBLIC_API_URL: `http://${lanAddress}:${portApi}`,
  NEXT_ALLOWED_DEV_ORIGINS: lanAddress
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const start = (name, command, args) => {
  const child = spawn(command, args, {
    cwd: new URL("..", import.meta.url),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (data) => process.stdout.write(`${name} ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`${name} ${data}`));

  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }

    process.stderr.write(`${name} exited with code ${code}\n`);
    process.exit(code ?? 1);
  });

  return child;
};

run("docker-compose", ["up", "-d", "postgres"]);
run("pnpm", ["--filter", "@accessflow/api", "db:migrate"]);
run("pnpm", ["--filter", "@accessflow/api", "db:seed"]);
run("pnpm", ["--filter", "@accessflow/web", "build"]);

const children = [
  start("[api]", "pnpm", ["--filter", "@accessflow/api", "exec", "tsx", "src/index.ts"]),
  start("[web]", "pnpm", ["--filter", "@accessflow/web", "start"])
];

const stop = () => {
  for (const child of children) {
    child.kill("SIGTERM");
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

console.log("");
console.log("AccessFlow mobile preview is starting.");
console.log(`Open this URL on your phone: http://${lanAddress}:${portWeb}`);
console.log(`API health: http://${lanAddress}:${portApi}/health`);
console.log("");
