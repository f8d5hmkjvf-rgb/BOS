import type { ActivityId } from "./activities";
import type { AgentProfile } from "./roster";
import type { AnimationId, DecisionRecord, Direction, Needs, RealWork, Tile, Vec2 } from "./types";

/**
 * Machine à états hiérarchique — niveau 1 (mode) :
 *
 *   off_duty ──► arriving ──► deciding ◄──► task ◄──► conversation
 *                               │  ▲          │
 *                               ▼  │          ▼
 *                             leaving ──► off_duty
 *
 * Niveau 2 (dans `task`) : navigating ► queueing ► performing ► (étape suivante | fin).
 */
export type AgentMode = "off_duty" | "arriving" | "deciding" | "task" | "conversation" | "leaving";
export type TaskPhase = "navigating" | "queueing" | "performing";

export const MODE_TRANSITIONS: Record<AgentMode, AgentMode[]> = {
  off_duty: ["arriving"],
  arriving: ["deciding"],
  deciding: ["task", "conversation", "leaving"],
  task: ["deciding", "conversation", "leaving", "task"],
  conversation: ["deciding", "task"],
  leaving: ["off_duty", "deciding"],
};

export const PHASE_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  navigating: ["queueing", "performing", "navigating"],
  queueing: ["navigating", "performing"],
  performing: ["navigating"],
};

export interface TaskRuntime {
  activity: ActivityId;
  step: number;
  phase: TaskPhase;
  /** Ressource visée pour l'étape courante (réservée ou en file). */
  resourceId: string | null;
  /** Tick de fin de l'étape en cours (performing), Infinity = jusqu'à libération. */
  performUntil: number;
  /** Tick d'entrée en file (patience). */
  queuedAt: number;
  /** Dernière case d'étape (pour `nearPrevious`). */
  lastTile: Tile | null;
  /** Restant de performance si interrompu par une conversation. */
  remaining: number;
}

export interface Bubble {
  text: string;
  until: number;
}

export class Agent {
  readonly index: number;
  readonly profile: AgentProfile;
  pos: Vec2 = { x: 0, y: 0 };
  /** Position au tick précédent (interpolation du rendu). */
  prevPos: Vec2 = { x: 0, y: 0 };
  /** Case occupée (collision). */
  tile: Tile = { x: 0, y: 0 };
  /** Case suivante réservée pendant un déplacement. */
  claimed: Tile | null = null;
  dir: Direction = 2;
  speed: number;
  path: Tile[] = [];
  destination: Tile | null = null;

  needs: Needs;
  mode: AgentMode = "off_duty";
  task: TaskRuntime | null = null;
  /** Tâche suspendue pendant une conversation. */
  suspended: TaskRuntime | null = null;
  conversationWith: number | null = null;
  conversationUntil = 0;

  anim: AnimationId = "idle";
  animStart = 0;
  holding: "cup" | "plate" | null = null;
  /** Masqué (hors du bureau ou dans une cabine fermée). */
  hidden = true;
  /** Traverse temporairement un autre agent (déblocage d'interblocage). */
  squeezing = false;

  waitTicks = 0;
  stuckTicks = 0;
  nextDecisionTick = 0;
  recentCoffees = 0;
  arrivalSec = 9 * 3600;
  leaveHour = 18;
  cooldowns = new Map<ActivityId, number>();
  decision: DecisionRecord | null = null;
  bubble: Bubble | null = null;
  /** Réplique différée (tour de parole). */
  pendingLine: { text: string; at: number; until: number } | null = null;
  realWork: RealWork = { status: "idle", taskTitle: null, updatedAt: 0 };
  /** Intention déjà émise pour ce titre de mission (évite les doublons). */
  escalatedFor: string | null = null;
  /** Historique des transitions récentes (debug). */
  history: string[] = [];

  constructor(index: number, profile: AgentProfile, needs: Needs, speed: number) {
    this.index = index;
    this.profile = profile;
    this.needs = needs;
    this.speed = speed;
  }

  get id(): string {
    return this.profile.id;
  }

  get name(): string {
    return this.profile.name;
  }

  get moving(): boolean {
    return this.path.length > 0 || this.claimed !== null;
  }

  setMode(next: AgentMode, tick: number, why = ""): void {
    if (next === this.mode && next !== "task") return;
    if (!MODE_TRANSITIONS[this.mode].includes(next)) {
      throw new Error(`Transition interdite ${this.mode} → ${next} (${this.id})`);
    }
    this.history.push(`${tick}:${this.mode}→${next}${why ? ` (${why})` : ""}`);
    if (this.history.length > 12) this.history.shift();
    this.mode = next;
  }

  setPhase(next: TaskPhase): void {
    if (!this.task) throw new Error(`Pas de tâche pour ${this.id}`);
    if (!PHASE_TRANSITIONS[this.task.phase].includes(next)) {
      throw new Error(`Phase interdite ${this.task.phase} → ${next} (${this.id})`);
    }
    this.task.phase = next;
  }

  setAnim(a: AnimationId, tick: number): void {
    if (this.anim !== a) {
      this.anim = a;
      this.animStart = tick;
    }
  }

  say(text: string, tick: number, durationTicks = 90): void {
    this.bubble = { text, until: tick + durationTicks };
  }
}

export function directionFrom(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  const a = Math.atan2(dy, dx);
  return (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8) as Direction;
}
