import type { ResolvedConnectors } from "./connectors";
import { accessToken, createDraft, readEmail, searchEmails, sendRaw } from "./google";
import type { BetaToolUnion } from "./llm";
import { callN8n } from "./n8n";

/**
 * Outils d'intégration des agents.
 * - Actions SENSIBLES (sortent de l'entreprise) : validation humaine obligatoire avant exécution.
 * - Actions internes au compte de l'entrepreneur (lecture filtrée, brouillon) : sans envoi, sans validation.
 * Un outil n'est proposé que si le connecteur est CONNECTÉ (testé avec succès) et le rôle autorisé.
 */
export type SensitiveTool = "send_slack_message" | "trigger_n8n_workflow" | "send_email" | "send_webhook";
export type SafeTool = "search_emails" | "read_email" | "create_email_draft";
export type IntegrationTool = SensitiveTool | SafeTool;

export const SENSITIVE: ReadonlySet<IntegrationTool> = new Set(["send_slack_message", "trigger_n8n_workflow", "send_email", "send_webhook"]);

const S = (description: string) => ({ type: "string" as const, description });
const EMAIL_FIELDS = {
  to: { type: "array" as const, items: { type: "string" as const }, description: "Adresses des destinataires" },
  subject: S("Objet"),
  body: S("Corps du message en texte brut"),
};

export const INTEGRATION_TOOLS: Record<IntegrationTool, BetaToolUnion> = {
  send_slack_message: {
    name: "send_slack_message",
    description: "Publie un message dans le canal Slack de l'entreprise. ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: { type: "object", properties: { text: S("Message exact à publier") }, required: ["text"], additionalProperties: false },
  },
  trigger_n8n_workflow: {
    name: "trigger_n8n_workflow",
    description: "Déclenche un workflow n8n autorisé par l'entrepreneur (CRM, tableur, publication…). ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { workflow: S("Nom du workflow (doit figurer dans la liste autorisée)"), data_json: S("Données à transmettre : objet JSON sérialisé") },
      required: ["workflow", "data_json"],
      additionalProperties: false,
    },
  },
  send_email: {
    name: "send_email",
    description: "Envoie un e-mail depuis le Gmail de l'entrepreneur. ACTION SENSIBLE : envoyé uniquement après son approbation explicite du contenu exact.",
    strict: true,
    input_schema: { type: "object", properties: EMAIL_FIELDS, required: ["to", "subject", "body"], additionalProperties: false },
  },
  send_webhook: {
    name: "send_webhook",
    description: "Envoie un message vers le webhook générique configuré (Make, Zapier…). ACTION SENSIBLE : exécutée uniquement après validation humaine.",
    strict: true,
    input_schema: { type: "object", properties: { title: S("Titre court"), message: S("Contenu exact") }, required: ["title", "message"], additionalProperties: false },
  },
  create_email_draft: {
    name: "create_email_draft",
    description: "Crée un BROUILLON dans le Gmail de l'entrepreneur (rien n'est envoyé ; il le relira).",
    strict: true,
    input_schema: { type: "object", properties: EMAIL_FIELDS, required: ["to", "subject", "body"], additionalProperties: false },
  },
  search_emails: {
    name: "search_emails",
    description: "Recherche parmi les e-mails que l'entrepreneur a autorisés (syntaxe de recherche Gmail). Retourne au plus 10 résultats (expéditeur, objet, date, extrait).",
    strict: true,
    input_schema: { type: "object", properties: { query: S("Requête Gmail, ex. 'from:client.fr newer_than:30d devis'") }, required: ["query"], additionalProperties: false },
  },
  read_email: {
    name: "read_email",
    description: "Lit le contenu d'un e-mail autorisé à partir de son identifiant (obtenu via search_emails).",
    strict: true,
    input_schema: { type: "object", properties: { id: S("Identifiant du message") }, required: ["id"], additionalProperties: false },
  },
};

export interface IntegrationContext {
  connectors: ResolvedConnectors;
  genericWebhookUrl: string | null;
}

export function integrationAvailable(t: IntegrationTool, c: IntegrationContext): boolean {
  const g = c.connectors.google;
  switch (t) {
    case "send_slack_message":
      return !!c.connectors.slack?.connected;
    case "trigger_n8n_workflow":
      return !!c.connectors.n8n?.connected && c.connectors.n8n.allowedWorkflows.length > 0;
    case "send_email":
      return !!g?.connected && g.gmailSend;
    case "create_email_draft":
      return !!g?.connected;
    case "search_emails":
    case "read_email":
      return !!g?.connected && g.gmailRead && g.grantedScopes.includes("https://www.googleapis.com/auth/gmail.readonly");
    case "send_webhook":
      return !!c.genericWebhookUrl;
  }
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Validation avant de solliciter l'humain (ou d'agir) : l'agent reçoit l'erreur et corrige. */
export function validateIntegrationInput(t: IntegrationTool, input: Record<string, unknown>, c: IntegrationContext): string | null {
  const str = (k: string, max: number) => (typeof input[k] === "string" && (input[k] as string).trim() && (input[k] as string).length <= max ? null : `Champ « ${k} » manquant ou trop long (max ${max}).`);
  switch (t) {
    case "send_slack_message":
      return str("text", 4000);
    case "send_webhook":
      return str("title", 200) ?? str("message", 8000);
    case "search_emails":
      return str("query", 500);
    case "read_email":
      return str("id", 100);
    case "trigger_n8n_workflow": {
      const e = str("workflow", 100) ?? str("data_json", 20000);
      if (e) return e;
      const allowed = c.connectors.n8n?.allowedWorkflows ?? [];
      if (!allowed.includes(String(input.workflow))) return `Workflow non autorisé : « ${String(input.workflow)} ». Autorisés : ${allowed.join(", ") || "aucun"}.`;
      try {
        const v = JSON.parse(String(input.data_json));
        if (!v || typeof v !== "object") return "data_json doit être un objet JSON.";
      } catch {
        return "data_json n'est pas un JSON valide.";
      }
      return null;
    }
    case "send_email":
    case "create_email_draft": {
      const e = str("subject", 250) ?? str("body", 50000);
      if (e) return e;
      const to = input.to;
      if (!Array.isArray(to) || to.length === 0 || to.length > 20) return "Indique 1 à 20 destinataires.";
      for (const a of to) if (typeof a !== "string" || !EMAIL.test(a)) return `Adresse invalide : ${String(a)}`;
      return null;
    }
  }
}

