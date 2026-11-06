import "server-only";
import { Pool } from "pg";
import type { WorldSnapshot } from "../sim/engine";
import { readFileSync } from "node:fs";
import path from "node:path";

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

/** Pool PostgreSQL, ou null si DATABASE_URL n'est pas défini (mode sans base). */
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    ready = pool.query(readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8")).then(() => undefined);
  }
  return pool;
}

async function db(): Promise<Pool | null> {
  const p = getPool();
  if (p) await ready;
  return p;
}

export async function saveSnapshot(slot: string, s: WorldSnapshot): Promise<boolean> {
  const p = await db();
  if (!p) return false;
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO sim_saves (slot, seed, tick, sim_day, sim_sec, snapshot, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (slot) DO UPDATE SET seed=$2, tick=$3, sim_day=$4, sim_sec=$5, snapshot=$6, updated_at=now()`,
      [slot, s.seed, s.tick, s.day, Math.round(s.sec), JSON.stringify(s)],
    );
    await c.query("DELETE FROM sim_agent_states WHERE slot=$1", [slot]);
    for (const a of s.agents) {
      await c.query(
        "INSERT INTO sim_agent_states (slot, agent_id, on_duty, tile_x, tile_y, needs) VALUES ($1,$2,$3,$4,$5,$6)",
        [slot, a.id, a.onDuty, a.x, a.y, JSON.stringify(a.needs)],
      );
    }
    await c.query("COMMIT");
    return true;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function loadSnapshot(slot: string): Promise<WorldSnapshot | null | undefined> {
  const p = await db();
  if (!p) return undefined;
  const r = await p.query("SELECT snapshot FROM sim_saves WHERE slot=$1", [slot]);
  return r.rows[0]?.snapshot ?? null;
}

export async function logAuthorizedIntent(i: { id: string; agentId: string; kind: string; summary: string }): Promise<void> {
  const p = await db();
  if (!p) return;
  await p.query("INSERT INTO authorized_intents (id, agent_id, kind, summary) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [i.id, i.agentId, i.kind, i.summary]);
}
