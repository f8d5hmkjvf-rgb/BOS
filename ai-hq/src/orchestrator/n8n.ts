import { randomUUID } from "node:crypto";
import { signPayload } from "./crypto";

/**
 * Appels sortants vers n8n (Cloud ou auto-hébergé), signés :
 *   x-aihq-timestamp : secondes Unix   (anti-rejeu : refuser au-delà de 5 min)
 *   x-aihq-signature : sha256=HMAC(secret, timestamp + "." + corps)
 *   x-aihq-idempotency-key : clé stable par événement (dédoublonnage côté n8n)
 */
export interface N8nCall {
  type: "ping" | "workflow" | "sync_mission";
  workflow?: string;
  data: unknown;
  idempotencyKey?: string;
}

export async function callN8n(webhookUrl: string, secret: string, call: N8nCall, f: typeof fetch = fetch): Promise<{ status: number; body: string; idempotencyKey: string }> {
  const idempotencyKey = call.idempotencyKey ?? randomUUID();
  const body = JSON.stringify({ source: "ai-hq", type: call.type, workflow: call.workflow ?? call.type, idempotencyKey, sentAt: new Date().toISOString(), data: call.data });
  const ts = String(Math.floor(Date.now() / 1000));
  const r = await f(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aihq-timestamp": ts,
      "x-aihq-signature": signPayload(secret, ts, body),
      "x-aihq-idempotency-key": idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = (await r.text().catch(() => "")).slice(0, 1000);
  if (!r.ok) throw Object.assign(new Error(`n8n a répondu HTTP ${r.status}${text ? ` — ${text}` : ""}`), { httpStatus: r.status });
  return { status: r.status, body: text, idempotencyKey };
}

export function validWebhookUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
      return "L'URL du webhook n8n doit être en HTTPS (http accepté seulement pour localhost).";
    return null;
  } catch {
    return "URL de webhook invalide.";
  }
}
