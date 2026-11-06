import { Pool, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const g = globalThis as unknown as { __aihqPools?: Map<string, { pool: Pool; ready: Promise<void> }> };
const pools = (g.__aihqPools ??= new Map());

/** Pool PostgreSQL partagé (Next.js et worker), schéma appliqué une fois. */
export async function getDb(url: string): Promise<Pool> {
  let entry = pools.get(url);
  if (!entry) {
    const pool = new Pool({ connectionString: url, max: 10 });
    const ready = pool.query(readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8")).then(() => undefined);
    entry = { pool, ready };
    pools.set(url, entry);
    ready.catch(() => pools.delete(url));
  }
  await entry.ready;
  return entry.pool;
}

export async function tx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function closeAll(): Promise<void> {
  for (const { pool } of pools.values()) await pool.end();
  pools.clear();
}
