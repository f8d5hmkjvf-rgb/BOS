import type { IntegrationsConfig } from "./config";
import type { BetaToolUnion } from "./llm";

/**
 * Intégrations externes. Les agents ne peuvent que DEMANDER ces actions : chaque appel crée une
 * validation humaine, et l'exécution n'a lieu qu'après « Autoriser » (voir actions.ts).
 */
export type IntegrationTool = "send_slack_message" | "trigger_n8n_workflow" | "send_email" | "send_webhook";

const S = (description: string, maxLength?: number) => ({ type: "string" as const, description, ...(maxLength ? {} : {}) });

export const INTEGRATION_TOOLS: Record<IntegrationTool, BetaToolUnion> = {
  send_slack_message: {
    name: "send_slack_message",
    description: "Publie un message dans le canal Slack de l'entreprise. ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: { type: "object", properties: { text: S("Message exact à publier (Markdown Slack)") }, required: ["text"], additionalProperties: false },
  },
  trigger_n8n_workflow: {
    name: "trigger_n8n_workflow",
    description:
      "Déclenche un workflow n8n de l'entrepreneur (automatisation : CRM, tableur, publication…). ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        workflow: S("Nom de l'action attendue par le workflow, ex. 'ajouter_prospect'"),
        data_json: S("Données à transmettre, sous forme d'objet JSON sérialisé"),
      },
      required: ["workflow", "data_json"],
      additionalProperties: false,
    },
  },
  send_email: {
    name: "send_email",
    description:
      "Prépare un e-mail depuis la boîte Gmail de l'entrepreneur (brouillon par défaut, ou envoi si configuré). ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" }, description: "Adresses des destinataires" },
        subject: S("Objet"),
        body: S("Corps du message en texte brut"),
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  send_webhook: {
    name: "send_webhook",
    description: "Envoie un message vers le webhook générique configuré (Make, Zapier…). ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: { type: "object", properties: { title: S("Titre court"), message: S("Contenu exact à envoyer") }, required: ["title", "message"], additionalProperties: false },
  },
};

export function integrationAvailable(t: IntegrationTool, c: IntegrationsConfig): boolean {
  switch (t) {
    case "send_slack_message":
      return !!c.slack;
    case "trigger_n8n_workflow":
      return !!c.n8n;
    case "send_email":
      return !!c.gmail;
    case "send_webhook":
      return !!c.webhookUrl;
  }
}

