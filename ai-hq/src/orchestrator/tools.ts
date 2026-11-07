import { agentById, agentSpecs, type AgentSpec } from "./agents";
import { textOf, type BetaToolUnion } from "./llm";
import { executeSafe, INTEGRATION_TOOLS, integrationAvailable, integrationSummary, SENSITIVE, validateIntegrationInput, type IntegrationContext, type IntegrationTool, type SafeTool } from "./integrations";
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


export const WEB_SEARCH: BetaToolUnion = { type: "web_search_20260209", name: "web_search", max_uses: 5 };

/** Outils effectivement autorisés pour un agent (liste blanche × configuration). */
export async function integrationContext(d: LoopDeps): Promise<IntegrationContext> {
  const connectors = d.connectors ? await d.connectors.resolve() : { n8n: null, google: null, slack: null, sheets: { mode: "off" as const, spreadsheetId: "", sheetName: "" } };
  return { connectors, genericWebhookUrl: d.cfg.genericWebhookUrl };
}

export async function executionTools(agent: AgentSpec, task: Task, d: LoopDeps): Promise<{ tools: BetaToolUnion[]; handlers: Record<string, ToolHandler> }> {
  const tools: BetaToolUnion[] = [];
  const handlers: Record<string, ToolHandler> = {};
  if (agent.tools.includes("web_search") && d.cfg.webSearchEnabled) tools.push(WEB_SEARCH);
  if (agent.tools.includes("consult_colleague")) {
    tools.push(consultTool(agent));
    handlers.consult_colleague = (input) => consult(d, task, agent, String(input.colleague), String(input.question));
  }
  // Intégrations : autorisées pour ce rôle ET connectées (testées) par l'entrepreneur.
  const integ = await integrationContext(d);
  for (const name of Object.keys(INTEGRATION_TOOLS) as IntegrationTool[]) {
    if (!agent.tools.includes(name) || !integrationAvailable(name, integ)) continue;
    tools.push(INTEGRATION_TOOLS[name]);
    handlers[name] = async (input, toolUseId, siblings) => {
      const existing = (await d.store.approvalsForTask(task.id)).some((a) => a.tool_use_id === toolUseId);
      if (!existing) {
        const err = validateIntegrationInput(name, input, integ);
        if (err) return { kind: "result", content: `Demande invalide, corrige : ${err}`, isError: true };
      }
      if (!SENSITIVE.has(name)) {
        // Lecture filtrée et brouillons : rien ne sort du compte, exécution directe et tracée.
        const t0 = Date.now();
        try {
          const out = await executeSafe(name as SafeTool, input, integ, d.fetchImpl);
          await d.connectors?.logRun({ connector: "gmail", action: name, target: agent.id, status: "ok", durationMs: Date.now() - t0 });
          return { kind: "result", content: out };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await d.connectors?.logRun({ connector: "gmail", action: name, target: agent.id, status: "error", error: msg, durationMs: Date.now() - t0 });
          return { kind: "result", content: `Échec : ${msg}`, isError: true };
        }
      }
      return sensitiveAction(d, task, agent, toolUseId, name, integrationSummary(agent.name, name, input), { ...input, siblings });
    };
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
        model: d.cfg.models.economy,
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
