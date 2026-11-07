"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface Connector {
  kind: "n8n" | "google" | "slack" | "sheets";
  settings: Record<string, unknown>;
  hasSecret: boolean;
  status: "not_configured" | "configured" | "connected" | "error";
  account: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
}
interface ConnectorsResponse {
  connectors: Connector[];
  encryptionKey: boolean;
  googleRedirectUri: string;
}
interface SyncResponse {
  headers: string[];
  runs: { id: number; connector: string; action: string; target: string | null; status: string; http_status: number | null; error: string | null; duration_ms: number | null; created_at: string }[];
  demoRows: Record<string, string>[];
  queue: { pending: number; errors: number };
}

const STATUS: Record<Connector["status"], [string, string]> = {
  not_configured: ["Non configuré", "s-cancelled"],
  configured: ["Configuré — non testé", "s-paused"],
  connected: ["Connecté (testé)", "s-done"],
  error: ["Erreur", "s-failed"],
};

function Status({ c }: { c: Connector }) {
  const [label, cls] = STATUS[c.status];
  return (
    <span className={`pill ${cls}`} title={c.lastTestedAt ? `Dernier test : ${new Date(c.lastTestedAt).toLocaleString("fr-FR")}` : undefined}>
      {label}
      {c.account ? ` · ${c.account}` : ""}
    </span>
  );
}

