import { Pool, type PoolClient } from "pg";

let sharedPool: Pool | null = null;

function resolvePostgresConnectionString(): string | null {
  const direct =
    (process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.PG_CONNECTION_STRING ||
      "").trim();
  if (direct) return direct;

  const host = (process.env.PGHOST || "").trim();
  const user = (process.env.PGUSER || "").trim();
  const database = (process.env.PGDATABASE || "").trim();
  if (!host || !user || !database) return null;

  const port = (process.env.PGPORT || "5432").trim();
  const password = encodeURIComponent(process.env.PGPASSWORD || "");
  return `postgresql://${encodeURIComponent(user)}:${password}@${host}:${port}/${encodeURIComponent(database)}`;
}

export function isPostgresConfigured(): boolean {
  return Boolean(resolvePostgresConnectionString());
}

export function getPostgresPool(): Pool {
  if (sharedPool) return sharedPool;
  const connectionString = resolvePostgresConnectionString();
  if (!connectionString) {
    throw new Error("PostgreSQL is not configured (set POSTGRES_URL or DATABASE_URL).");
  }

  const sslMode = (process.env.POSTGRES_SSL || process.env.PGSSLMODE || "").toLowerCase();
  const useSsl =
    sslMode === "require" ||
    sslMode === "true" ||
    /sslmode=require/i.test(connectionString);

  sharedPool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ...(useSsl ? { ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
  });

  return sharedPool;
}

/**
 * Executes a callback inside a PostgreSQL transaction with transaction-scoped
 * Row Level Security context (`app.current_user_id`), guaranteeing strict tenant
 * isolation on every SELECT / INSERT / UPDATE / DELETE.
 */
export async function withUserRlsTransaction<T>(
  ownerId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const cleanOwner = ownerId.trim();
  if (!cleanOwner || cleanOwner.length > 160) {
    throw new Error("Invalid tenant ownerId for RLS transaction");
  }

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [cleanOwner]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}
