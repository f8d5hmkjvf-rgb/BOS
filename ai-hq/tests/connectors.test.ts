import { afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { closeAll } from "@/orchestrator/db";
import { ConnectorStore, EncryptionKeyMissingError } from "@/orchestrator/connectors";
import { SecretBox } from "@/orchestrator/crypto";
import { processSyncQueue, SHEET_HEADERS } from "@/orchestrator/sheetsSync";
import { SCOPES, clearTokenCache } from "@/orchestrator/google";
import { verifySignature } from "@/orchestrator/crypto";
import { freshStore, TEST_DB } from "./helpers/db";

const box = new SecretBox(randomBytes(32).toString("base64"));

async function setup() {
  const store = await freshStore();
  await store.db.query("TRUNCATE connectors, oauth_states, sync_queue, sync_runs, sheet_demo_rows");
  return { store, cs: new ConnectorStore(store.db, box) };
}

/** Faux Google Sheets en mémoire : lecture colonne A, écriture de plage, ajout. */
function fakeSheets() {
  const rows: string[][] = [];
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${decodeURIComponent(url)}`);
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600 });
    const u = decodeURIComponent(url);
    const range = u.split("!")[1]?.split(/[?:]/)[0] ?? "";
    if ((init?.method ?? "GET") === "GET") return Response.json({ values: rows.map((r) => [r[0]]) });
    const values = JSON.parse(String(init!.body)).values[0] as string[];
    if (u.includes(":append")) rows.push(values);
    else rows[Number(range.match(/^A(\d+)/)![1]) - 1] = values;
    return Response.json({});
  }) as unknown as typeof fetch;
  return { rows, calls, f };
}

const runAll = async (store: Awaited<ReturnType<typeof setup>>["store"], cs: ConnectorStore, f?: typeof fetch) => {
  await store.db.query("UPDATE sync_queue SET next_at = now()"); // ignorer l'anti-rafale dans les tests
  return processSyncQueue({ db: store.db, connectors: cs, fetchImpl: f });
};

describe.skipIf(!TEST_DB)("Connecteurs et synchronisation Google Sheets (PostgreSQL réel)", () => {
  afterAll(closeAll);

  it("secrets chiffrés au repos ; aucun secret sans clé de chiffrement", async () => {
    const { store, cs } = await setup();
    await cs.save("n8n", { webhookUrl: "https://n8n.test/w", allowedWorkflows: ["sync_mission"] }, { signingSecret: "tres-secret" });
    const raw = (await store.db.query("SELECT secret_enc FROM connectors WHERE kind='n8n'")).rows[0].secret_enc;
    expect(raw).not.toContain("tres-secret");
    expect((await cs.secret<{ signingSecret: string }>("n8n"))!.signingSecret).toBe("tres-secret");
    await expect(new ConnectorStore(store.db, null).save("slack", {}, { webhookUrl: "x" })).rejects.toBeInstanceOf(EncryptionKeyMissingError);
  });

  it("jamais « connecté » sans test réussi ; toute modification impose un nouveau test", async () => {
    const { cs } = await setup();
    await cs.save("n8n", { webhookUrl: "https://n8n.test/w" }, { signingSecret: "s" });
    expect((await cs.get("n8n")).status).toBe("configured");
    expect((await cs.resolve()).n8n!.connected).toBe(false);
    await cs.setStatus("n8n", "connected");
    expect((await cs.resolve()).n8n!.connected).toBe(true);
    await cs.save("n8n", { webhookUrl: "https://n8n.test/autre" });
    expect((await cs.get("n8n")).status).toBe("configured");
  });

  it("mode DÉMONSTRATION par défaut : upsert local, une ligne par mission, sans doublon", async () => {
    const { store, cs } = await setup();
    const m = await store.createMission("Créer une offre de lancement", 3, "gaspard", null, "haute");
    await runAll(store, cs);
    await store.updateMission(m.id, { status: "running" });
    await runAll(store, cs);
    await store.updateMission(m.id, { status: "done", result: "Offre livrée." });
    await runAll(store, cs);
    await runAll(store, cs); // rejouer ne change rien
    const rows = (await store.db.query("SELECT row FROM sheet_demo_rows")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ "ID mission": m.id, Priorité: "haute", Statut: "Terminée", Progression: "100 %", Résultat: "Offre livrée." });
    expect(Object.keys(rows[0].row).sort()).toEqual([...SHEET_HEADERS].sort()); // JSONB ne garde pas l'ordre : l'interface l'impose
    const runs = await cs.runs();
    expect(runs.every((r) => r.status === "demo")).toBe(true);
  });

  it("mode n8n : refusé tant que n8n n'est pas connecté, puis appel signé et idempotent", async () => {
    const { store, cs } = await setup();
    await cs.save("sheets", { mode: "n8n" });
    await cs.save("n8n", { webhookUrl: "https://n8n.test/w", allowedWorkflows: ["sync_mission"] }, { signingSecret: "sec" });
    const m = await store.createMission("Mission synchronisée via n8n", 3, "gaspard");
    const sent: RequestInit[] = [];
    const f = (async (_u: string, init: RequestInit) => (sent.push(init), new Response("ok"))) as unknown as typeof fetch;
    await runAll(store, cs, f);
    expect(sent).toHaveLength(0);
    expect((await cs.runs())[0]).toMatchObject({ status: "error" });
    await cs.setStatus("n8n", "connected");
    await store.db.query("UPDATE sync_queue SET attempts=0");
    await runAll(store, cs, f);
    expect(sent).toHaveLength(1);
    const h = new Headers(sent[0].headers);
    expect(h.get("x-aihq-idempotency-key")).toMatch(new RegExp(`^${m.id}:v\\d+$`));
    expect(verifySignature("sec", h.get("x-aihq-timestamp")!, String(sent[0].body), h.get("x-aihq-signature")!)).toBe(true);
    expect(JSON.parse(String(sent[0].body)).data.row["ID mission"]).toBe(m.id);
  });

  it("mode direct Google Sheets : en-têtes créés, mise à jour de la ligne existante, jamais de doublon", async () => {
    clearTokenCache();
    const { store, cs } = await setup();
    await cs.save("google", { clientId: "x.apps.googleusercontent.com", grantedScopes: [SCOPES.compose, SCOPES.sheets] }, { clientSecret: "cs", refreshToken: "rt" });
    await cs.setStatus("google", "connected", { account: "moi@gmail.com" });
    await cs.save("sheets", { mode: "direct", spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", sheetName: "Missions" });
    const sheet = fakeSheets();
    const a = await store.createMission("Première mission synchronisée", 3, "gaspard");
    const b = await store.createMission("Deuxième mission synchronisée", 3, "gaspard");
    await runAll(store, cs, sheet.f);
    await store.updateMission(a.id, { status: "done", result: "OK" });
    await runAll(store, cs, sheet.f);
    await store.db.query("UPDATE sync_queue SET version = version + 1"); // resynchronisation complète
    await runAll(store, cs, sheet.f);
    expect(sheet.rows[0]).toEqual([...SHEET_HEADERS]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows.filter((r) => r[0] === a.id)).toHaveLength(1);
    expect(sheet.rows.find((r) => r[0] === a.id)![6]).toBe("Terminée");
    expect(sheet.rows.filter((r) => r[0] === b.id)).toHaveLength(1);
  });

  it("erreur de synchronisation : tracée dans l'historique et reprogrammée avec backoff", async () => {
    const { store, cs } = await setup();
    await cs.save("sheets", { mode: "direct", spreadsheetId: "" });
    await store.createMission("Mission sans tableur configuré", 3, "gaspard");
    await runAll(store, cs);
    const q = (await store.db.query("SELECT attempts, last_error, next_at > now() AS later FROM sync_queue")).rows[0];
    expect(q).toMatchObject({ attempts: 1, later: true });
    expect(q.last_error).toMatch(/Google n'est pas connecté/);
  });

  it("budget : avertissement unique à 80 % de la mission et de la journée", async () => {
    const { store } = await setup();
    const m = await store.createMission("Mission au budget surveillé", 1, "gaspard");
    const u = { missionId: m.id, taskId: null, agentId: "mary", purpose: "execute", model: "claude-sonnet-5-5", input: 1, output: 1, cacheRead: 0, cacheWrite: 0, webSearches: 0, requestId: null, dailyBudgetUsd: 1 };
    await store.recordUsage({ ...u, costUsd: 0.5 });
    await store.recordUsage({ ...u, costUsd: 0.35 });
    await store.recordUsage({ ...u, costUsd: 0.05 });
    const warnings = (await store.eventsSince(0, 500)).filter((e) => e.kind === "budget.warning").map((e) => e.payload.scope);
    expect(warnings.sort()).toEqual(["daily", "mission"]);
  });
});