export function SettingsPanel({ refreshKey, onError, onInfo }: { refreshKey: number; onError: (m: string) => void; onInfo: (m: string) => void }) {
  const [data, setData] = useState<ConnectorsResponse | null>(null);
  const [sync, setSync] = useState<SyncResponse | null>(null);
  const [form, setForm] = useState<Record<string, Record<string, string | boolean>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<ConnectorsResponse>("/api/connectors");
      setData(d);
      setSync(await api<SyncResponse>("/api/sync"));
      const by = Object.fromEntries(d.connectors.map((c) => [c.kind, c]));
      const s = (k: string) => by[k]?.settings ?? {};
      setForm({
        n8n: { webhookUrl: String(s("n8n").webhookUrl ?? ""), hosting: String(s("n8n").hosting ?? "cloud"), allowedWorkflows: ((s("n8n").allowedWorkflows as string[]) ?? []).join(", ") },
        google: { clientId: String(s("google").clientId ?? ""), clientSecret: "", gmailRead: Boolean(s("google").gmailRead), readFilter: String(s("google").readFilter ?? "label:ai-hq"), gmailSend: s("google").gmailSend !== false },
        sheets: { mode: String(s("sheets").mode ?? "demo"), spreadsheetId: String(s("sheets").spreadsheetId ?? ""), sheetName: String(s("sheets").sheetName ?? "Missions") },
        slack: { webhookUrl: "" },
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const set = (k: string, f: string, v: string | boolean) => setForm((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      void load();
    }
  };
  const save = (kind: string, body: Record<string, unknown>) => run(`save-${kind}`, async () => void (await api(`/api/connectors/${kind}`, { method: "PUT", body: JSON.stringify(body) }), onInfo("Enregistré — testez la connexion.")));
  const test = (kind: string) =>
    run(`test-${kind}`, async () => {
      const r = await api<{ ok: boolean; detail?: string; error?: string }>(`/api/connectors/${kind}/test`, { method: "POST" });
      if (r.ok) onInfo(r.detail ?? "Test réussi.");
      else onError(r.error ?? "Échec du test.");
    });

  if (!data) return <section className="card"><p className="small muted">Paramètres disponibles quand PostgreSQL est configuré.</p></section>;
  const c = Object.fromEntries(data.connectors.map((x) => [x.kind, x])) as Record<Connector["kind"], Connector>;
  const f = form;
  const sheetsMode = String(f.sheets?.mode ?? "demo");

  return (
    <>
      {!data.encryptionKey && (
        <div className="banner warn" role="alert">
          <strong>Clé de chiffrement manquante</strong>
          <p className="small">
            Définissez <code>AIHQ_ENCRYPTION_KEY</code> (commande : <code>openssl rand -base64 32</code>) pour stocker les identifiants des connecteurs de façon chiffrée.
          </p>
        </div>
      )}

      <section className="card">
        <div className="row between">
          <h3>Google Sheets — suivi des missions</h3>
          {sheetsMode === "demo" ? <span className="pill s-paused">MODE DÉMONSTRATION</span> : <Status c={c.sheets} />}
        </div>
        <p className="small muted">Une seule voie de synchronisation à la fois. Chaque mission = une ligne, mise à jour sans doublon (clé : ID mission).</p>
        <label className="small">
          Voie
          <select value={sheetsMode} onChange={(e) => set("sheets", "mode", e.target.value)}>
            <option value="demo">Démonstration (tableau local dans AI HQ)</option>
            <option value="n8n">Via n8n (recommandé si vous utilisez n8n)</option>
            <option value="direct">Directement avec Google Sheets</option>
            <option value="off">Désactivée</option>
          </select>
        </label>
        {sheetsMode === "direct" && (
          <>
            <label className="small">
              ID du tableur (partie entre /d/ et /edit de l&apos;URL)
              <input value={String(f.sheets.spreadsheetId)} onChange={(e) => set("sheets", "spreadsheetId", e.target.value)} />
            </label>
            <label className="small">
              Onglet
              <input value={String(f.sheets.sheetName)} onChange={(e) => set("sheets", "sheetName", e.target.value)} />
            </label>
            <p className="small muted">Nécessite Google connecté avec l&apos;accès Sheets : après avoir enregistré ce mode, (re)connectez Google.</p>
          </>
        )}
        <div className="row">
          <button onClick={() => save("sheets", f.sheets)} disabled={busy !== null}>
            Enregistrer
          </button>
          <button onClick={() => test("sheets")} disabled={busy !== null}>
            Tester
          </button>
          <button className="link" onClick={() => run("resync", async () => void (await api("/api/sync", { method: "POST", body: JSON.stringify({ action: "resync_all" }) }), onInfo("Resynchronisation programmée.")))}>
            Tout resynchroniser
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h3>n8n</h3>
          <Status c={c.n8n} />
        </div>
        <p className="small muted">n8n Cloud ou instance auto-hébergée. AI HQ signe chaque appel (HMAC-SHA256, anti-rejeu, clé d&apos;idempotence).</p>
        <label className="small">
          Hébergement
          <select value={String(f.n8n?.hosting)} onChange={(e) => set("n8n", "hosting", e.target.value)}>
            <option value="cloud">n8n Cloud</option>
            <option value="self-hosted">Auto-hébergé</option>
          </select>
        </label>
        <label className="small">
          URL du webhook (Production URL du nœud Webhook)
          <input value={String(f.n8n?.webhookUrl ?? "")} onChange={(e) => set("n8n", "webhookUrl", e.target.value)} placeholder="https://xxx.app.n8n.cloud/webhook/ai-hq" />
        </label>
        <label className="small">
          Workflows que les agents peuvent demander (séparés par des virgules)
          <input value={String(f.n8n?.allowedWorkflows ?? "")} onChange={(e) => set("n8n", "allowedWorkflows", e.target.value)} placeholder="sync_mission, ajouter_prospect" />
        </label>
        <div className="row">
          <button onClick={() => save("n8n", f.n8n)} disabled={busy !== null}>
            Enregistrer
          </button>
          <button onClick={() => test("n8n")} disabled={busy !== null || !c.n8n.hasSecret}>
            Tester (ping signé)
          </button>
          {c.n8n.hasSecret && (
            <button
              className="link"
              onClick={() =>
                run("secret", async () => {
                  const r = await api<{ signingSecret: string }>("/api/connectors/n8n/secret", { method: "POST" });
                  window.prompt("Secret de signature à copier dans n8n (variable AIHQ_SECRET) :", r.signingSecret);
                })
              }
            >
              Afficher le secret
            </button>
          )}
          {c.n8n.hasSecret && (
            <button className="link" onClick={() => window.confirm("Générer un nouveau secret ? L'ancien ne sera plus accepté par n8n.") && save("n8n", { ...f.n8n, regenerateSecret: true })}>
              Nouveau secret
            </button>
          )}
        </div>
        {c.n8n.lastError && <p className="error small">{c.n8n.lastError}</p>}
      </section>

      <section className="card">
        <div className="row between">
          <h3>Google (Gmail)</h3>
          <Status c={c.google} />
        </div>
        <p className="small muted">Connexion OAuth 2.0 : vous vous identifiez chez Google. AI HQ ne voit jamais votre mot de passe ; seul un jeton révocable est stocké, chiffré.</p>
        <label className="small">
          ID client OAuth
          <input value={String(f.google?.clientId ?? "")} onChange={(e) => set("google", "clientId", e.target.value)} placeholder="….apps.googleusercontent.com" />
        </label>
        <label className="small">
          Code secret du client {c.google.hasSecret && <em className="muted">(enregistré — laisser vide pour le conserver)</em>}
          <input type="password" autoComplete="off" value={String(f.google?.clientSecret ?? "")} onChange={(e) => set("google", "clientSecret", e.target.value)} />
        </label>
        <label className="small check">
          <input type="checkbox" checked={Boolean(f.google?.gmailRead)} onChange={(e) => set("google", "gmailRead", e.target.checked)} /> Autoriser les agents à rechercher et lire des e-mails
        </label>
        {Boolean(f.google?.gmailRead) && (
          <label className="small">
            …uniquement ceux correspondant à ce filtre Gmail
            <input value={String(f.google?.readFilter ?? "")} onChange={(e) => set("google", "readFilter", e.target.value)} />
          </label>
        )}
        <label className="small check">
          <input type="checkbox" checked={Boolean(f.google?.gmailSend)} onChange={(e) => set("google", "gmailSend", e.target.checked)} /> Autoriser les demandes d&apos;envoi (chaque envoi exige votre approbation)
        </label>
        <p className="small muted">
          URI de redirection à déclarer dans Google Cloud : <code>{data.googleRedirectUri}</code>
        </p>
        <div className="row">
          <button onClick={() => save("google", f.google)} disabled={busy !== null}>
            Enregistrer
          </button>
          <button
            className="primary"
            disabled={busy !== null || !c.google.hasSecret}
            onClick={() => run("oauth", async () => void (window.location.href = (await api<{ url: string }>("/api/connectors/google/start", { method: "POST" })).url))}
          >
            {c.google.status === "connected" ? "Reconnecter" : "Connecter Google"}
          </button>
          <button onClick={() => test("google")} disabled={busy !== null}>
            Tester
          </button>
          {c.google.account && (
            <button
              className="link"
              onClick={() =>
                window.confirm("Révoquer l'accès d'AI HQ à votre compte Google ?") &&
                run("revoke", async () => {
                  const r = await api<{ warning: string | null }>("/api/connectors/google/revoke", { method: "POST" });
                  if (r.warning) onError(r.warning);
                  else onInfo("Accès Google révoqué.");
                })
              }
            >
              Révoquer
            </button>
          )}
        </div>
        {c.google.lastError && <p className="error small">{c.google.lastError}</p>}
      </section>

      <section className="card">
        <div className="row between">
          <h3>Slack</h3>
          <Status c={c.slack} />
        </div>
        <label className="small">
          URL du webhook entrant {c.slack.hasSecret && <em className="muted">(enregistrée)</em>}
          <input type="password" autoComplete="off" value={String(f.slack?.webhookUrl ?? "")} onChange={(e) => set("slack", "webhookUrl", e.target.value)} placeholder="https://hooks.slack.com/services/…" />
        </label>
        <div className="row">
          <button onClick={() => save("slack", f.slack)} disabled={busy !== null || !f.slack?.webhookUrl}>
            Enregistrer
          </button>
          <button onClick={() => test("slack")} disabled={busy !== null || !c.slack.hasSecret}>
            Tester
          </button>
        </div>
      </section>

      {sync && (
        <section className="card">
          <h3>Historique des exécutions</h3>
          <p className="small muted">
            File : {sync.queue.pending} en attente · {sync.queue.errors} en erreur
          </p>
          <ul className="plain small runs">
            {sync.runs.length === 0 && <li className="muted">Aucune exécution.</li>}
            {sync.runs.map((r) => (
              <li key={r.id}>
                <span className={`pill ${r.status === "ok" ? "s-done" : r.status === "demo" ? "s-paused" : "s-failed"}`}>{r.status === "demo" ? "DÉMO" : r.status}</span> {new Date(r.created_at).toLocaleTimeString("fr-FR")} · {r.connector} ·{" "}
                {r.action}
                {r.http_status ? ` · HTTP ${r.http_status}` : ""}
                {r.error && <div className="error">{r.error}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sync && sheetsMode === "demo" && (
        <section className="card">
          <h3>Tableau de démonstration</h3>
          <p className="small muted">Aperçu de ce que contiendra Google Sheets. Ces lignes restent dans AI HQ tant qu&apos;aucune vraie voie n&apos;est connectée.</p>
          <div className="table-wrap">
            <table className="demo">
              <thead>
                <tr>
                  {sync.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sync.demoRows.map((r) => (
                  <tr key={r["ID mission"]}>
                    {sync.headers.map((h) => (
                      <td key={h}>{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
