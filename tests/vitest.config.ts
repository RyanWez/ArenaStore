import { defineConfig } from "vitest/config";
import { TEST_ENV, UNIT_ENV } from "./setup/test-env";

/**
 * Unit project: pure logic tests, no database required.
 * Integration project: money-flow tests against a throwaway local Postgres
 * (arena_store_test) bootstrapped by the global setup; upstream supplier and
 * Telegram are always mocked or unroutable.
 */
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 60000,
    // `fileParallelism` is a ROOT-level option — setting it inside a project is
    // ignored by Vitest. Without this, integration files bootstrap concurrently
    // and their per-file `TRUNCATE` statements deadlock each other (and leak
    // rows across files mid-run), causing flaky full-suite runs.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["unit/**/*.test.ts"],
          testTimeout: 20000,
          hookTimeout: 60000,
          env: UNIT_ENV,
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["integration/**/*.test.ts"],
          testTimeout: 30000,
          hookTimeout: 60000,
          // The test database is stateful; runs are already sequential via the
          // root-level `fileParallelism: false` above.
          env: TEST_ENV,
          setupFiles: ["./setup/integration-safety.ts", "./setup/integration-bootstrap.ts"],
        },
      },
    ],
  },
});
