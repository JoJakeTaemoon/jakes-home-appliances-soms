import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], locale: "ko" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], locale: "ko" },
    },
  ],
  webServer: {
    // When COVERAGE=1, fall through to the instrumented dev script so
    // NODE_V8_COVERAGE is set on the server process. If a non-coverage
    // dev server is already running locally (reuseExistingServer=true),
    // the user has to kill it first — see docs/COVERAGE.md.
    command: process.env.COVERAGE
      ? "npm run dev:coverage"
      : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
