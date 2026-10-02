import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

const { Pool } = pg;

export async function runMigrations() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL is required to run migrations.");
  }

  console.log(`[Migrations] Connecting to database using: ${url.replace(/:[^:@]*@/, ":***@")}`);
  const pool = new Pool({
    connectionString: url,
    max: 1,
  });

  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, "../migrations");

  console.log(`[Migrations] Applying migrations from ${migrationsFolder}...`);
  try {
    await migrate(db, { migrationsFolder });
    console.log("[Migrations] All migrations successfully applied!");
  } catch (err: any) {
    console.error("[Migrations] Error applying migrations:", err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("migrate.ts") ||
  process.argv[1].endsWith("migrate.js")
);

if (isMain) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
