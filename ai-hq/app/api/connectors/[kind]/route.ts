import { NextResponse } from "next/server";
import { ConnectorStore, EncryptionKeyMissingError, type ConnectorKind } from "@/orchestrator/connectors";
import { randomSecret } from "@/orchestrator/crypto";
import { validWebhookUrl } from "@/orchestrator/n8n";
import { getContext, notConfigured, readJson } from "@/server/context";

export const runtime = "nodejs";

const KINDS: ConnectorKind[] = ["n8n", "google", "slack", "sheets"];
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Enregistre les réglages d'un connecteur. Toute modification exige un nouveau test. */
export async function PUT(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!KINDS.includes(kind as ConnectorKind)) return bad("connecteur inconnu");
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  const b = (await readJson<Record<string, unknown>>(req)) ?? {};
  try {
    switch (kind) {
      case "n8n": {
        const webhookUrl = String(b.webhookUrl ?? "").trim();
        const err = validWebhookUrl(webhookUrl);
        if (err) return bad(err);
        const allowedWorkflows = (Array.isArray(b.allowedWorkflows) ? b.allowedWorkflows : String(b.allowedWorkflows ?? "").split(","))
          .map((w) => String(w).trim())
          .filter((w) => /^[a-z0-9_-]{1,60}$/i.test(w));
        const hosting = b.hosting === "self-hosted" ? "self-hosted" : "cloud";
        const current = await cs.get("n8n");
        const secret = !current.hasSecret || b.regenerateSecret === true ? { signingSecret: randomSecret() } : undefined;
        return NextResponse.json(await cs.save("n8n", { webhookUrl, allowedWorkflows, hosting }, secret));
      }
      case "google": {
        const clientId = String(b.clientId ?? "").trim();
        if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) return bad("ID client OAuth invalide (se termine par .apps.googleusercontent.com).");
        const settings = {
          clientId,
          gmailRead: b.gmailRead === true,
          readFilter: String(b.readFilter ?? "label:ai-hq").slice(0, 300),
          gmailSend: b.gmailSend !== false,
        };
        const clientSecret = typeof b.clientSecret === "string" && b.clientSecret.trim() ? { clientSecret: b.clientSecret.trim() } : undefined;
        const current = await cs.get("google");
        if (!current.hasSecret && !clientSecret) return bad("Code secret du client OAuth requis.");
        // Changer d'identifiants client invalide le jeton : il faudra se reconnecter.
        const secret = clientSecret ? { ...clientSecret, refreshToken: undefined } : undefined;
        const saved = await cs.save("google", settings, secret);
        return NextResponse.json(saved);
      }
      case "slack": {
        const webhookUrl = String(b.webhookUrl ?? "").trim();
        if (!/^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(webhookUrl)) return bad("URL de webhook Slack invalide (https://hooks.slack.com/services/…).");
        return NextResponse.json(await cs.save("slack", {}, { webhookUrl }));
      }
      case "sheets": {
        const mode = ["off", "demo", "n8n", "direct"].includes(String(b.mode)) ? String(b.mode) : "demo";
        const spreadsheetId = String(b.spreadsheetId ?? "").trim();
        if (spreadsheetId && !/^[\w-]{20,100}$/.test(spreadsheetId)) return bad("Identifiant de Google Sheets invalide (la partie entre /d/ et /edit dans l'URL).");
        const sheetName = String(b.sheetName ?? "Missions").trim().slice(0, 100) || "Missions";
        const saved = await cs.save("sheets", { mode, spreadsheetId, sheetName });
        await cs.setStatus("sheets", mode === "demo" || mode === "off" ? "configured" : "configured");
        return NextResponse.json(saved);
      }
    }
  } catch (e) {
    if (e instanceof EncryptionKeyMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  return bad("connecteur inconnu");
}

/** Déconnecte un connecteur (efface ses secrets). Pour Google, utilisez la révocation. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!["n8n", "slack"].includes(kind)) return bad("Utilisez /api/connectors/google/revoke pour Google.");
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  await new ConnectorStore(store.db).clear(kind as ConnectorKind);
  return NextResponse.json({ ok: true });
}
