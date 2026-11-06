import type { OrchestratorConfig } from "./config";
import type { Store } from "./store";

/**
 * Exécute une action sensible APRÈS décision humaine. Seul point du système qui agit à l'extérieur.
 * Une décision « rejected » n'exécute rien et rend la main à l'agent.
 */
export async function applyDecision(store: Store, cfg: OrchestratorConfig, approvalId: string, decision: "approved" | "rejected", fetchImpl: typeof fetch = fetch) {
  const a = await store.decideApproval(approvalId, decision);
  if (!a) throw new Error("Validation introuvable ou déjà traitée.");
  if (decision === "rejected") {
    await store.finishApproval(approvalId, "rejected", "Refusée par l'humain.");
    return { status: "rejected" as const };
  }
  try {
    const result = await execute(a.action, a.payload, cfg, fetchImpl);
    await store.finishApproval(approvalId, "executed", result);
    return { status: "executed" as const, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.finishApproval(approvalId, "failed", msg);
    return { status: "failed" as const, result: msg };
  }
}

async function execute(action: string, payload: Record<string, unknown>, cfg: OrchestratorConfig, fetchImpl: typeof fetch): Promise<string> {
  switch (action) {
    case "send_webhook": {
      if (!cfg.webhookUrl) throw new Error("AIHQ_WEBHOOK_URL n'est pas configuré.");
      const r = await fetchImpl(cfg.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "ai-hq", title: payload.title, text: `*${payload.title}*\n${payload.message}`, message: payload.message }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`Le webhook a répondu ${r.status}.`);
      return `Envoyé (HTTP ${r.status}).`;
    }
    default:
      throw new Error(`Action inconnue : ${action}`);
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
