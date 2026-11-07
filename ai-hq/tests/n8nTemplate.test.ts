import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { callN8n } from "@/orchestrator/n8n";

const wf = JSON.parse(readFileSync("deploy/n8n/ai-hq-google-sheets.json", "utf8"));
const verifyCode: string = wf.nodes.find((n: { name: string }) => n.name === "Vérifier la signature").parameters.jsCode;
const req = createRequire(import.meta.url);

/** Exécute le nœud Code du modèle n8n comme n8n le ferait (même entrée qu'un nœud Webhook). */
function runVerify(secret: string, headers: Record<string, string>, body: unknown) {
  const code = verifyCode.replace("COLLER_ICI_LE_SECRET_AI_HQ", secret);
  const $input = { first: () => ({ json: { headers, body } }) };
  return new Function("require", "$input", code)(req, $input);
}

async function captured(secret: string) {
  let headers: Record<string, string> = {};
  let body = "";
  const f = (async (_u: string, init: RequestInit) => {
    headers = Object.fromEntries(new Headers(init.headers).entries());
    body = String(init.body);
    return new Response("{}");
  }) as unknown as typeof fetch;
  await callN8n("https://n8n.test/webhook/ai-hq", secret, { type: "sync_mission", data: { key: "m_1", row: { "ID mission": "m_1", Résultat: "Offre « été » livrée ✓" } } }, f);
  return { headers, body: JSON.parse(body) };
}

describe("Modèle de workflow n8n fourni", () => {
  it("accepte un appel signé par AI HQ (y compris accents et symboles) et transmet la ligne", async () => {
    const c = await captured("s3cret");
    const out = runVerify("s3cret", c.headers, c.body);
    expect(out[0].json.type).toBe("sync_mission");
    expect(out[0].json.data.row["ID mission"]).toBe("m_1");
  });

  it("refuse un mauvais secret et un appel modifié", async () => {
    const c = await captured("s3cret");
    expect(() => runVerify("autre", c.headers, c.body)).toThrow(/Signature/);
    expect(() => runVerify("s3cret", c.headers, { ...c.body, data: { key: "pirate" } })).toThrow(/Signature/);
    expect(() => runVerify("s3cret", { ...c.headers, "x-aihq-timestamp": "1000" }, c.body)).toThrow(/rejeu/);
  });

  it("met à jour Google Sheets par la colonne « ID mission » (pas de doublon)", () => {
    const sheets = wf.nodes.find((n: { type: string }) => n.type === "n8n-nodes-base.googleSheets");
    expect(sheets.parameters.operation).toBe("appendOrUpdate");
    expect(sheets.parameters.columns.matchingColumns).toEqual(["ID mission"]);
  });
});
