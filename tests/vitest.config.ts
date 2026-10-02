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
          // The test database is stateful; run files sequentially.
          fileParallelism: false,
          env: TEST_ENV,
          setupFiles: ["./setup/integration-safety.ts", "./setup/integration-bootstrap.ts"],
        },
      },
    ],
  },
});
