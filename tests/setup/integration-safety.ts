import { TEST_DB_URL, TEST_UPSTREAM_BASE_URL, TEST_DIGITALCORE_BASE_URL, TEST_AIVAULTHUB_BASE_URL } from "./test-env";

/**
 * Defense-in-depth guard that runs before EVERY integration test file.
 *
 * AGENT.md forbids real upstream purchases and real credentials in tests.
 * The vitest config injects safe env values, but this guard additionally
 * refuses to run if anything ever points the test process at:
 *   - a database that is not a local *_test database, or
 *   - the real upstream supplier host.
 */
function assertSafeTestEnvironment(): void {
  let dbHost = "";
  let dbName = "";
  try {
    const url = new URL(TEST_DB_URL);
    dbHost = url.hostname;
    dbName = url.pathname.replace(/^\//, "");
  } catch {
    throw new Error("[Safety] TEST database URL is not a valid Postgres URL.");
  }

  const localHosts = ["localhost", "127.0.0.1", "::1"];
  if (!localHosts.includes(dbHost) || !dbName.endsWith("_test")) {
    throw new Error(
      `[Safety] Integration tests refused: the test database must be a local database whose name ends with "_test". ` +
        `Got host="${dbHost}", database="${dbName}". Never point tests at the development/production database.`
    );
  }

  let upstreamHost = "";
  try {
    upstreamHost = new URL(process.env.UPSTREAM_BASE_URL || TEST_UPSTREAM_BASE_URL).hostname;
  } catch {
    throw new Error("[Safety] UPSTREAM_BASE_URL in the test environment is not a valid URL.");
  }
  if (!localHosts.includes(upstreamHost)) {
    throw new Error(
      `[Safety] Integration tests refused: UPSTREAM_BASE_URL must point at localhost during tests ` +
        `(got "${upstreamHost}") so no real supplier request can ever be made.`
    );
  }

  if (process.env.UPSTREAM_API_KEY || process.env.UPSTREAM_PARTNER_API_KEY) {
    throw new Error(
      "[Safety] Integration tests refused: an upstream API key is present in the test environment. " +
        "Tests must run with both UPSTREAM_API_KEY and UPSTREAM_PARTNER_API_KEY cleared."
    );
  }

  let digitalcoreHost = "";
  try {
    digitalcoreHost = new URL(process.env.DIGITALCORE_BASE_URL || TEST_DIGITALCORE_BASE_URL).hostname;
  } catch {
    throw new Error("[Safety] DIGITALCORE_BASE_URL in the test environment is not a valid URL.");
  }
  if (!localHosts.includes(digitalcoreHost)) {
    throw new Error(
      `[Safety] Integration tests refused: DIGITALCORE_BASE_URL must point at localhost during tests ` +
        `(got "${digitalcoreHost}") so no real DigitalCore request can ever be made.`
    );
  }

  if (process.env.DIGITALCORE_API_KEY) {
    throw new Error(
      "[Safety] Integration tests refused: DIGITALCORE_API_KEY is present in the test environment. " +
        "Tests must run with DIGITALCORE_API_KEY cleared."
    );
  }

  let aivaulthubHost = "";
  try {
    aivaulthubHost = new URL(process.env.AIVAULTHUB_BASE_URL || TEST_AIVAULTHUB_BASE_URL).hostname;
  } catch {
    throw new Error("[Safety] AIVAULTHUB_BASE_URL in the test environment is not a valid URL.");
  }
  if (!localHosts.includes(aivaulthubHost)) {
    throw new Error(
      `[Safety] Integration tests refused: AIVAULTHUB_BASE_URL must point at localhost during tests ` +
        `(got "${aivaulthubHost}") so no real AIVaultHub request can ever be made.`
    );
  }

  if (process.env.AIVAULTHUB_API_KEY) {
    throw new Error(
      "[Safety] Integration tests refused: AIVAULTHUB_API_KEY is present in the test environment. " +
        "Tests must run with AIVAULTHUB_API_KEY cleared."
    );
  }
}

assertSafeTestEnvironment();
