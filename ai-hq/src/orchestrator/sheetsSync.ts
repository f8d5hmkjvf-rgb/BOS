import type { Pool } from "pg";
import { agentById } from "./agents";
import type { ConnectorStore, ResolvedConnectors } from "./connectors";
import { accessToken, SCOPES, upsertRow } from "./google";
import { callN8n } from "./n8n";

/**
 * Premier workflow réel : AI HQ → Gaspard → agents → Google Sheets.
 * Chaque changement de mission alimente une file dédoublonnée (une entrée par mission, version
 * croissante). Le worker pousse la DERNIÈRE version via UNE seule voie : démo, n8n ou Sheets direct.
 * L'upsert par « ID mission » rend la synchronisation idempotente : aucun doublon, même rejouée.
 */
export const SHEET_HEADERS = [
  "ID mission",
  "Date de création",
  "Nom de la mission",
  "Agent responsable",
  "Département",
  "Priorité",
  "Statut",
  "Progression",
  "Résultat",
  "Coût API (USD)",
  "Dernière mise à jour",
] as const;

export type SheetRow = Record<(typeof SHEET_HEADERS)[number], string>;

const STATUS_FR: Record<string, string> = {
  planning: "Planification",
  running: "En cours",
  reviewing: "Vérification",
  reporting: "Rapport",
  awaiting_approval: "Attente de validation",
  paused: "En pause (budget)",
  done: "Terminée",
  failed: "Échec",
  cancelled: "Annulée",
};

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Ligne du tableau construite à partir de l'état VÉRIFIÉ en base (pas des déclarations des agents). */
export async function buildRow(db: Pool, missionId: string): Promise<SheetRow | null> {
  const m = (await db.query("SELECT * FROM missions WHERE id=$1", [missionId])).rows[0];
  if (!m) return null;
  const tasks = (await db.query("SELECT kind, assignee, status FROM tasks WHERE mission_id=$1", [missionId])).rows as { kind: string; assignee: string; status: string }[];
  const counted = tasks.filter((t) => t.status !== "cancelled");
  const done = counted.filter((t) => t.status === "done").length;
  const progress = m.status === "done" ? 100 : counted.length ? Math.round((done / counted.length) * 100) : 0;
  // Agent responsable : le spécialiste qui porte le plus de tâches, sinon Gaspard (planification).
  const load = new Map<string, number>();
  for (const t of tasks) if (t.kind === "execute") load.set(t.assignee, (load.get(t.assignee) ?? 0) + 1);
  const leadId = [...load.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "gaspard";
  const lead = agentById(leadId);
  const result = m.status === "done" ? oneLine(String(m.result ?? ""), 500) : m.status === "failed" ? `Échec : ${oneLine(String(m.error ?? ""), 300)}` : "";
  return {
    "ID mission": m.id,
    "Date de création": new Date(m.created_at).toISOString(),
    "Nom de la mission": oneLine(m.goal, 120),
    "Agent responsable": lead ? `${lead.name} (${lead.role})` : leadId,
    Département: lead?.department ?? "",
    Priorité: m.priority ?? "normale",
    Statut: STATUS_FR[m.status] ?? m.status,
    Progression: `${progress} %`,
    Résultat: result,
    "Coût API (USD)": Number(m.spent_usd).toFixed(4),
    "Dernière mise à jour": new Date(m.updated_at).toISOString(),
  };
}

export const rowValues = (r: SheetRow) => SHEET_HEADERS.map((h) => r[h]);

/** Programme une synchronisation (anti-rafale : regroupée sur 3 secondes). */
export async function enqueueSync(q: { query: Pool["query"] }, missionId: string): Promise<void> {
  await q.query(
    `INSERT INTO sync_queue (mission_id, next_at) VALUES ($1, now() + interval '3 seconds')
     ON CONFLICT (mission_id) DO UPDATE SET version = sync_queue.version + 1, next_at = now() + interval '3 seconds', updated_at = now()`,
    [missionId],
  );
}

export interface SyncDeps {
  db: Pool;
  connectors: ConnectorStore;
  fetchImpl?: typeof fetch;
}

/** Traite les synchronisations dues. Retourne le nombre d'éléments traités. */
export async function processSyncQueue(d: SyncDeps, limit = 5): Promise<number> {
  const due = (
    await d.db.query(
      `UPDATE sync_queue SET next_at = now() + interval '60 seconds'
       WHERE mission_id IN (SELECT mission_id FROM sync_queue WHERE version > synced_version AND next_at <= now() ORDER BY next_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING mission_id, version, attempts`,
      [limit],
    )
  ).rows as { mission_id: string; version: number; attempts: number }[];
  if (!due.length) return 0;
  const resolved = await d.connectors.resolve();
  for (const item of due) await syncOne(d, resolved, item);
  return due.length;
}

async function syncOne(d: SyncDeps, c: ResolvedConnectors, item: { mission_id: string; version: number; attempts: number }): Promise<void> {
  const f = d.fetchImpl ?? fetch;
  const key = `${item.mission_id}:v${item.version}`;
  const t0 = Date.now();
  const mode = c.sheets.mode;
  const done = async () =>
    d.db.query("UPDATE sync_queue SET synced_version = GREATEST(synced_version, $2), attempts = 0, last_error = NULL WHERE mission_id=$1", [item.mission_id, item.version]);
  try {
    const row = await buildRow(d.db, item.mission_id);
    if (!row || mode === "off") return void (await done());
    if (mode === "demo") {
      await d.db.query(
        `INSERT INTO sheet_demo_rows (mission_id, row, version) VALUES ($1,$2,$3)
         ON CONFLICT (mission_id) DO UPDATE SET row=$2, version=$3, updated_at=now() WHERE sheet_demo_rows.version <= $3`,
        [item.mission_id, JSON.stringify(row), item.version],
      );
      await d.connectors.logRun({ connector: "sheets", action: "upsert (DÉMO)", target: item.mission_id, status: "demo", durationMs: Date.now() - t0, idempotencyKey: key });
    } else if (mode === "n8n") {
      if (!c.n8n?.connected) throw new Error("n8n n'est pas connecté (configurez et testez-le dans les Paramètres).");
      const r = await callN8n(c.n8n.webhookUrl, c.n8n.signingSecret, { type: "sync_mission", data: { key: item.mission_id, version: item.version, headers: SHEET_HEADERS, row }, idempotencyKey: key }, f);
      await d.connectors.logRun({ connector: "n8n", action: "sync_mission", target: item.mission_id, status: "ok", httpStatus: r.status, durationMs: Date.now() - t0, idempotencyKey: key });
    } else {
      const g = c.google;
      if (!g?.connected) throw new Error("Google n'est pas connecté (Paramètres → Google).");
      if (!g.grantedScopes.includes(SCOPES.sheets)) throw new Error("L'accès Google Sheets n'a pas été autorisé : reconnectez Google avec le mode Sheets « direct ».");
      if (!c.sheets.spreadsheetId) throw new Error("Identifiant du Google Sheets manquant (Paramètres → Google Sheets).");
      const token = await accessToken(g, f);
      const how = await upsertRow(token, c.sheets.spreadsheetId, c.sheets.sheetName || "Missions", [...SHEET_HEADERS], rowValues(row), f);
      await d.connectors.logRun({ connector: "sheets", action: `upsert (${how === "updated" ? "mise à jour" : "ajout"})`, target: item.mission_id, status: "ok", durationMs: Date.now() - t0, idempotencyKey: key });
    }
    await done();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const backoff = Math.min(3600, 30 * 2 ** item.attempts);
    await d.db.query("UPDATE sync_queue SET attempts = attempts + 1, last_error=$2, next_at = now() + ($3 || ' seconds')::interval WHERE mission_id=$1", [item.mission_id, msg.slice(0, 1000), String(backoff)]);
    await d.connectors.logRun({
      connector: mode === "n8n" ? "n8n" : "sheets",
      action: "sync_mission",
      target: item.mission_id,
      status: "error",
      httpStatus: (e as { httpStatus?: number; status?: number }).httpStatus ?? (e as { status?: number }).status ?? null,
      error: msg,
      durationMs: Date.now() - t0,
      idempotencyKey: key,
    });
  }
}
