import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
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
  // Production mode is intentional: Arena's preview is sandboxed and Next dev
  // blocks its client chunks from an opaque iframe origin for security.
  webServer: {
    command:
      "npx --yes pnpm@10 --filter admin build && npx --yes pnpm@10 --filter admin exec next start --hostname 127.0.0.1 --port 3100",
    cwd: "..",
    // Browser suites must remain deterministic and never call a real supplier.
    // Explicit empty process values take precedence over a developer's .env.local.
    env: {
      ...process.env,
      UPSTREAM_PARTNER_API_BASE_URL: "",
      UPSTREAM_PARTNER_API_KEY: "",
    },
    url: "http://127.0.0.1:3100",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
})
