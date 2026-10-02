import { defineConfig, devices } from "@playwright/test"

/**
 * Admin E2E — mocked UI tests against a production Nuxt build.
 *
 * The admin app is Nuxt 3: build it (`nuxt build`) and serve
 * `.output/server/index.mjs` directly. Every `/api/admin/**` request is
 * intercepted in the browser via page.route(), so neither the API server
 * nor the upstream supplier is ever contacted — see
 * tests/e2e/helpers/mock-admin-api.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @arena/admin build && node apps/admin/.output/server/index.mjs",
    cwd: "..",
    url: "http://127.0.0.1:3100",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PORT: "3100",
      HOST: "127.0.0.1",
      // Keep E2E deterministic and inert: no Sentry wiring, no telemetry prompt.
      NUXT_PUBLIC_SENTRY_DSN: "",
      NUXT_TELEMETRY_DISABLED: "1",
    },
  },
})
