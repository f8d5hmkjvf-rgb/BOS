import { agentById, agentSpecs, type AgentSpec } from "./agents";
import { textOf, type BetaToolUnion } from "./llm";
import type { LoopDeps, ToolHandler } from "./loop";
import type { Task } from "./store";

const str = (description: string) => ({ type: "string" as const, description });

export function consultTool(self: AgentSpec): BetaToolUnion {
  return {
    name: "consult_colleague",
    description:
      "Pose une question précise à un collègue spécialiste d'AI HQ et reçois sa réponse. À utiliser quand une partie de la tâche relève de son expertise. Chaque consultation coûte un appel API : regroupe tes questions.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        colleague: { type: "string", enum: agentSpecs().filter((a) => a.id !== self.id).map((a) => a.id), description: "Identifiant du collègue" },
        question: str("Question complète et autonome, avec le contexte nécessaire"),
      },
      required: ["colleague", "question"],
      additionalProperties: false,
    },
  };
}

export const SUBMIT_DELIVERABLE: BetaToolUnion = {
  name: "submit_deliverable",
  description: "Remet le livrable final de la tâche à Gaspard. Le contenu doit être complet et directement utilisable (Markdown autorisé).",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      summary: str("Résumé en 1 à 3 phrases de ce qui a été produit"),
      content: str("Livrable complet"),
      open_questions: { type: "array", items: { type: "string" }, description: "Points non résolus ou informations manquantes (peut être vide)" },
    },
    required: ["summary", "content", "open_questions"],
    additionalProperties: false,
  },
};

export const SEND_WEBHOOK: BetaToolUnion = {
  name: "send_webhook",
  description:
    "Envoie un message vers l'intégration externe configurée par l'entrepreneur (Slack, Make, Zapier, n8n…). ACTION SENSIBLE : elle n'est exécutée qu'après validation humaine explicite. Utilise-la uniquement si la tâche le demande.",
  strict: true,
  input_schema: {
    type: "object",
    properties: { title: str("Titre court"), message: str("Contenu exact à envoyer") },
    required: ["title", "message"],
    additionalProperties: false,
  },
};

export const WEB_SEARCH: BetaToolUnion = { type: "web_search_20260209", name: "web_search", max_uses: 5 };

/** Outils effectivement autorisés pour un agent (liste blanche × configuration). */
export function executionTools(agent: AgentSpec, task: Task, d: LoopDeps): { tools: BetaToolUnion[]; handlers: Record<string, ToolHandler> } {
  const tools: BetaToolUnion[] = [];
  const handlers: Record<string, ToolHandler> = {};
  if (agent.tools.includes("web_search") && d.cfg.webSearchEnabled) tools.push(WEB_SEARCH);
  if (agent.tools.includes("consult_colleague")) {
    tools.push(consultTool(agent));
    handlers.consult_colleague = (input) => consult(d, task, agent, String(input.colleague), String(input.question));
  }
  if (agent.tools.includes("send_webhook") && d.cfg.webhookUrl) {
    tools.push(SEND_WEBHOOK);
    handlers.send_webhook = (input, toolUseId, siblings) => sensitiveAction(d, task, agent, toolUseId, "send_webhook", `${agent.name} veut envoyer « ${String(input.title)} » vers l'intégration externe`, { ...input, siblings });
  }
  tools.push(SUBMIT_DELIVERABLE);
  handlers.submit_deliverable = async (input) => ({ kind: "done", value: input, content: "Livrable reçu par Gaspard." });
  return { tools, handlers };
}

/** Consultation réelle d'un collègue : un appel API avec SA personnalité, conversation tracée et animée dans le QG. */
export async function consult(d: LoopDeps, task: Task, from: AgentSpec, colleagueId: string, question: string) {
  const to = agentById(colleagueId);
  if (!to || to.id === from.id) return { kind: "result" as const, content: `Collègue inconnu : ${colleagueId}`, isError: true };
  const convId = await d.store.openConversation({ missionId: task.mission_id, taskId: task.id, kind: "consult", title: `${from.name} consulte ${to.name}`, participants: [from.id, to.id] });
  try {
    await d.store.addLine(convId, "consult", from.id, question);
    const res = await d.llm.call(
      {
        model: d.cfg.models.dialogue,
        effort: d.cfg.effort.dialogue,
        maxTokens: 8000,
        system: to.systemPrompt,
        messages: [
          {
            role: "user",
            content: `Ton collègue ${from.name} (${from.role}) te consulte pendant la tâche « ${task.title} ».\n\nQuestion : ${question}\n\nRéponds-lui directement, en 200 mots maximum, avec ton expertise de ${to.role}. Si tu ne sais pas, dis-le.`,
          },
        ],
      },
      { missionId: task.mission_id, taskId: task.id, agentId: to.id, purpose: "consult" },
    );
    const answer = textOf(res) || "(pas de réponse)";
    await d.store.addLine(convId, "consult", to.id, answer);
    await d.store.closeConversation(convId, "consult", "closed", null);
    return { kind: "result" as const, content: `Réponse de ${to.name} : ${answer}` };
  } catch (e) {
    await d.store.closeConversation(convId, "consult", "failed", null);
    throw e;
  }
}

/** Action sensible : création d'une demande de validation, ou lecture de la décision lors de la reprise. */
async function sensitiveAction(d: LoopDeps, task: Task, agent: AgentSpec, toolUseId: string, action: string, summary: string, payload: Record<string, unknown>) {
  const existing = (await d.store.approvalsForTask(task.id)).find((a) => a.tool_use_id === toolUseId);
  if (existing) {
    if (existing.status === "pending" || existing.status === "approved") return { kind: "awaiting" as const, approvalId: existing.id };
    if (existing.status === "rejected") return { kind: "result" as const, content: "Action refusée par l'humain. Ne la retente pas ; adapte ton livrable.", isError: true };
    if (existing.status === "failed") return { kind: "result" as const, content: `L'action validée a échoué : ${existing.result}`, isError: true };
    return { kind: "result" as const, content: `Action exécutée après validation humaine : ${existing.result}` };
  }
  const approvalId = await d.store.createApproval({ missionId: task.mission_id, taskId: task.id, agentId: agent.id, toolUseId, action, summary, payload });
  return { kind: "awaiting" as const, approvalId };
}
