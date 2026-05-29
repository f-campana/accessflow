import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "node scripts/e2e-api-server.mjs",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: false,
      timeout: 90_000
    },
    {
      command: "node scripts/e2e-web-server.mjs",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 90_000
    }
  ],
  projects: [
    {
      name: "chromium-mobile",
      use: {
        browserName: "chromium",
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        viewport: {
          width: 390,
          height: 844
        }
      }
    }
  ]
});
