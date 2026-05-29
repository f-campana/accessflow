import { spawn, spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);

const env = {
  ...process.env,
  WEB_ORIGIN: "http://127.0.0.1:3000",
  BETTER_AUTH_URL: "http://127.0.0.1:4000",
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
  NEXT_ALLOWED_DEV_ORIGINS: "127.0.0.1"
};

const build = spawnSync("pnpm", ["--filter", "@accessflow/web", "build"], {
  cwd: root,
  env,
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawn(
  "pnpm",
  [
    "--filter",
    "@accessflow/web",
    "exec",
    "next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000"
  ],
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
