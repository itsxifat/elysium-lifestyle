import { defineConfig, devices } from "@playwright/test";

// The website's end-to-end run against a local *preview* brand ERP:
//   1. the ERP: `pnpm preview:local --brand elysium-lifestyle-bd` in the ERP repo
//      (with NODE_EXTRA_CA_CERTS pointing at e2e/.mail-sink/cert.pem, see README);
//   2. `npm run e2e:setup` (prepares the ERP, writes .env.e2e.local);
//   3. `npm run build` with ERP_MEDIA_ORIGINS set as in .env.e2e.local;
//   4. `npm run e2e`.
// One worker: the journeys share one ERP and its stock.

const port = process.env.E2E_SITE_PORT || "3410";

// In production nginx sets X-Real-IP to the visitor's address and the ERP counts
// sign-ins, codes and checkouts per shopper address (D-534). Here the browser
// talks to the site directly, so each run plays one shopper from its own
// documentation-range address instead of every run sharing one bucket.
const shopperIp = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.mjs$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  outputDir: "e2e/.results",
  globalSetup: "./e2e/global-setup.mjs",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "X-Real-IP": shopperIp },
  },
  webServer: {
    command: "node e2e/start-site.mjs",
    url: `http://localhost:${port}/api/categories`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { E2E_SITE_PORT: port },
  },
});
