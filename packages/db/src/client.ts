import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(connectionString?: string) {
  if (dbInstance) return dbInstance;

  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is missing.");
  }

  poolInstance = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Attach idle error listener to prevent Node.js uncaughtException crashes
  // when Neon serverless auto-suspends compute and terminates idle connections
  poolInstance.on("error", (err) => {
    console.error("[DatabasePool] Unexpected error on idle PostgreSQL client:", err?.message || err);
  });

  dbInstance = drizzle(poolInstance, { schema });
  return dbInstance;
}

export function getPool(): pg.Pool | null {
  return poolInstance;
}

export async function closeDb() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}

export { schema };
