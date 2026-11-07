import { agentById, agentSpecs, ceo, directory } from "./agents";
import { FatalError, type BetaToolUnion } from "./llm";
import { runLoop, type LoopDeps } from "./loop";
import type { Mission, NewTask, Task } from "./store";
import { consultTool, consult } from "./tools";

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MAX_MEETING_PARTICIPANTS = 6;
export const MAX_REVIEW_ROUNDS = 2;

export interface PlanInput {
  analysis: string;
  meeting: { needed: boolean; participants: string[]; agenda: string };
  tasks: { key: string; title: string; description: string; deliverable: string; assignee: string; depends_on: string[]; complexity: "standard" | "complex" }[];
}

function planTool(): BetaToolUnion {
  const ids = agentSpecs().filter((a) => !a.isCEO).map((a) => a.id);
  return {
    name: "submit_plan",
    description: "Enregistre le plan de mission : tâches déléguées aux spécialistes, dépendances, et réunion de lancement si utile. Le plan est exécuté immédiatement.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        analysis: { type: "string", description: "Analyse de l'objectif : résultat attendu, contraintes, risques (5 à 10 lignes)" },
        meeting: {
          type: "object",
          description: "Réunion de lancement réelle (discussion IA entre participants), à organiser seulement si la coordination la justifie",
          properties: {
            needed: { type: "boolean" },
            participants: { type: "array", items: { type: "string", enum: ids }, description: "2 à 5 spécialistes (Gaspard est ajouté automatiquement)" },
            agenda: { type: "string", description: "Ordre du jour et décisions attendues" },
          },
          required: ["needed", "participants", "agenda"],
          additionalProperties: false,
        },
        tasks: {
          type: "array",
          description: "1 à 8 tâches concrètes",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "identifiant court en minuscules, ex. 'etude-marche'" },
              title: { type: "string" },
              description: { type: "string", description: "Instructions précises et autonomes pour le spécialiste" },
              deliverable: { type: "string", description: "Livrable attendu et critères d'acceptation" },
              assignee: { type: "string", enum: ids },
              depends_on: { type: "array", items: { type: "string" }, description: "Clés des tâches dont le livrable est nécessaire avant de commencer" },
              complexity: {
                type: "string",
                enum: ["standard", "complex"],
                description:
                  "'complex' uniquement si la tâche exige un raisonnement poussé (stratégie, architecture, analyse fine, arbitrages) : elle utilisera le modèle avancé, plus cher. Sinon 'standard' (modèle économique).",
              },
            },
            required: ["key", "title", "description", "deliverable", "assignee", "depends_on", "complexity"],
            additionalProperties: false,
          },
        },
      },
      required: ["analysis", "meeting", "tasks"],
      additionalProperties: false,
    },
  };
}

const REVIEW_TOOL: BetaToolUnion = {
  name: "submit_review",
  description: "Enregistre ta vérification des livrables : accepter, ou demander une révision précise.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            decision: { type: "string", enum: ["accept", "revise"] },
            feedback: { type: "string", description: "Pour 'revise' : ce qui manque ou est faux, et ce qui est attendu" },
          },
          required: ["key", "decision", "feedback"],
          additionalProperties: false,
        },
      },
      summary: { type: "string" },
    },
    required: ["verdicts", "summary"],
    additionalProperties: false,
  },
};

/** Validation métier du plan (en plus du schéma strict). Retourne la liste des erreurs. */
export function validatePlan(p: PlanInput, maxTasks: number): string[] {
  const errors: string[] = [];
  if (!p.tasks.length) errors.push("Le plan doit contenir au moins une tâche.");
  if (p.tasks.length > maxTasks) errors.push(`Trop de tâches (${p.tasks.length}) : maximum ${maxTasks}.`);
  const keys = new Set<string>();
  for (const t of p.tasks) {
    if (!KEY.test(t.key)) errors.push(`Clé invalide « ${t.key} » (minuscules, chiffres, - et _).`);
    if (keys.has(t.key)) errors.push(`Clé en double « ${t.key} ».`);
    keys.add(t.key);
    const a = agentById(t.assignee);
    if (!a || a.isCEO) errors.push(`Assigné invalide pour « ${t.key} » : ${t.assignee}.`);
  }
  for (const t of p.tasks) for (const d of t.depends_on) if (!keys.has(d)) errors.push(`« ${t.key} » dépend d'une tâche inconnue « ${d} ».`);
  // Détection de cycles (DFS).
  const state = new Map<string, number>();
  const byKey = new Map(p.tasks.map((t) => [t.key, t]));
  const visit = (k: string): boolean => {
    if (state.get(k) === 1) return true;
    if (state.get(k) === 2) return false;
    state.set(k, 1);
    for (const d of byKey.get(k)?.depends_on ?? []) if (visit(d)) return true;
    state.set(k, 2);
    return false;
  };
  if (p.tasks.some((t) => visit(t.key))) errors.push("Les dépendances forment un cycle.");
  if (p.meeting.needed) {
    const parts = [...new Set(p.meeting.participants)];
    if (parts.length < 1 || parts.length > MAX_MEETING_PARTICIPANTS - 1) errors.push(`La réunion doit compter 1 à ${MAX_MEETING_PARTICIPANTS - 1} participants en plus de Gaspard.`);
    for (const id of parts) if (!agentById(id) || agentById(id)!.isCEO) errors.push(`Participant invalide : ${id}.`);
  }
  return errors;
}

