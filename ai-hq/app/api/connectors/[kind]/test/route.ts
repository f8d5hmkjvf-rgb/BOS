import { NextResponse } from "next/server";
import { ConnectorStore, type GoogleSecret, type GoogleSettings, type N8nSecret, type N8nSettings, type SheetsSettings, type SlackSecret } from "@/orchestrator/connectors";
import { accessToken, gmailProfile, SCOPES } from "@/orchestrator/google";
import { callN8n } from "@/orchestrator/n8n";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";

/** Test RÉEL d'un connecteur. Seul un test réussi le fait passer à « connecté ». */
export async function POST(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  const t0 = Date.now();
  const fail = async (k: "n8n" | "google" | "slack" | "sheets", msg: string, httpStatus?: number) => {
    await cs.setStatus(k, "error", { error: msg });
    await cs.logRun({ connector: k, action: "test", status: "error", error: msg, httpStatus, durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  };
  const ok = async (k: "n8n" | "google" | "slack" | "sheets", detail: string, account?: string) => {
    await cs.setStatus(k, "connected", { account: account ?? null, error: null });
    await cs.logRun({ connector: k, action: "test", status: "ok", durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, detail });
  };
  try {
    switch (kind) {
      case "n8n": {
        const row = await cs.get("n8n");
        const s = row.settings as unknown as N8nSettings;
        const sec = await cs.secret<N8nSecret>("n8n");
        if (!s.webhookUrl || !sec) return fail("n8n", "n8n n'est pas configuré.");
        const r = await callN8n(s.webhookUrl, sec.signingSecret, { type: "ping", data: { message: "Test de connexion AI HQ" } });
        return ok("n8n", `n8n a répondu HTTP ${r.status}.`);
      }
      case "slack": {
        const sec = await cs.secret<SlackSecret>("slack");
        if (!sec) return fail("slack", "Slack n'est pas configuré.");
        const r = await fetch(sec.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "✅ AI HQ : test de connexion réussi." }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) return fail("slack", `Slack a répondu HTTP ${r.status}.`, r.status);
        return ok("slack", "Message de test publié dans Slack.");
      }
      case "google": {
        const s = (await cs.get("google")).settings as unknown as GoogleSettings;
        const sec = await cs.secret<GoogleSecret>("google");
        if (!s.clientId || !sec?.refreshToken) return fail("google", "Compte Google non connecté : cliquez sur « Connecter Google ».");
        const email = await gmailProfile(await accessToken({ ...s, ...sec }));
        return ok("google", `Connecté au compte ${email}.`, email);
      }
      case "sheets": {
        const s = (await cs.get("sheets")).settings as unknown as SheetsSettings;
        if (s.mode === "demo") return NextResponse.json({ ok: true, detail: "Mode DÉMONSTRATION : les lignes sont écrites dans un tableau local d'AI HQ, pas dans Google Sheets." });
        if (s.mode === "off") return NextResponse.json({ ok: true, detail: "Synchronisation désactivée." });
        const r = await cs.resolve();
        if (s.mode === "n8n") return r.n8n?.connected ? ok("sheets", "Synchronisation via n8n prête (n8n connecté).") : fail("sheets", "Le mode n8n exige un connecteur n8n testé avec succès.");
        const g = r.google;
        if (!g?.connected) return fail("sheets", "Le mode direct exige un compte Google connecté.");
        if (!g.grantedScopes.includes(SCOPES.sheets)) return fail("sheets", "Accès Google Sheets non autorisé : reconnectez Google après avoir choisi le mode direct.");
        if (!s.spreadsheetId) return fail("sheets", "Identifiant du tableur manquant.");
        const token = await accessToken(g);
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(s.spreadsheetId)}?fields=properties.title`, { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok) return fail("sheets", `Tableur inaccessible (HTTP ${res.status}) : vérifiez l'identifiant et que le compte connecté y a accès.`, res.status);
        const j = (await res.json()) as { properties?: { title?: string } };
        return ok("sheets", `Tableur « ${j.properties?.title ?? s.spreadsheetId} » accessible.`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(kind as "n8n", msg, (e as { httpStatus?: number; status?: number }).httpStatus ?? (e as { status?: number }).status);
  }
  return NextResponse.json({ error: "connecteur inconnu" }, { status: 400 });
}
