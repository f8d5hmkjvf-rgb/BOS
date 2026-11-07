import { describe, expect, it } from "vitest";
import { buildRawEmail, executeSafe, executeSensitive, integrationAvailable, validateIntegrationInput, type IntegrationContext } from "@/orchestrator/integrations";
import { agentById } from "@/orchestrator/agents";
import { verifySignature } from "@/orchestrator/crypto";
import { clearTokenCache, SCOPES, scopedQuery, scopesFor } from "@/orchestrator/google";

const ctx = (over: Partial<IntegrationContext["connectors"]> = {}): IntegrationContext => ({
  genericWebhookUrl: null,
  connectors: {
    n8n: { hosting: "cloud", webhookUrl: "https://n8n.test/webhook/aihq", allowedWorkflows: ["ajouter_prospect"], signingSecret: "s3cret", connected: true },
    google: {
      clientId: "x.apps.googleusercontent.com",
      clientSecret: "cs",
      refreshToken: "rt",
      gmailRead: true,
      readFilter: "label:ai-hq",
      gmailSend: true,
      grantedScopes: [SCOPES.compose, SCOPES.readonly],
      connected: true,
      account: "moi@gmail.com",
    },
    slack: { webhookUrl: "https://hooks.slack.com/services/T/B/x", connected: true },
    sheets: { mode: "demo", spreadsheetId: "", sheetName: "Missions" },
    ...over,
  },
});

