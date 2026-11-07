import { NextResponse } from "next/server";
import { validateSnapshot } from "@/persistence/schema";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";
const SLOT = /^[a-z0-9_-]{1,40}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params;
  if (!SLOT.test(slot)) return NextResponse.json({ error: "slot invalide" }, { status: 400 });
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const r = await store.db.query("SELECT snapshot FROM sim_saves WHERE slot=$1", [slot]);
  // Absence de sauvegarde : réponse vide (pas une erreur).
  if (!r.rows[0]) return NextResponse.json(null);
  return NextResponse.json(r.rows[0].snapshot);
}

/** Sauvegarde complète du QG (positions, besoins, relations, tâches, files, conversations, réunions). */
export async function PUT(req: Request, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params;
  if (!SLOT.test(slot)) return NextResponse.json({ error: "slot invalide" }, { status: 400 });
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  let s;
  try {
    s = validateSnapshot(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalide" }, { status: 400 });
  }
  const c = await store.db.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO sim_saves (slot, seed, tick, sim_day, sim_sec, snapshot, updated_at) VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (slot) DO UPDATE SET seed=$2, tick=$3, sim_day=$4, sim_sec=$5, snapshot=$6, updated_at=now()`,
      [slot, s.seed, s.tick, s.day, Math.round(s.sec), JSON.stringify(s)],
    );
    await c.query("DELETE FROM sim_agent_states WHERE slot=$1", [slot]);
    for (const a of s.agents)
      await c.query("INSERT INTO sim_agent_states (slot, agent_id, on_duty, tile_x, tile_y, needs) VALUES ($1,$2,$3,$4,$5,$6)", [slot, a.id, a.onDuty, a.x, a.y, JSON.stringify(a.needs)]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return NextResponse.json({ ok: true });
}