export function integrationsStatus(c: IntegrationsConfig) {
  return {
    slack: !!c.slack,
    n8n: !!c.n8n,
    gmail: c.gmail ? (c.gmail.mode === "send" ? "envoi" : "brouillons") : false,
    webhook: !!c.webhookUrl,
  };
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Validation avant même de demander l'accord humain : l'agent reçoit l'erreur et corrige. */
export function validateIntegrationInput(t: IntegrationTool, input: Record<string, unknown>, c: IntegrationsConfig): string | null {
  const str = (k: string, max: number) => (typeof input[k] === "string" && (input[k] as string).trim() && (input[k] as string).length <= max ? null : `Champ « ${k} » manquant ou trop long (max ${max}).`);
  switch (t) {
    case "send_slack_message":
      return str("text", 4000);
    case "send_webhook":
      return str("title", 200) ?? str("message", 8000);
    case "trigger_n8n_workflow": {
      const e = str("workflow", 100) ?? str("data_json", 20000);
      if (e) return e;
      try {
        const v = JSON.parse(String(input.data_json));
        if (!v || typeof v !== "object") return "data_json doit être un objet JSON.";
      } catch {
        return "data_json n'est pas un JSON valide.";
      }
      return null;
    }
    case "send_email": {
      const e = str("subject", 250) ?? str("body", 50000);
      if (e) return e;
      const to = input.to;
      if (!Array.isArray(to) || to.length === 0 || to.length > 20) return "Indique 1 à 20 destinataires.";
      for (const a of to) {
        if (typeof a !== "string" || !EMAIL.test(a)) return `Adresse invalide : ${String(a)}`;
        const dom = a.split("@")[1].toLowerCase();
        if (c.gmail?.allowedDomains.length && !c.gmail.allowedDomains.includes(dom)) return `Domaine non autorisé : ${dom} (autorisés : ${c.gmail.allowedDomains.join(", ")}).`;
      }
      return null;
    }
  }
}

export function integrationSummary(agentName: string, t: IntegrationTool, input: Record<string, unknown>, c: IntegrationsConfig): string {
  switch (t) {
    case "send_slack_message":
      return `${agentName} veut publier un message sur Slack`;
    case "trigger_n8n_workflow":
      return `${agentName} veut déclencher le workflow n8n « ${String(input.workflow)} »`;
    case "send_email":
      return `${agentName} veut ${c.gmail?.mode === "send" ? "ENVOYER" : "créer un brouillon d'"} e-mail à ${(input.to as string[]).join(", ")} — « ${String(input.subject)} »`;
    case "send_webhook":
      return `${agentName} veut envoyer « ${String(input.title)} » vers le webhook`;
  }
}

// ------------------------------------------------------------------ Exécution (après validation)

type Fetch = typeof fetch;

async function post(fetchImpl: Fetch, url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const r = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Le service a répondu HTTP ${r.status}.`);
  return r;
}

/** En-tête RFC 2047 pour les caractères non ASCII (accents dans l'objet). */
function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

export function buildRawEmail(from: string, to: string[], subject: string, body: string): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ");
  const msg = [
    `From: ${clean(from)}`,
    `To: ${to.map(clean).join(", ")}`,
    `Subject: ${encodeHeader(clean(subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n");
  return Buffer.from(msg, "utf8").toString("base64url");
}

async function gmailAccessToken(g: NonNullable<IntegrationsConfig["gmail"]>, fetchImpl: Fetch): Promise<string> {
  const r = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: "refresh_token" }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Authentification Gmail refusée (HTTP ${r.status}) : vérifiez GMAIL_REFRESH_TOKEN.`);
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Jeton Gmail absent de la réponse.");
  return j.access_token;
}

export async function executeIntegration(action: string, payload: Record<string, unknown>, c: IntegrationsConfig, ctx: { missionId: string }, fetchImpl: Fetch = fetch): Promise<string> {
  switch (action as IntegrationTool) {
    case "send_slack_message": {
      if (!c.slack) throw new Error("Slack n'est pas configuré (AIHQ_SLACK_WEBHOOK_URL).");
      await post(fetchImpl, c.slack.webhookUrl, { text: String(payload.text) });
      return "Message publié sur Slack.";
    }
    case "trigger_n8n_workflow": {
      if (!c.n8n) throw new Error("n8n n'est pas configuré (AIHQ_N8N_WEBHOOK_URL).");
      const r = await post(
        fetchImpl,
        c.n8n.webhookUrl,
        { source: "ai-hq", missionId: ctx.missionId, workflow: payload.workflow, data: JSON.parse(String(payload.data_json)) },
        c.n8n.secret ? { "x-aihq-secret": c.n8n.secret } : {},
      );
      const text = (await r.text()).slice(0, 1000);
      return `Workflow n8n déclenché (HTTP ${r.status})${text ? ` — réponse : ${text}` : ""}.`;
    }
    case "send_email": {
      const g = c.gmail;
      if (!g) throw new Error("Gmail n'est pas configuré (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER).");
      const err = validateIntegrationInput("send_email", payload, c);
      if (err) throw new Error(err);
      const raw = buildRawEmail(g.sender, payload.to as string[], String(payload.subject), String(payload.body));
      const token = await gmailAccessToken(g, fetchImpl);
      const url = g.mode === "send" ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" : "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
      const r = await post(fetchImpl, url, g.mode === "send" ? { raw } : { message: { raw } }, { authorization: `Bearer ${token}` });
      const j = (await r.json().catch(() => ({}))) as { id?: string };
      return g.mode === "send" ? `E-mail envoyé (id ${j.id ?? "?"}).` : `Brouillon créé dans Gmail (id ${j.id ?? "?"}) : à relire et envoyer depuis Gmail.`;
    }
    case "send_webhook": {
      if (!c.webhookUrl) throw new Error("AIHQ_WEBHOOK_URL n'est pas configuré.");
      const r = await post(fetchImpl, c.webhookUrl, { source: "ai-hq", title: payload.title, text: `*${payload.title}*\n${payload.message}`, message: payload.message });
      return `Envoyé (HTTP ${r.status}).`;
    }
    default:
      throw new Error(`Action inconnue : ${action}`);
  }
}