export function planToTasks(p: PlanInput, ceoId: string): NewTask[] {
  const out: NewTask[] = [];
  const meeting = p.meeting.needed;
  if (meeting)
    out.push({
      key: "kickoff",
      kind: "meeting",
      title: "Réunion de lancement",
      description: p.meeting.agenda,
      assignee: ceoId,
      participants: [ceoId, ...[...new Set(p.meeting.participants)].filter((x) => x !== ceoId)],
    });
  for (const t of p.tasks)
    out.push({
      key: t.key,
      kind: "execute",
      title: t.title,
      description: t.description,
      deliverable: t.deliverable,
      assignee: t.assignee,
      depends_on: meeting ? [...t.depends_on, "kickoff"] : t.depends_on,
      complexity: t.complexity === "complex" ? "complex" : "standard",
    });
  return out;
}

function gaspardSystem(): string {
  return `${ceo().systemPrompt}

Annuaire de l'équipe (identifiant : nom, rôle, compétences, outils) :
${directory()}

Règles de délégation :
- Choisis le spécialiste dont les compétences correspondent le mieux ; répartis la charge.
- Des tâches petites et vérifiables (une personne, un livrable clair) plutôt qu'une grosse tâche floue.
- N'ajoute une dépendance que si le livrable amont est réellement nécessaire.
- Une réunion de lancement coûte plusieurs appels : organise-la seulement si plusieurs spécialistes doivent s'aligner.
- Budget serré (quelques dollars par mission) : marque 'complex' seulement les tâches qui en ont vraiment besoin.
- Les actions externes (envoi de messages, publication…) sont toujours soumises à validation humaine.`;
}

export async function runPlan(d: LoopDeps, mission: Mission, task: Task, onProgress?: () => Promise<void>): Promise<"done" | "awaiting"> {
  const boss = ceo();
  const res = await runLoop(d, {
    task,
    agentId: boss.id,
    purpose: "plan",
    model: d.cfg.models.advanced,
    effort: d.cfg.effort.ceo,
    maxTokens: 32000,
    system: gaspardSystem(),
    kickoff: `Objectif de l'entrepreneur :\n"""${mission.goal}"""\n\nAnalyse-le, puis appelle submit_plan. Tu peux d'abord consulter un spécialiste si l'objectif est ambigu sur un point technique.`,
    tools: [planTool(), consultTool(boss)],
    handlers: {
      consult_colleague: (input) => consult(d, task, boss, String(input.colleague), String(input.question)),
      submit_plan: async (input) => {
        const plan = input as unknown as PlanInput;
        const errors = validatePlan(plan, d.cfg.maxTasksPerMission);
        if (errors.length) return { kind: "result", content: `Plan refusé, corrige :\n- ${errors.join("\n- ")}`, isError: true };
        return { kind: "done", value: plan, content: "Plan enregistré, délégation en cours." };
      },
    },
    terminal: ["submit_plan"],
    onProgress,
  });
  if (res.kind === "awaiting") return "awaiting";
  if (res.kind !== "done") throw new FatalError("Gaspard n'a pas produit de plan.");
  const plan = res.value as PlanInput;
  await d.store.insertTasks(mission.id, planToTasks(plan, boss.id));
  await d.store.updateMission(mission.id, { status: "running", plan });
  await d.store.completeTask(task.id, plan.analysis);
  return "done";
}

function deliverablesBlock(tasks: Task[]): string {
  return tasks
    .filter((t) => t.kind === "execute")
    .map((t) => {
      const who = agentById(t.assignee);
      return `### [${t.key}] ${t.title} — ${who?.name ?? t.assignee} (${who?.role ?? ""})\nAttendu : ${t.deliverable}\n\nLivrable :\n${t.result ?? "(aucun)"}`;
    })
    .join("\n\n---\n\n");
}

