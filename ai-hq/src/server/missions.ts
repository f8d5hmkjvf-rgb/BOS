import "server-only";
import type { RealWorkStatus } from "../sim/types";
import { getPool } from "./db";

export interface MissionState {
  agentId: string;
  status: RealWorkStatus;
  taskTitle: string | null;
  updatedAt: number;
}

type Listener = (m: MissionState) => void;

interface Store {
  missions: Map<string, MissionState>;
  listeners: Set<Listener>;
  demoTimer: ReturnType<typeof setInterval> | null;
}

// Singleton survivant au rechargement à chaud de Next.js.
const g = globalThis as unknown as { __aiHqMissions?: Store };
const store: Store = (g.__aiHqMissions ??= { missions: new Map(), listeners: new Set(), demoTimer: null });

export const VALID_STATUSES: RealWorkStatus[] = ["idle", "busy", "blocked", "awaiting_approval", "offline"];

export function listMissions(): MissionState[] {
  return [...store.missions.values()];
}

export async function upsertMission(m: Omit<MissionState, "updatedAt">): Promise<MissionState> {
  const full = { ...m, updatedAt: Date.now() };
  store.missions.set(m.agentId, full);
  const pool = getPool();
  if (pool) {
    await pool.query(
      `INSERT INTO agent_missions (agent_id, status, task_title, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (agent_id) DO UPDATE SET status=$2, task_title=$3, updated_at=now()`,
      [m.agentId, m.status, m.taskTitle],
    );
  }
  for (const l of store.listeners) l(full);
  return full;
}

export function subscribe(l: Listener): () => void {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
}

const DEMO_TASKS = [
  "Refonte de l'onboarding",
  "Rapport hebdo des ventes",
  "Correctif paiement",
  "Campagne newsletter",
  "Analyse de cohortes",
  "Audit sécurité",
  "Migration base de données",
  "Préparer la démo client",
];
const DEMO_AGENTS = ["grace", "alan", "john", "frances", "edward", "paul", "hugo", "dennis", "katherine", "nina"];

/**
 * Flux de démonstration (activé par MISSIONS_DEMO=1) : fait varier des statuts de missions
 * pour visualiser la synchronisation temps réel. Ce flux n'exécute aucune action réelle.
 */
export function ensureDemoFeed(): void {
  if (process.env.MISSIONS_DEMO !== "1" || store.demoTimer) return;
  let i = 0;
  store.demoTimer = setInterval(() => {
    i++;
    const agentId = DEMO_AGENTS[i % DEMO_AGENTS.length];
    const r = (i * 7919) % 100;
    const status: RealWorkStatus = r < 55 ? "busy" : r < 70 ? "idle" : r < 85 ? "blocked" : "awaiting_approval";
    void upsertMission({ agentId, status, taskTitle: status === "idle" ? null : DEMO_TASKS[(i * 31) % DEMO_TASKS.length] });
  }, 8000);
}