export function integrationSummary(agentName: string, t: IntegrationTool, input: Record<string, unknown>): string {
  switch (t) {
    case "send_slack_message":
      return `${agentName} veut publier un message sur Slack`;
    case "trigger_n8n_workflow":
      return `${agentName} veut déclencher le workflow n8n « ${String(input.workflow)} »`;
    case "send_email":
      return `${agentName} veut ENVOYER un e-mail à ${(input.to as string[]).join(", ")} — « ${String(input.subject)} »`;
    case "send_webhook":
      return `${agentName} veut envoyer « ${String(input.title)} » vers le webhook`;
    default:
      return `${agentName} : ${t}`;
  }
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

type Fetch = typeof fetch;

async function post(f: Fetch, url: string, body: unknown): Promise<Response> {
  const r = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error(`Le service a répondu HTTP ${r.status}.`), { httpStatus: r.status });
  return r;
}

function google(c: IntegrationContext) {
  const g = c.connectors.google;
  if (!g?.connected) throw new Error("Google n'est pas connecté (Paramètres → Google).");
  return g;
}

/** Actions internes (sans envoi) exécutées directement : lecture filtrée et brouillons. */
export async function executeSafe(t: SafeTool, input: Record<string, unknown>, c: IntegrationContext, f: Fetch = fetch): Promise<string> {
  const g = google(c);
  const token = await accessToken(g, f);
  switch (t) {
    case "search_emails": {
      const res = await searchEmails(token, g.readFilter, String(input.query), 10, f);
      if (!res.length) return `Aucun e-mail autorisé ne correspond (filtre : ${g.readFilter || "aucun"}).`;
      return res.map((m) => `- id ${m.id} | ${m.date} | ${m.from} | « ${m.subject} » — ${m.snippet}`).join("\n");
    }
    case "read_email": {
      const m = await readEmail(token, g.readFilter, String(input.id), f);
      return `De : ${m.from}\nÀ : ${m.to}\nDate : ${m.date}\nObjet : ${m.subject}\n\n${m.body}`;
    }
    case "create_email_draft": {
      const id = await createDraft(token, buildRawEmail(g.account ?? "me", input.to as string[], String(input.subject), String(input.body)), f);
      return `Brouillon créé dans Gmail (id ${id}). Rien n'a été envoyé.`;
    }
  }
}

/** Actions sensibles : appelées UNIQUEMENT après la décision humaine (voir actions.ts). */
export async function executeSensitive(action: string, payload: Record<string, unknown>, c: IntegrationContext, ctx: { missionId: string; approvalId: string }, f: Fetch = fetch): Promise<string> {
  switch (action as SensitiveTool) {
    case "send_slack_message": {
      if (!c.connectors.slack?.connected) throw new Error("Slack n'est pas connecté.");
      await post(f, c.connectors.slack.webhookUrl, { text: String(payload.text) });
      return "Message publié sur Slack.";
    }
    case "trigger_n8n_workflow": {
      const n = c.connectors.n8n;
      if (!n?.connected) throw new Error("n8n n'est pas connecté.");
      if (!n.allowedWorkflows.includes(String(payload.workflow))) throw new Error(`Workflow non autorisé : ${String(payload.workflow)}`);
      const r = await callN8n(n.webhookUrl, n.signingSecret, { type: "workflow", workflow: String(payload.workflow), data: JSON.parse(String(payload.data_json)), idempotencyKey: ctx.approvalId }, f);
      return `Workflow n8n « ${String(payload.workflow)} » déclenché (HTTP ${r.status})${r.body ? ` — réponse : ${r.body.slice(0, 300)}` : ""}.`;
    }
    case "send_email": {
      const g = google(c);
      if (!g.gmailSend) throw new Error("L'envoi d'e-mails est désactivé dans les Paramètres.");
      const err = validateIntegrationInput("send_email", payload, c);
      if (err) throw new Error(err);
      const token = await accessToken(g, f);
      const id = await sendRaw(token, buildRawEmail(g.account ?? "me", payload.to as string[], String(payload.subject), String(payload.body)), f);
      return `E-mail envoyé (id ${id}).`;
    }
    case "send_webhook": {
      if (!c.genericWebhookUrl) throw new Error("AIHQ_WEBHOOK_URL n'est pas configuré.");
      const r = await post(f, c.genericWebhookUrl, { source: "ai-hq", title: payload.title, text: `*${payload.title}*\n${payload.message}`, message: payload.message });
      return `Envoyé (HTTP ${r.status}).`;
    }
    default:
      throw new Error(`Action inconnue : ${action}`);
  }
}
