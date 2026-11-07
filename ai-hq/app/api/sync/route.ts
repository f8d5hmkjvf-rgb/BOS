import { NextResponse } from "next/server";
import { ConnectorStore } from "@/orchestrator/connectors";
import { SHEET_HEADERS } from "@/orchestrator/sheetsSync";
import { getContext, notConfigured, readJson } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Historique des exécutions/erreurs des connecteurs + tableau de démonstration + file d'attente. */
export async function GET() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  const [runs, demo, queue] = await Promise.all([
    cs.runs(60),
    store.db.query("SELECT row FROM sheet_demo_rows ORDER BY updated_at DESC LIMIT 100"),
    store.db.query("SELECT COUNT(*) FILTER (WHERE version > synced_version)::int pending, COUNT(*) FILTER (WHERE last_error IS NOT NULL)::int errors FROM sync_queue"),
  ]);
  return NextResponse.json({ headers: SHEET_HEADERS, runs, demoRows: demo.rows.map((r) => r.row), queue: queue.rows[0] });
}

/** Resynchronise toutes les missions (idempotent : aucune ligne dupliquée). */
export async function POST(req: Request) {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const b = await readJson<{ action?: string }>(req);
  if (b?.action !== "resync_all") return NextResponse.json({ error: "action inconnue" }, { status: 400 });
  const r = await store.db.query(
    `INSERT INTO sync_queue (mission_id) SELECT id FROM missions
     ON CONFLICT (mission_id) DO UPDATE SET version = sync_queue.version + 1, next_at = now(), attempts = 0 RETURNING mission_id`,
  );
  return NextResponse.json({ queued: r.rowCount });
}
