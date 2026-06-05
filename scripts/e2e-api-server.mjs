import { spawn, spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);

const env = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: "4000",
  WEB_ORIGIN: "http://127.0.0.1:3000",
  BETTER_AUTH_URL: "http://127.0.0.1:4000",
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000"
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("docker-compose", ["up", "-d", "postgres"]);
run("pnpm", ["--filter", "@accessflow/api", "db:migrate"]);
run("pnpm", ["--filter", "@accessflow/api", "db:reset-demo"]);
run("pnpm", ["--filter", "@accessflow/api", "db:seed"]);

const child = spawn(
  "pnpm",
  ["--filter", "@accessflow/api", "exec", "tsx", "src/index.ts"],
  {
    cwd: root,
    env,
    stdio: "inherit"
  }
);

const stop = () => {
  child.kill("SIGTERM");
};

child.on("exit", (code, signal) => {
  if (signal) {
    return;
  }

  process.exit(code ?? 1);
});

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
