import { describe, expect, it } from "vitest";
import { loadIntegrations } from "@/orchestrator/config";
import { buildRawEmail, executeIntegration, integrationAvailable, validateIntegrationInput } from "@/orchestrator/integrations";
import { agentById } from "@/orchestrator/agents";

const env = {
  AIHQ_SLACK_WEBHOOK_URL: "https://hooks.slack.test/T/B/x",
  AIHQ_N8N_WEBHOOK_URL: "https://n8n.test/webhook/aihq",
  AIHQ_N8N_SECRET: "s3cret",
  GMAIL_CLIENT_ID: "cid",
  GMAIL_CLIENT_SECRET: "csec",
  GMAIL_REFRESH_TOKEN: "rt",
  GMAIL_SENDER: "moi@exemple.fr",
  GMAIL_ALLOWED_DOMAINS: "client.fr",
} as unknown as NodeJS.ProcessEnv;

function recorder(responses: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = Object.entries(responses).find(([k]) => url.includes(k))?.[1] ?? {};
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("Intégrations externes (Slack, n8n, Gmail)", () => {
  const c = loadIntegrations(env);

  it("disponibles seulement si configurées", () => {
    const none = loadIntegrations({} as NodeJS.ProcessEnv);
    for (const t of ["send_slack_message", "trigger_n8n_workflow", "send_email", "send_webhook"] as const) expect(integrationAvailable(t, none)).toBe(false);
    expect(integrationAvailable("send_email", c)).toBe(true);
    expect(c.gmail!.mode).toBe("draft"); // brouillon par défaut
  });

  it("liste blanche par rôle : le commercial peut écrire des e-mails, l'ingénieure QA non", () => {
    expect(agentById("paul")!.tools).toContain("send_email");
    expect(agentById("barbara")!.tools).not.toContain("send_email");
    expect(agentById("barbara")!.tools).toContain("trigger_n8n_workflow");
  });

  it("valide les demandes avant de solliciter l'humain", () => {
    expect(validateIntegrationInput("send_email", { to: ["pas-une-adresse"], subject: "x", body: "y" }, c)).toMatch(/invalide/);
    expect(validateIntegrationInput("send_email", { to: ["a@autre.com"], subject: "x", body: "y" }, c)).toMatch(/non autorisé/);
    expect(validateIntegrationInput("send_email", { to: ["a@client.fr"], subject: "x", body: "y" }, c)).toBeNull();
    expect(validateIntegrationInput("trigger_n8n_workflow", { workflow: "w", data_json: "{oops" }, c)).toMatch(/JSON/);
  });

  it("Slack : webhook entrant", async () => {
    const r = recorder();
    expect(await executeIntegration("send_slack_message", { text: "Lancement 🚀" }, c, { missionId: "m1" }, r.f)).toMatch(/Slack/);
    expect(r.calls[0].url).toBe(env.AIHQ_SLACK_WEBHOOK_URL);
    expect(JSON.parse(String(r.calls[0].init.body))).toEqual({ text: "Lancement 🚀" });
  });

  it("n8n : données JSON et secret partagé", async () => {
    const r = recorder();
    await executeIntegration("trigger_n8n_workflow", { workflow: "ajouter_prospect", data_json: '{"nom":"Dupont"}' }, c, { missionId: "m1" }, r.f);
    expect(new Headers(r.calls[0].init.headers).get("x-aihq-secret")).toBe("s3cret");
    expect(JSON.parse(String(r.calls[0].init.body))).toEqual({ source: "ai-hq", missionId: "m1", workflow: "ajouter_prospect", data: { nom: "Dupont" } });
  });

  it("Gmail : rafraîchit le jeton puis crée un BROUILLON (pas d'envoi par défaut)", async () => {
    const r = recorder({ "oauth2.googleapis.com": { access_token: "at" }, drafts: { id: "d1" } });
    const out = await executeIntegration("send_email", { to: ["jean@client.fr"], subject: "Proposition été", body: "Bonjour Jean,\nVoici…" }, c, { missionId: "m1" }, r.f);
    expect(out).toMatch(/Brouillon créé/);
    expect(r.calls.map((x) => x.url)).toEqual(["https://oauth2.googleapis.com/token", "https://gmail.googleapis.com/gmail/v1/users/me/drafts"]);
    expect(new Headers(r.calls[1].init.headers).get("authorization")).toBe("Bearer at");
    const raw = JSON.parse(String(r.calls[1].init.body)).message.raw as string;
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toContain("To: jean@client.fr");
    expect(mime).toContain("Subject: =?UTF-8?B?"); // accent encodé
    expect(Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString("utf8")).toContain("Bonjour Jean");
  });

  it("Gmail : refuse un domaine non autorisé même après validation", async () => {
    const r = recorder({ "oauth2.googleapis.com": { access_token: "at" } });
    await expect(executeIntegration("send_email", { to: ["x@autre.com"], subject: "s", body: "b" }, c, { missionId: "m" }, r.f)).rejects.toThrow(/non autorisé/);
    expect(r.calls).toHaveLength(0);
  });

  it("empêche l'injection d'en-têtes dans l'e-mail", () => {
    const mime = Buffer.from(buildRawEmail("a@b.fr", ["c@d.fr"], "Objet\r\nBcc: pirate@x.com", "corps"), "base64url").toString("utf8");
    expect(mime.split("\r\n").filter((l) => l.startsWith("Bcc:"))).toHaveLength(0);
  });
});
