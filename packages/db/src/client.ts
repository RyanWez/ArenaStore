import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

let poolInstance: Pool | null = null;
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
  // when Neon serverless auto-suspends compute and terminates idle connections.
  // Cast through `any` because `tsc` under `moduleResolution: bundler` (tests
  // workspace) resolves `pg` via its ESM export and loses the DefinitelyTyped
  // `Pool extends EventEmitter` augmentation, causing `Property 'on' does not
  // exist on type 'Pool'` only when type-checked from outside the db package.
  (poolInstance as unknown as { on: (event: string, listener: (err: Error) => void) => void }).on(
    "error",
    (err: Error) => {
      console.error("[DatabasePool] Unexpected error on idle PostgreSQL client:", err?.message || err);
    }
  );

  dbInstance = drizzle(poolInstance, { schema });
  return dbInstance;
}

export function getPool(): Pool | null {
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
