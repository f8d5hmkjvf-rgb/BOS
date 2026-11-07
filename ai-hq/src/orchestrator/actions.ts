import type { OrchestratorConfig } from "./config";
import type { ConnectorStore } from "./connectors";
import { executeSensitive } from "./integrations";
import type { Store } from "./store";

/**
 * Exécute une action sensible APRÈS décision humaine. Seul point du système qui agit à l'extérieur.
 * Une décision « rejected » n'exécute rien et rend la main à l'agent.
 */
export async function applyDecision(store: Store, cfg: OrchestratorConfig, approvalId: string, decision: "approved" | "rejected", fetchImpl: typeof fetch = fetch, connectors?: ConnectorStore) {
  const a = await store.decideApproval(approvalId, decision);
  if (!a) throw new Error("Validation introuvable ou déjà traitée.");
  if (decision === "rejected") {
    await store.finishApproval(approvalId, "rejected", "Refusée par l'humain.");
    return { status: "rejected" as const };
  }
  try {
    const { siblings: _s, ...payload } = a.payload as Record<string, unknown>;
    void _s;
    const t0 = Date.now();
    const resolved = connectors ? await connectors.resolve() : { n8n: null, google: null, slack: null, sheets: { mode: "off" as const, spreadsheetId: "", sheetName: "" } };
    const result = await executeSensitive(a.action, payload, { connectors: resolved, genericWebhookUrl: cfg.genericWebhookUrl }, { missionId: a.mission_id, approvalId }, fetchImpl);
    await connectors?.logRun({ connector: connectorOf(a.action), action: a.action, target: a.mission_id, status: "ok", durationMs: Date.now() - t0, idempotencyKey: approvalId });
    await store.finishApproval(approvalId, "executed", result);
    return { status: "executed" as const, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await connectors?.logRun({ connector: connectorOf(a.action), action: a.action, target: a.mission_id, status: "error", error: msg, idempotencyKey: approvalId });
    await store.finishApproval(approvalId, "failed", msg);
    return { status: "failed" as const, result: msg };
  }
}

/** Notification de fin de mission vers un webhook que l'entrepreneur a lui-même configuré. */
export async function notifyMissionDone(cfg: OrchestratorConfig, mission: { id: string; goal: string; status: string; result: string | null }, fetchImpl: typeof fetch = fetch) {
  if (!cfg.notifyWebhookUrl) return;
  await fetchImpl(cfg.notifyWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "ai-hq", missionId: mission.id, status: mission.status, goal: mission.goal, text: `Mission ${mission.status} : ${mission.goal}`, result: mission.result }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => undefined);
}

function connectorOf(action: string): string {
  return action === "send_email" ? "gmail" : action === "trigger_n8n_workflow" ? "n8n" : action === "send_slack_message" ? "slack" : "webhook";
}
