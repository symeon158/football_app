import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end browser tests. Run against a production build + local Supabase:
 *   npm run build && npm run start     (or let CI start it)
 *   npm run test:e2e
 * Locally this uses the installed Microsoft Edge (no browser download); CI uses
 * Playwright's Chromium.
 */
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false, // matches share per-user cooldowns; keep runs predictable
  workers: 1,
  retries: isCI ? 1 : 0, // never hide flakiness locally
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: isCI ? undefined : "msedge",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: isCI ? undefined : "msedge", viewport: { width: 1440, height: 1500 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: isCI ? undefined : "msedge" }, testMatch: /mobile\.spec\.ts/ },
  ],
});