/** Faux Google : routes par sous-chaîne d'URL, journalise les appels. */
function fakeGoogle(routes: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    const v = typeof hit[1] === "function" ? (hit[1] as (u: string) => unknown)(url) : hit[1];
    return new Response(JSON.stringify(v), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("Intégrations (Slack, n8n, Gmail)", () => {
  it("un connecteur non testé (non « connecté ») ne donne aucun outil aux agents", () => {
    const c = ctx({ n8n: { ...ctx().connectors.n8n!, connected: false }, slack: null, google: null });
    expect(integrationAvailable("trigger_n8n_workflow", c)).toBe(false);
    expect(integrationAvailable("send_slack_message", c)).toBe(false);
    expect(integrationAvailable("send_email", c)).toBe(false);
    expect(integrationAvailable("search_emails", c)).toBe(false);
  });

  it("lecture Gmail : seulement si activée ET autorisée par Google (portée readonly)", () => {
    const g = ctx().connectors.google!;
    expect(integrationAvailable("search_emails", ctx())).toBe(true);
    expect(integrationAvailable("search_emails", ctx({ google: { ...g, gmailRead: false } }))).toBe(false);
    expect(integrationAvailable("search_emails", ctx({ google: { ...g, grantedScopes: [SCOPES.compose] } }))).toBe(false);
    expect(scopesFor({ gmailRead: false }, false)).toEqual([SCOPES.compose]);
    expect(scopesFor({ gmailRead: true }, true)).toEqual([SCOPES.compose, SCOPES.readonly, SCOPES.sheets]);
  });

  it("liste blanche par rôle", () => {
    expect(agentById("paul")!.tools).toEqual(expect.arrayContaining(["send_email", "search_emails", "create_email_draft"]));
    expect(agentById("barbara")!.tools).not.toContain("send_email");
    expect(agentById("barbara")!.tools).toContain("trigger_n8n_workflow");
  });

  it("n8n : seuls les workflows autorisés, données JSON valides", () => {
    expect(validateIntegrationInput("trigger_n8n_workflow", { workflow: "supprimer_tout", data_json: "{}" }, ctx())).toMatch(/non autorisé/);
    expect(validateIntegrationInput("trigger_n8n_workflow", { workflow: "ajouter_prospect", data_json: "{oops" }, ctx())).toMatch(/JSON/);
    expect(validateIntegrationInput("trigger_n8n_workflow", { workflow: "ajouter_prospect", data_json: '{"a":1}' }, ctx())).toBeNull();
  });

  it("n8n : appel signé (HMAC + horodatage + clé d'idempotence) après validation", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    await executeSensitive("trigger_n8n_workflow", { workflow: "ajouter_prospect", data_json: '{"nom":"Dupont"}' }, ctx(), { missionId: "m1", approvalId: "a_1" }, f);
    const h = new Headers(calls[0].init.headers);
    expect(h.get("x-aihq-idempotency-key")).toBe("a_1");
    expect(verifySignature("s3cret", h.get("x-aihq-timestamp")!, String(calls[0].init.body), h.get("x-aihq-signature")!)).toBe(true);
    expect(verifySignature("autre", h.get("x-aihq-timestamp")!, String(calls[0].init.body), h.get("x-aihq-signature")!)).toBe(false);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ type: "workflow", workflow: "ajouter_prospect", data: { nom: "Dupont" } });
  });

  it("signature : rejet des requêtes rejouées (plus de 5 minutes)", () => {
    expect(verifySignature("s", "1000", "{}", "sha256=x", 1000 * 1000 + 6 * 60 * 1000)).toBe(false);
  });

  it("Gmail : la recherche est toujours restreinte au filtre autorisé", async () => {
    clearTokenCache();
    const g = fakeGoogle({
      "oauth2.googleapis.com/token": { access_token: "at", expires_in: 3600 },
      "messages?": { messages: [{ id: "m1" }] },
      "messages/m1?format=metadata": { id: "m1", snippet: "Bonjour", payload: { headers: [{ name: "Subject", value: "Devis" }, { name: "From", value: "a@client.fr" }] } },
    });
    const out = await executeSafe("search_emails", { query: "devis" }, ctx(), g.f);
    expect(out).toContain("Devis");
    const list = g.calls.find((c) => c.url.includes("messages?"))!;
    expect(new URL(list.url).searchParams.get("q")).toBe("(label:ai-hq) (devis)");
    expect(scopedQuery("", "x")).toBe("x");
  });

  it("Gmail : lecture refusée pour un message hors du filtre autorisé", async () => {
    clearTokenCache();
    const g = fakeGoogle({
      "oauth2.googleapis.com/token": { access_token: "at", expires_in: 3600 },
      "messages/secret?format=full": { id: "secret", payload: { headers: [{ name: "Message-ID", value: "<abc@x>" }], mimeType: "text/plain", body: { data: Buffer.from("privé").toString("base64url") } } },
      "messages?": { messages: [] },
    });
    await expect(executeSafe("read_email", { id: "secret" }, ctx(), g.f)).rejects.toThrow(/autorisés/);
  });

  it("Gmail : brouillon sans validation, envoi uniquement via l'action sensible", async () => {
    clearTokenCache();
    const g = fakeGoogle({ "oauth2.googleapis.com/token": { access_token: "at", expires_in: 3600 }, "/drafts": { id: "d1" }, "/messages/send": { id: "s1" } });
    expect(await executeSafe("create_email_draft", { to: ["jean@client.fr"], subject: "Proposition été", body: "Bonjour" }, ctx(), g.f)).toMatch(/Rien n'a été envoyé/);
    expect(g.calls.some((c) => c.url.includes("/messages/send"))).toBe(false);
    expect(await executeSensitive("send_email", { to: ["jean@client.fr"], subject: "Objet", body: "Corps" }, ctx(), { missionId: "m", approvalId: "a" }, g.f)).toMatch(/envoyé/);
    const raw = JSON.parse(String(g.calls.find((c) => c.url.includes("/messages/send"))!.init!.body)).raw;
    expect(Buffer.from(raw, "base64url").toString("utf8")).toContain("From: moi@gmail.com");
  });

  it("empêche l'injection d'en-têtes dans l'e-mail", () => {
    const mime = Buffer.from(buildRawEmail("a@b.fr", ["c@d.fr"], "Objet\r\nBcc: pirate@x.com", "corps"), "base64url").toString("utf8");
    expect(mime.split("\r\n").filter((l) => l.startsWith("Bcc:"))).toHaveLength(0);
  });
});

describe("OAuth Google", () => {
  it("échange du code et révocation : bons paramètres, aucun mot de passe", async () => {
    const { exchangeCode, revoke, authUrl } = await import("@/orchestrator/google");
    const calls: { url: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return url.includes("/token") ? Response.json({ access_token: "at", refresh_token: "rt", scope: SCOPES.compose, expires_in: 3600 }) : new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const t = await exchangeCode("cid", "csec", "code123", "http://localhost:3000/api/connectors/google/callback", f);
    expect(t.refresh_token).toBe("rt");
    const p = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(p)).toEqual({ client_id: "cid", client_secret: "csec", code: "code123", redirect_uri: "http://localhost:3000/api/connectors/google/callback", grant_type: "authorization_code" });
    await revoke("rt", f);
    expect(calls[1].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(calls[1].body).get("token")).toBe("rt");
    const u = new URL(authUrl("cid", "http://localhost:3000/cb", "st", [SCOPES.compose]));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.toString()).not.toMatch(/password/i);
  });
});
