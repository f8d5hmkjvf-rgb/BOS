/**
 * Configuration de l'orchestrateur, lue depuis l'environnement (jamais depuis le client).
 * Aucune valeur secrète n'est exposée par l'API : seulement « configuré / manquant ».
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface OrchestratorConfig {
  databaseUrl: string | null;
  anthropicConfigured: boolean;
  anthropicBaseUrl: string;
  /**
   * Deux niveaux : un modèle économique par défaut (exécution, réunions, consultations)
   * et un modèle avancé pour Gaspard (plan, revue, rapport) et les tâches marquées complexes.
   */
  models: { economy: string; advanced: string };
  effort: { ceo: Effort; agent: Effort; complex: Effort; dialogue: Effort };
  /** Budget par défaut d'une mission (USD). */
  missionBudgetUsd: number;
  /** Plafond absolu du budget d'une mission, même relevé à la main (USD). */
  maxMissionBudgetUsd: number;
  /** Plafond de dépense quotidien, toutes missions confondues (USD). */
  dailyBudgetUsd: number;
  maxToolIterations: number;
  maxTasksPerMission: number;
  workerConcurrency: number;
  leaseSeconds: number;
  /** Webhook générique (Make, Zapier…) ; n8n, Google et Slack se configurent dans les Paramètres. */
  genericWebhookUrl: string | null;
  notifyWebhookUrl: string | null;
  webSearchEnabled: boolean;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const effort = (v: string | undefined, d: Effort): Effort =>
  v === "low" || v === "medium" || v === "high" || v === "xhigh" || v === "max" ? v : d;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const maxMission = num(env.AIHQ_MAX_MISSION_BUDGET_USD, 3);
  return {
    databaseUrl: env.DATABASE_URL || null,
    anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY),
    // Base explicite : on n'hérite pas d'une ANTHROPIC_BASE_URL d'outillage ambiant par accident.
    anthropicBaseUrl: env.AIHQ_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    models: {
      economy: env.AIHQ_MODEL_ECONOMY || "claude-sonnet-5-5",
      advanced: env.AIHQ_MODEL_ADVANCED || "claude-opus-5-5",
    },
    effort: {
      ceo: effort(env.AIHQ_EFFORT_CEO, "high"),
      agent: effort(env.AIHQ_EFFORT_AGENT, "medium"),
      complex: effort(env.AIHQ_EFFORT_COMPLEX, "high"),
      dialogue: effort(env.AIHQ_EFFORT_DIALOGUE, "low"),
    },
    missionBudgetUsd: Math.min(num(env.AIHQ_MISSION_BUDGET_USD, 3), maxMission),
    maxMissionBudgetUsd: maxMission,
    dailyBudgetUsd: num(env.AIHQ_DAILY_BUDGET_USD, 20),
    maxToolIterations: num(env.AIHQ_MAX_TOOL_ITERATIONS, 10),
    maxTasksPerMission: num(env.AIHQ_MAX_TASKS, 8),
    workerConcurrency: num(env.AIHQ_WORKER_CONCURRENCY, 3),
    leaseSeconds: num(env.AIHQ_LEASE_SECONDS, 300),
    genericWebhookUrl: env.AIHQ_WEBHOOK_URL || null,
    notifyWebhookUrl: env.AIHQ_NOTIFY_WEBHOOK_URL || null,
    webSearchEnabled: env.AIHQ_WEB_SEARCH !== "0",
  };
}

/** Ce qui manque pour que l'orchestrateur fonctionne réellement. */
export function missingConfiguration(c: OrchestratorConfig): string[] {
  const out: string[] = [];
  if (!c.databaseUrl) out.push("DATABASE_URL (PostgreSQL) n'est pas défini : missions et tâches ne peuvent pas être persistées.");
  if (!c.anthropicConfigured) out.push("ANTHROPIC_API_KEY n'est pas défini : Gaspard et les agents ne peuvent pas appeler l'API Anthropic.");
  return out;
}
