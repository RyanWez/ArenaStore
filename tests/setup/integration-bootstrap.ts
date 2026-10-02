import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import pg from "pg";
import { TEST_DB_NAME, TEST_DB_URL } from "./test-env";

/**
 * Integration test bootstrap (runs before every integration test file).
 *
 * 1. Ensures a local PostgreSQL is reachable. If none is running (no Docker,
 *    no system service), a user-space Postgres 17 cluster is initialised in
 *    `tests/.pgdata` (gitignored) and started DETACHED via pg_ctl, so it
 *    survives across Vitest worker processes — the whole suite shares one
 *    server. No root or system install required.
 * 2. Applies migrations (idempotent) and truncates every public table so each
 *    test file starts from a clean, fully migrated schema.
 */

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const PG_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.pgdata");
const PG_LOG_FILE = path.join(PG_DATA_DIR, "postgres-test.log");
const PG_PORT = Number(new URL(TEST_DB_URL).port || 5432);

function nativeBinDir(): string {
  // The platform PostgreSQL binaries ship inside @embedded-postgres/linux-x64
  // (resolved via its main entry: <pkg>/dist/index.js → <pkg>/native/bin).
  const entry = require.resolve("@embedded-postgres/linux-x64");
  return path.join(path.dirname(path.dirname(entry)), "native", "bin");
}

async function canReachLocalPostgres(): Promise<boolean> {
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = "/postgres";
  const pool = new pg.Pool({
    connectionString: adminUrl.toString(),
    max: 1,
    connectionTimeoutMillis: 1500,
  });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

async function run(bin: string, args: string[]): Promise<string> {
  const result = await execFileAsync(path.join(nativeBinDir(), bin), args, { timeout: 60000 });
  return String(result.stdout || "");
}

async function initialiseCluster(): Promise<void> {
  // initdb requires a data dir that does not exist (or is empty).
  if (fs.existsSync(PG_DATA_DIR)) {
    fs.rmSync(PG_DATA_DIR, { recursive: true, force: true });
  }

  // initdb reads the superuser password from a file's first line.
  const pwFile = `${PG_DATA_DIR}.pw`;
  fs.writeFileSync(pwFile, "postgres\n");
  try {
    await run("initdb", [
      "-D",
      PG_DATA_DIR,
      "-U",
      "postgres",
      "-A",
      "password",
      `--pwfile=${pwFile}`,
    ]);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

async function startCluster(): Promise<void> {
  // A stale postmaster.pid from a hard-killed server would block pg_ctl.
  const pidFile = path.join(PG_DATA_DIR, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    fs.rmSync(pidFile, { force: true });
  }

  // Retry start: a previous run's server may still be releasing the port.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await run("pg_ctl", [
        "-D",
        PG_DATA_DIR,
        "-l",
        PG_LOG_FILE,
        "-o",
        `-p ${PG_PORT} -k /tmp`,
        "start",
      ]);
      return;
    } catch (err: any) {
      if (attempt === 4) throw err;
      // Clear processes from our data dir that are wedged (e.g. their files
      // were deleted by a crashed earlier run) before retrying.
      await killStaleClusterProcesses();
      await sleep(1000);
    }
  }
}

/**
 * Kills leftover postgres processes from an earlier crashed/interleaved run
 * that were started from OUR data directory (matched by exact path), so the
 * port is free for a fresh start. Processes from other directories or
 * unrelated services are never touched.
 */
async function killStaleClusterProcesses(): Promise<void> {
  try {
    await execFileAsync("pkill", ["-f", PG_DATA_DIR]);
    await sleep(500);
  } catch {
    // No matching process — nothing to clean.
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Single-flight guard: Vitest may load several test files (and their setup
 * files) in overlapping worker processes, so the initialise/start sequence is
 * protected by a filesystem lock with stale-lock breaking.
 */
async function withBootstrapLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockFile = `${PG_DATA_DIR}.lock`;
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(fd, String(process.pid));
      try {
        return await fn();
      } finally {
        fs.closeSync(fd);
        fs.rmSync(lockFile, { force: true });
      }
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      // Break locks left behind by a crashed run (> 120s old).
      try {
        const age = Date.now() - fs.statSync(lockFile).mtimeMs;
        if (age > 120_000) fs.rmSync(lockFile, { force: true });
      } catch {
        // ignore stat races
      }
      await sleep(300);
    }
  }
}

async function adminPool(): Promise<pg.Pool> {
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = "/postgres";
  return new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
}

async function createTestDatabaseIfMissing(): Promise<void> {
  const pool = await adminPool();
  try {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME]
    );
    if (!rowCount) {
      await pool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await pool.end();
  }
}

async function ensureLocalPostgres(): Promise<void> {
  if (await canReachLocalPostgres()) return;

  await withBootstrapLock(async () => {
    // Re-check inside the lock: another worker may have finished starting.
    if (await canReachLocalPostgres()) return;

    if (!fs.existsSync(path.join(PG_DATA_DIR, "PG_VERSION"))) {
      await killStaleClusterProcesses();
      await initialiseCluster();
    }
    await startCluster();
    await createTestDatabaseIfMissing();

    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await canReachLocalPostgres()) return;
      await sleep(200);
    }
    throw new Error(
      "[Integration Setup] Local PostgreSQL did not become ready in time. " +
        `Check the server log at ${PG_LOG_FILE}.`
    );
  });
}

async function resetTestDatabase(): Promise<void> {
  if (!/^[a-z][a-z0-9_]*$/.test(TEST_DB_NAME)) {
    throw new Error(`[Integration Setup] Unsafe test database name: ${TEST_DB_NAME}`);
  }

  // Point the migration runner at the test database before importing it
  // (dotenv inside migrate.ts does not override already-set variables).
  process.env.DIRECT_URL = TEST_DB_URL;
  process.env.DATABASE_URL = TEST_DB_URL;

  const { runMigrations } = await import("../../packages/db/src/migrate");
  await runMigrations();

  const pool = new pg.Pool({ connectionString: TEST_DB_URL, max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT string_agg(quote_ident(tablename), ', ') AS tables
       FROM pg_tables
       WHERE schemaname = 'public'`
    );
    const tables = rows[0]?.tables as string | undefined;
    if (tables) {
      await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}

await ensureLocalPostgres();
await resetTestDatabase();
