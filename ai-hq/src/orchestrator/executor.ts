import { agentById } from "./agents";
import { FatalError } from "./llm";
import { runLoop, type LoopDeps } from "./loop";
import type { Mission, Task } from "./store";
import { executionTools } from "./tools";

/** Contexte de mission transmis au spécialiste : objectif, livrables amont, compte rendu de réunion. */
async function contextFor(d: LoopDeps, mission: Mission, task: Task): Promise<string> {
  const all = await d.store.tasksOf(mission.id);
  const parts: string[] = [];
  for (const key of task.depends_on) {
    const dep = all.find((t) => t.key === key);
    if (!dep?.result) continue;
    const who = agentById(dep.assignee);
    parts.push(dep.kind === "meeting" ? `Compte rendu de la réunion de lancement :\n${dep.result}` : `Livrable de ${who?.name ?? dep.assignee} — « ${dep.title} » :\n${dep.result}`);
  }
  return parts.join("\n\n---\n\n");
}

export interface Deliverable {
  summary: string;
  content: string;
  open_questions: string[];
}

export function formatDeliverable(v: Deliverable): string {
  const q = v.open_questions?.length ? `\n\n**Points ouverts :**\n${v.open_questions.map((x) => `- ${x}`).join("\n")}` : "";
  return `**Résumé :** ${v.summary}\n\n${v.content}${q}`;
}

export async function runExecution(d: LoopDeps, mission: Mission, task: Task, onProgress?: () => Promise<void>): Promise<"done" | "awaiting"> {
  const agent = agentById(task.assignee);
  if (!agent) throw new FatalError(`Agent inconnu : ${task.assignee}`);
  const ctx = await contextFor(d, mission, task);
  const { tools, handlers } = executionTools(agent, task, d);
  const res = await runLoop(d, {
    task,
    agentId: agent.id,
    purpose: "execute",
    // Modèle économique par défaut ; modèle avancé pour les tâches que Gaspard juge complexes.
    model: task.complexity === "complex" ? d.cfg.models.advanced : d.cfg.models.economy,
    effort: task.complexity === "complex" ? d.cfg.effort.complex : d.cfg.effort.agent,
    maxTokens: 32000,
    system: agent.systemPrompt,
    kickoff: `Mission de l'entreprise : """${mission.goal}"""\n\nTâche confiée par Gaspard : ${task.title}\n\nInstructions : ${task.description}\n\nLivrable attendu : ${task.deliverable}${ctx ? `\n\nÉléments disponibles :\n\n${ctx}` : ""}\n\nRéalise la tâche puis appelle submit_deliverable.`,
    tools,
    handlers,
    terminal: ["submit_deliverable"],
    nudge: "Appelle maintenant submit_deliverable avec ton livrable complet.",
    onProgress,
  });
  if (res.kind === "awaiting") return "awaiting";
  if (res.kind !== "done") throw new FatalError("Aucun livrable remis.");
  await d.store.completeTask(task.id, formatDeliverable(res.value as Deliverable));
  return "done";
}