export async function runReview(d: LoopDeps, mission: Mission, task: Task, onProgress?: () => Promise<void>): Promise<"done" | "awaiting"> {
  const boss = ceo();
  const tasks = await d.store.tasksOf(mission.id);
  const round = mission.review_round + 1;
  const finalRound = round >= MAX_REVIEW_ROUNDS;
  const res = await runLoop(d, {
    task,
    agentId: boss.id,
    purpose: "review",
    model: d.cfg.models.advanced,
    effort: d.cfg.effort.ceo,
    maxTokens: 32000,
    system: gaspardSystem(),
    kickoff: `Mission : """${mission.goal}"""\n\nVérifie chaque livrable avec exigence (exactitude, complétude, utilité concrète, respect des critères). ${
      finalRound ? "C'est le dernier tour de revue : n'utilise 'revise' que pour un défaut bloquant." : "Demande une révision seulement si elle améliore réellement le résultat."
    }\n\n${deliverablesBlock(tasks)}\n\nAppelle submit_review avec un verdict par clé.`,
    tools: [REVIEW_TOOL],
    handlers: { submit_review: async (input) => ({ kind: "done", value: input, content: "Revue enregistrée." }) },
    terminal: ["submit_review"],
    onProgress,
  });
  if (res.kind === "awaiting") return "awaiting";
  if (res.kind !== "done") throw new FatalError("Revue absente.");
  const review = res.value as { verdicts: { key: string; decision: string; feedback: string }[]; summary: string };
  const toRevise = finalRound ? [] : review.verdicts.filter((v) => v.decision === "revise");
  for (const v of toRevise) {
    const t = tasks.find((x) => x.key === v.key && x.kind === "execute");
    if (!t) continue;
    // La révision reprend la conversation de l'agent avec le retour de Gaspard.
    await d.store.appendMessage(t, t.assignee, "user", [{ type: "text", text: `Gaspard demande une révision de ton livrable :\n${v.feedback}\n\nCorrige puis rappelle submit_deliverable avec la version complète.` }]);
    await d.store.setTaskStatus(t.id, "pending", { feedback: v.feedback, revision: t.revision + 1 });
  }
  await d.store.updateMission(mission.id, { review_round: round, status: toRevise.length ? "running" : "reporting" });
  await d.store.completeTask(task.id, JSON.stringify(review));
  return "done";
}

export async function runReport(d: LoopDeps, mission: Mission, task: Task, onProgress?: () => Promise<void>): Promise<"done" | "awaiting"> {
  const boss = ceo();
  const tasks = await d.store.tasksOf(mission.id);
  const meetings = tasks.filter((t) => t.kind === "meeting" && t.result).map((t) => `Compte rendu de réunion :\n${t.result}`);
  const res = await runLoop(d, {
    task,
    agentId: boss.id,
    purpose: "report",
    model: d.cfg.models.advanced,
    effort: d.cfg.effort.ceo,
    maxTokens: 32000,
    system: gaspardSystem(),
    kickoff: `Rédige le rapport final pour l'entrepreneur sur la mission : """${mission.goal}"""\n\nStructure : 1) Résultat en 3 lignes, 2) Livrables (l'essentiel de chacun, sans tout recopier), 3) Décisions prises, 4) Points ouverts et prochaines actions concrètes pour l'humain. Markdown sobre. N'invente rien qui ne figure pas dans les livrables.\n\n${meetings.join("\n\n")}\n\n${deliverablesBlock(tasks)}`,
    tools: [],
    handlers: {},
    terminal: [],
    onProgress,
  });
  if (res.kind !== "text" || !res.text) throw new FatalError("Rapport vide.");
  await d.store.completeTask(task.id, res.text);
  await d.store.updateMission(mission.id, { status: "done", result: res.text });
  return "done";
}

/**
 * Fait avancer la mission après chaque tâche terminée : lance la revue quand tous les livrables
 * sont prêts, puis le rapport. Idempotent (contrainte d'unicité sur la clé de tâche).
 */
export async function advanceMission(d: LoopDeps, missionId: string): Promise<void> {
  const m = await d.store.getMission(missionId);
  if (!m || ["done", "failed", "cancelled", "paused", "planning"].includes(m.status)) return;
  const tasks = await d.store.tasksOf(missionId);
  const work = tasks.filter((t) => t.kind === "execute" || t.kind === "meeting");
  if (!work.length || work.some((t) => t.status !== "done")) return;
  const boss = ceo().id;
  const insertOnce = async (t: NewTask) => {
    if (tasks.some((x) => x.key === t.key)) return;
    try {
      await d.store.insertTasks(missionId, [t]);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // déjà créée par un autre worker
    }
  };
  if (m.status === "running") {
    await insertOnce({ key: `review-${m.review_round + 1}`, kind: "review", title: `Vérification des livrables (tour ${m.review_round + 1})`, assignee: boss });
    await d.store.updateMission(missionId, { status: "reviewing" });
  } else if (m.status === "reporting") {
    await insertOnce({ key: "report", kind: "report", title: "Rapport final à l'entrepreneur", assignee: boss });
  }
}
