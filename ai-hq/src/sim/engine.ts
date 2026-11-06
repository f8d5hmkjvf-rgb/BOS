import { ACTIVITIES, effectFor, type ActivityId, type StepDef } from "./activities";
import { Agent, directionFrom, type TaskRuntime } from "./agent";
import { ActionGate, type SimIntent } from "./actionGate";
import { TemplateDialogueProvider, type DialogueProvider } from "./dialogue";
import { buildOfficeMap, type OfficeMap, type RoomKind } from "./map";
import { adHocMeeting, GATHER_LEAD_SEC, planDay, START_GRACE_SEC, type Meeting } from "./meetings";
import { ACTIVITY_EFFECTS, applyEffect, clamp01, coffeeEffect, defaultNeeds, overnight, tickNeeds } from "./needs";
import { findPath } from "./pathfinding";
import { ResourceManager, type ResourceState } from "./resources";
import { Rng } from "./rng";
import { buildRoster, DEPARTMENTS } from "./roster";
import { RelationshipGraph } from "./social";
import type { AnimationId, DepartmentId, Direction, RealWork, ResourceType, Tile } from "./types";
import { scoreActivities } from "./utility";
import type { Grid } from "./grid";

/** Durée réelle d'un tick à vitesse x1 (ms). */
export const TICK_MS = 50;
/** Secondes simulées par tick. 1 h simulée = 3600 ticks = 3 min réelles à x1. */
export const SIM_SECONDS_PER_TICK = 1;
export const SPEEDS = [0, 1, 2, 5] as const;
export type Speed = (typeof SPEEDS)[number];

const NEEDS_EVERY = 10;
const SOCIAL_EVERY = 5;
const VALIDATE_EVERY = 100;
const DAY_START_SEC = 8.5 * 3600;

export type SimEventKind = "activity" | "social" | "meeting" | "queue" | "recovery" | "day" | "intent" | "system";

export interface SimEvent {
  tick: number;
  day: number;
  sec: number;
  kind: SimEventKind;
  text: string;
  agents: string[];
}

export interface WorldOptions {
  seed?: number;
  dialogue?: DialogueProvider;
  /** Heure de départ (secondes depuis minuit). */
  startSec?: number;
}

export interface WorldStats {
  pathfinds: number;
  pathFailures: number;
  squeezes: number;
  recoveries: number;
  conversations: number;
  queueAbandons: number;
  maxStepMs: number;
}

const ACTIVITY_RESOURCE: Partial<Record<ActivityId, ResourceType>> = {
  toilet: "toilet_stall",
  coffee: "coffee_machine",
  water: "water_cooler",
  eat: "food_counter",
  rest: "sofa",
  socialize: "coffee_spot",
};

const SOCIAL_PERFORMING: AnimationId[] = ["coffee_drink", "drink_water", "eat", "idle", "rest"];

/**
 * Monde simulé. Pas de temps fixe, entièrement déterministe pour une graine donnée,
 * aucune dépendance au rendu ni au réseau. Toute action externe passe par l'ActionGate,
 * qui ne fait qu'enregistrer des intentions en attente d'autorisation humaine.
 */
export class World {
  readonly seed: number;
  readonly rng: Rng;
  readonly map: OfficeMap;
  readonly grid: Grid;
  readonly rm: ResourceManager;
  readonly agents: Agent[];
  readonly byId = new Map<string, Agent>();
  readonly rel: RelationshipGraph;
  readonly gate = new ActionGate();
  /** Propriétaire de chaque case (index agent + 1, 0 = libre). */
  readonly occ: Int16Array;
  dialogue: DialogueProvider;

  tick = 0;
  day = 0;
  sec: number;
  meetings: Meeting[] = [];
  events: SimEvent[] = [];
  speed: Speed = 1;
  private acc = 0;
  private lastArrivalDay: Int32Array;
  private adHocToday = false;
  stats: WorldStats = { pathfinds: 0, pathFailures: 0, squeezes: 0, recoveries: 0, conversations: 0, queueAbandons: 0, maxStepMs: 0 };

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 42;
    this.rng = new Rng(this.seed);
    this.dialogue = opts.dialogue ?? new TemplateDialogueProvider();
    this.sec = opts.startSec ?? DAY_START_SEC;
    const roster = buildRoster(this.seed);
    this.map = buildOfficeMap(roster.map((p) => ({ agentId: p.id, department: p.department })));
    this.grid = this.map.grid;
    this.rm = new ResourceManager(this.map.resources);
    this.occ = new Int16Array(this.grid.width * this.grid.height);
    this.agents = roster.map((p, i) => new Agent(i, p, defaultNeeds(), 0.11 + this.rng.next() * 0.03));
    for (const a of this.agents) {
      this.byId.set(a.id, a);
      a.needs = overnight(a.needs, this.rng.next());
      a.pos = { ...this.map.exitTile };
      a.prevPos = { ...a.pos };
      a.tile = { ...this.map.exitTile };
    }
    this.lastArrivalDay = new Int32Array(this.agents.length).fill(-1);
    this.rel = new RelationshipGraph(this.agents.length);
    this.rel.seed(
      this.agents.map((a) => a.profile.personality),
      this.agents.map((a) => a.profile.department),
      this.rng,
    );
    this.planDayTimes();
    this.meetings = planDay(this.day, this.meetingInfo());
  }

  // ---------------------------------------------------------------- Horloge

  get hour(): number {
    return this.sec / 3600;
  }

  /** Avance la simulation d'un temps réel écoulé (ms). Retourne le nombre de pas exécutés. */
  advance(realMs: number): number {
    if (this.speed === 0) return 0;
    this.acc += Math.min(realMs, 250) * this.speed;
    const maxSteps = 4 + this.speed * 4;
    let n = 0;
    while (this.acc >= TICK_MS && n < maxSteps) {
      this.step();
      this.acc -= TICK_MS;
      n++;
    }
    if (n === maxSteps) this.acc = Math.min(this.acc, TICK_MS); // évite la spirale de la mort
    return n;
  }

  /** Fraction d'interpolation pour le rendu entre deux pas fixes. */
  get alpha(): number {
    return Math.min(1, this.acc / TICK_MS);
  }

  setSpeed(s: Speed): void {
    this.speed = s;
  }

  runTicks(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  step(): void {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    this.tick++;
    this.sec += SIM_SECONDS_PER_TICK;
    this.rm.update(this.tick);
    this.rm.drainEvents();
    this.updateMeetings();
    for (const a of this.agents) this.updateAgent(a);
    if (this.tick % SOCIAL_EVERY === 0) this.updateSocial();
    if (this.tick % NEEDS_EVERY === 0) this.updateNeeds();
    if (this.tick % VALIDATE_EVERY === 0) for (const a of this.agents) this.validate(a);
    if (this.tick % 600 === 0) this.maybeAdHocMeeting();
    this.updateDayCycle();
    if (t0) this.stats.maxStepMs = Math.max(this.stats.maxStepMs, performance.now() - t0);
  }

  private planDayTimes(): void {
    for (const a of this.agents) {
      const p = a.profile;
      a.arrivalSec = 9 * 3600 + p.habits.arrivalOffsetMin * 60 + this.rng.int(0, 300);
      a.leaveHour = 17.6 + p.personality.conscientiousness * 0.8 + this.rng.next() * 0.3;
    }
  }

  private updateDayCycle(): void {
    if (this.sec >= 19.5 * 3600 && this.agents.every((a) => a.mode === "off_duty")) {
      this.day++;
      this.sec = DAY_START_SEC;
      this.adHocToday = false;
      for (const a of this.agents) {
        a.needs = overnight(a.needs, this.rng.next());
        a.recentCoffees = 0;
        a.cooldowns.clear();
      }
      this.planDayTimes();
      this.meetings = planDay(this.day, this.meetingInfo());
      this.log("day", `Jour ${this.day + 1} : ouverture du siège.`, []);
    } else if (this.sec >= 23 * 3600) {
      // Garde-fou : forcer les retardataires à partir.
      for (const a of this.agents) if (a.mode !== "off_duty" && a.mode !== "leaving") this.startTask(a, "leave");
    }
  }

  // ---------------------------------------------------------------- Événements

  log(kind: SimEventKind, text: string, agents: string[]): void {
    this.events.push({ tick: this.tick, day: this.day, sec: this.sec, kind, text, agents });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  // ---------------------------------------------------------------- Missions réelles (lecture seule)

  /** Alimenté par le pont temps réel : la simulation ne fait que lire ce statut. */
  setRealWork(agentId: string, work: Omit<RealWork, "updatedAt">): void {
    const a = this.byId.get(agentId);
    if (!a) return;
    a.realWork = { ...work, updatedAt: this.tick };
  }

  get pendingIntents(): SimIntent[] {
    return this.gate.pending();
  }

  // ---------------------------------------------------------------- Occupation des cases

  private ownTile(a: Agent, t: Tile): boolean {
    const i = this.grid.idx(t.x, t.y);
    const o = this.occ[i];
    if (o === 0 || o === a.index + 1) {
      this.occ[i] = a.index + 1;
      return true;
    }
    return false;
  }

  private freeTile(a: Agent, t: Tile): void {
    const i = this.grid.idx(t.x, t.y);
    if (this.occ[i] === a.index + 1) this.occ[i] = 0;
  }

  occupantAt(x: number, y: number): Agent | null {
    if (!this.grid.inBounds(x, y)) return null;
    const o = this.occ[this.grid.idx(x, y)];
    return o ? this.agents[o - 1] : null;
  }

  // ---------------------------------------------------------------- Navigation

  private navigate(a: Agent, goal: Tile, avoidStationary = false, keepWait = false): boolean {
    const from = a.claimed ?? a.tile;
    this.stats.pathfinds++;
    const isBlocked = avoidStationary
      ? (x: number, y: number) => {
          const o = this.occupantAt(x, y);
          return o !== null && o !== a && (!o.moving || o.waitTicks > 0);
        }
      : undefined;
    const path = findPath(this.grid, from, goal, { isBlocked, allowBlockedGoal: true });
    if (!path) {
      this.stats.pathFailures++;
      return false;
    }
    a.path = a.claimed ? [a.claimed, ...path] : path;
    a.destination = { ...goal };
    if (!keepWait) a.waitTicks = 0;
    return true;
  }

  private atDestination(a: Agent): boolean {
    return a.path.length === 0 && a.claimed === null && !!a.destination && a.tile.x === a.destination.x && a.tile.y === a.destination.y;
  }

  /** Avance l'agent le long de son chemin, avec réservation de case et gestion des blocages. */
  private moveAlong(a: Agent): "arrived" | "moving" | "blocked" {
    if (a.path.length === 0 && a.claimed === null) {
      // Après un passage en force, reprendre la propriété de sa case dès qu'elle se libère.
      if (a.squeezing && this.ownTile(a, a.tile)) a.squeezing = false;
      return "arrived";
    }
    const next = a.path[0];
    if (a.claimed === null) {
      if (!this.grid.isWalkable(next.x, next.y)) {
        // Obstacle dynamique apparu (porte fermée…) : recalcul.
        if (!a.destination || !this.navigate(a, a.destination)) a.path = [];
        return "blocked";
      }
      if (this.ownTile(a, next)) {
        a.claimed = next;
        a.waitTicks = 0;
      } else if (a.squeezing) {
        a.claimed = next;
      } else {
        this.handleBlocked(a, this.occupantAt(next.x, next.y)!);
        return "blocked";
      }
    }
    const target = a.claimed!;
    const dx = target.x - a.pos.x;
    const dy = target.y - a.pos.y;
    const dist = Math.hypot(dx, dy);
    a.dir = directionFrom(dx, dy, a.dir);
    a.setAnim("walk", this.tick);
    if (dist <= a.speed) {
      a.pos = { x: target.x, y: target.y };
      if (a.tile.x !== target.x || a.tile.y !== target.y) this.freeTile(a, a.tile);
      a.tile = { x: target.x, y: target.y };
      if (a.squeezing && this.ownTile(a, a.tile)) a.squeezing = false;
      a.claimed = null;
      a.path.shift();
      a.stuckTicks = 0;
      return a.path.length === 0 ? "arrived" : "moving";
    }
    a.pos = { x: a.pos.x + (dx / dist) * a.speed, y: a.pos.y + (dy / dist) * a.speed };
    return "moving";
  }

  private handleBlocked(a: Agent, other: Agent): void {
    a.waitTicks++;
    a.stuckTicks++;
    if (a.waitTicks > 4) a.setAnim("wait", this.tick);
    if (a.waitTicks % 15 === 0 && a.waitTicks <= 90 && a.destination) {
      // Contournement : on considère les agents immobiles comme des obstacles.
      const saved = a.path;
      if (!this.navigate(a, a.destination, true, true)) a.path = saved;
    }
    const mutual = other.waitTicks > 10 || !other.moving;
    const isGoal = a.path.length === 1;
    if (!isGoal && ((a.waitTicks >= 45 && mutual) || a.waitTicks >= 120)) {
      // Interblocage : on se faufile (collision douce), jamais de téléportation.
      a.squeezing = true;
      this.stats.squeezes++;
    }
  }

  // ---------------------------------------------------------------- Agents

  private updateAgent(a: Agent): void {
    a.prevPos = { x: a.pos.x, y: a.pos.y };
    if (a.bubble && this.tick > a.bubble.until) a.bubble = null;
    if (a.pendingLine && this.tick >= a.pendingLine.at) {
      if (a.mode === "conversation") a.bubble = { text: a.pendingLine.text, until: a.pendingLine.until };
      a.pendingLine = null;
    }
    if (a.mode !== "off_duty" && (this.tick + a.index) % 20 === 0) this.maybeEscalate(a);
    switch (a.mode) {
      case "off_duty":
        return this.updateOffDuty(a);
      case "arriving": {
        if (this.moveAlong(a) === "arrived") {
          a.setMode("deciding", this.tick, "arrivé");
          a.nextDecisionTick = this.tick;
        }
        return;
      }
      case "deciding":
        return this.decide(a);
      case "task":
        return this.updateTask(a);
      case "conversation":
        if (this.tick >= a.conversationUntil || (this.tick % 10 === 0 && this.meetingFor(a))) this.endConversation(a);
        return;
      case "leaving": {
        const res = this.moveAlong(a);
        if (res === "arrived" && !this.atDestination(a)) {
          this.navigate(a, this.map.exitTile);
          return;
        }
        if (res === "arrived") {
          this.freeTile(a, a.tile);
          a.hidden = true;
          a.squeezing = false;
          a.setMode("off_duty", this.tick, "parti");
          a.setAnim("idle", this.tick);
          this.log("activity", `${a.name} quitte le bureau.`, [a.id]);
        }
        return;
      }
    }
  }

  private updateOffDuty(a: Agent): void {
    if (this.lastArrivalDay[a.index] === this.day) return;
    if (this.sec < a.arrivalSec || this.hour >= a.leaveHour) return;
    const exit = this.map.exitTile;
    if (!this.ownTile(a, exit)) return; // l'entrée est occupée : on attend dehors
    this.lastArrivalDay[a.index] = this.day;
    a.tile = { ...exit };
    a.pos = { ...exit };
    a.prevPos = { ...exit };
    a.claimed = null;
    a.hidden = false;
    a.setMode("arriving", this.tick);
    const desk = this.rm.get(`desk:${a.id}`);
    this.navigate(a, desk.def.tile);
    this.log("activity", `${a.name} arrive au bureau.`, [a.id]);
  }

  private meetingFor(a: Agent): Meeting | null {
    for (const m of this.meetings) {
      if ((m.status === "gathering" || m.status === "in_progress") && m.participants.includes(a.id)) {
        const held = m.seats[a.id];
        if (held) {
          const r = this.rm.get(held);
          const mine = r.reservedBy === a.id || r.occupant === a.id;
          // Place libérée (pause toilettes…) : on la reprend si possible, sinon on en cherche une autre.
          if (!mine && !this.rm.reserve(held, a.id, this.tick, 1e9)) delete m.seats[a.id];
        }
        if (!m.seats[a.id]) {
          const seat = this.rm.freeOfType("meeting_seat", a.id)[0];
          if (!seat || !this.rm.reserve(seat.def.id, a.id, this.tick, 1e9)) continue;
          m.seats[a.id] = seat.def.id;
        }
        return m;
      }
    }
    return null;
  }

  private distanceTo(a: Agent, type: ResourceType): number {
    let best = Infinity;
    for (const r of this.rm.ofType(type)) {
      if (r.def.owner && r.def.owner !== a.id) continue;
      const d = Math.hypot(r.def.tile.x - a.tile.x, r.def.tile.y - a.tile.y);
      if (d < best) best = d;
    }
    return best;
  }

  private queueCost(a: Agent, type: ResourceType): number {
    const list = this.rm.ofType(type).filter((r) => !r.def.owner || r.def.owner === a.id);
    if (list.some((r) => this.rm.isAvailableFor(r.def.id, a.id) && r.queue.length === 0)) return 0;
    let best = Infinity;
    for (const r of list) if (r.def.queueTiles.length > r.queue.length) best = Math.min(best, r.queue.length + 1);
    return best;
  }

  private decide(a: Agent): void {
    if (this.tick < a.nextDecisionTick) return;
    const p = a.profile;
    const distance: Partial<Record<ActivityId, number>> = { work: this.distanceTo(a, "desk") };
    const queue: Partial<Record<ActivityId, number>> = {};
    for (const [act, type] of Object.entries(ACTIVITY_RESOURCE) as [ActivityId, ResourceType][]) {
      distance[act] = this.distanceTo(a, type);
      queue[act] = this.queueCost(a, type);
    }
    const cooldown = new Set<ActivityId>();
    for (const [act, until] of a.cooldowns) if (until > this.tick) cooldown.add(act);
    const noiseSeed = this.rng.next();
    const meeting = this.meetingFor(a);
    const scores = scoreActivities({
      needs: a.needs,
      personality: p.personality,
      habits: p.habits,
      realWork: a.realWork,
      hour: this.hour,
      leaveHour: a.leaveHour,
      current: a.task?.activity ?? null,
      recentCoffees: a.recentCoffees,
      meetingPending: meeting !== null && a.task?.activity !== "meeting",
      distance,
      queue,
      cooldown,
      noise: (act) => (noiseSeed * 9301 + act.length * 49297 + act.charCodeAt(0) * 233) % 1,
    });
    const best = scores[0];
    a.decision = { tick: this.tick, chosen: best.activity, scores: scores.map((s) => ({ ...s })) };
    a.nextDecisionTick = this.tick + 30 + this.rng.int(0, 30);
    if (a.mode === "task" && a.task?.activity === best.activity) return;
    if (best.score === -Infinity) return;
    this.startTask(a, best.activity);
  }

  /** Propose (sans jamais l'exécuter) une action externe : elle attend une autorisation humaine. */
  private maybeEscalate(a: Agent): void {
    const w = a.realWork;
    if ((w.status === "blocked" || w.status === "awaiting_approval") && w.taskTitle && a.escalatedFor !== w.taskTitle) {
      a.escalatedFor = w.taskTitle;
      const intent = this.gate.propose({
        agentId: a.id,
        kind: w.status === "blocked" ? "escalate_blocker" : "request_approval",
        summary:
          w.status === "blocked"
            ? `${a.name} veut signaler au CEO le blocage sur « ${w.taskTitle} »`
            : `${a.name} demande une validation humaine pour « ${w.taskTitle} »`,
        payload: { taskTitle: w.taskTitle },
        tick: this.tick,
      });
      this.log("intent", `Intention en attente d'autorisation : ${intent.summary}.`, [a.id]);
    }
  }

  startTask(a: Agent, activity: ActivityId): void {
    this.abortTask(a, false);
    if (activity === "leave") {
      this.rm.releaseAll(a.id, this.tick);
      a.holding = null;
      a.setMode(a.mode === "deciding" || a.mode === "task" ? "leaving" : a.mode, this.tick, "fin de journée");
      if (!this.navigate(a, this.map.exitTile)) a.destination = { ...this.map.exitTile };
      return;
    }
    a.task = { activity, step: 0, phase: "navigating", resourceId: null, performUntil: 0, queuedAt: 0, lastTile: { ...a.tile }, remaining: 0 };
    a.setMode("task", this.tick, ACTIVITIES[activity].label);
    if (activity !== "work") this.log("activity", `${a.name} ${ACTIVITIES[activity].label}.`, [a.id]);
    this.beginStep(a);
  }

  /** Annule la tâche en cours et libère ses ressources (sauf si `keepDesk`). */
  private abortTask(a: Agent, logIt: boolean): void {
    const t = a.task;
    if (!t) return;
    const step = ACTIVITIES[t.activity].steps[t.step];
    if (t.phase === "performing" && step?.privacy) this.closePrivacy(a, t);
    if (t.resourceId) {
      this.rm.removeFromQueue(t.resourceId, a.id, false);
      this.rm.release(t.resourceId, a.id, this.tick);
    }
    if (logIt) this.log("activity", `${a.name} abandonne : ${ACTIVITIES[t.activity].label}.`, [a.id]);
    a.task = null;
    a.path = a.claimed ? [a.claimed] : [];
  }

  private failTask(a: Agent, why: string): void {
    const t = a.task;
    if (t) a.cooldowns.set(t.activity, this.tick + ACTIVITIES[t.activity].failCooldown);
    this.abortTask(a, false);
    if (t && t.activity !== "work") this.log("activity", `${a.name} renonce (${why}).`, [a.id]);
    a.setMode("deciding", this.tick, why);
    a.nextDecisionTick = this.tick + 5;
  }

  private stepDef(a: Agent): StepDef {
    return ACTIVITIES[a.task!.activity].steps[a.task!.step];
  }

  private chooseResource(a: Agent, step: StepDef, type: ResourceType): { r: ResourceState; queue: boolean } | null {
    const t = a.task!;
    const origin = step.nearPrevious && t.lastTile ? t.lastTile : a.tile;
    const list = this.rm.ofType(type).filter((r) => !r.def.owner || r.def.owner === a.id);
    const dist = (r: ResourceState) => Math.hypot(r.def.tile.x - origin.x, r.def.tile.y - origin.y);
    const friends = step.social ? new Set(this.rel.friendsOf(a.index, 6)) : null;
    const score = (r: ResourceState) => {
      let s = dist(r);
      if (friends) {
        for (const o of this.agents) {
          if (o === a || o.hidden || !friends.has(o.index)) continue;
          if (Math.hypot(o.tile.x - r.def.tile.x, o.tile.y - r.def.tile.y) < 2.5) s -= 12;
        }
      }
      return s;
    };
    let best: ResourceState | null = null;
    let bestScore = Infinity;
    for (const r of list) {
      if (!this.rm.isAvailableFor(r.def.id, a.id) || r.queue.length > 0) continue;
      const s = score(r);
      if (s < bestScore) {
        best = r;
        bestScore = s;
      }
    }
    if (best) return { r: best, queue: false };
    if (!step.queue) return null;
    for (const r of list) {
      if (r.def.queueTiles.length <= r.queue.length) continue;
      const s = r.queue.length * 20 + dist(r);
      if (s < bestScore) {
        best = r;
        bestScore = s;
      }
    }
    return best ? { r: best, queue: true } : null;
  }

  private beginStep(a: Agent): void {
    const t = a.task!;
    const step = this.stepDef(a);
    t.resourceId = null;
    let goal: Tile | null = null;
    if ("ownDesk" in step.target) {
      const id = `desk:${a.id}`;
      this.rm.reserve(id, a.id, this.tick, 1e9);
      t.resourceId = id;
      goal = this.rm.get(id).def.tile;
    } else if ("meetingSeat" in step.target) {
      const m = this.meetingFor(a);
      if (!m) return this.failTask(a, "réunion terminée");
      t.resourceId = m.seats[a.id];
      goal = this.rm.get(t.resourceId).def.tile;
    } else {
      const choice = this.chooseResource(a, step, step.target.type);
      if (!choice) {
        if (step.optional) {
          this.applyStepEffect(a, step);
          a.holding = step.holdAfter === undefined ? a.holding : step.holdAfter;
          return this.nextStep(a);
        }
        return this.failTask(a, "ressource indisponible");
      }
      t.resourceId = choice.r.def.id;
      if (choice.queue) {
        const pos = this.rm.enqueue(t.resourceId, a.id);
        t.queuedAt = this.tick;
        a.setPhase("queueing");
        if (pos === 0) this.log("queue", `${a.name} fait la queue (${this.resourceLabel(choice.r)}).`, [a.id]);
        const spot = choice.r.def.queueTiles[Math.min(pos, choice.r.def.queueTiles.length - 1)];
        if (!this.navigate(a, spot)) return this.failTask(a, "file inaccessible");
        return;
      }
      if (!this.rm.reserve(t.resourceId, a.id, this.tick)) return this.failTask(a, "réservation refusée");
      goal = choice.r.def.tile;
    }
    if (t.phase !== "navigating") a.setPhase("navigating");
    if (!this.navigate(a, goal)) return this.failTask(a, "aucun chemin");
  }

  private resourceLabel(r: ResourceState): string {
    const labels: Partial<Record<ResourceType, string>> = {
      coffee_machine: "machine à café",
      toilet_stall: "toilettes",
      sink: "lavabos",
      water_cooler: "fontaine",
      food_counter: "comptoir repas",
    };
    return labels[r.def.type] ?? r.def.type;
  }

  private nextStep(a: Agent): void {
    const t = a.task!;
    t.lastTile = { ...a.tile };
    t.step++;
    t.phase = "navigating";
    if (t.step >= ACTIVITIES[t.activity].steps.length) {
      a.task = null;
      a.setMode("deciding", this.tick, "tâche finie");
      a.nextDecisionTick = this.tick;
      return;
    }
    this.beginStep(a);
  }

  private applyStepEffect(a: Agent, step: StepDef): void {
    if (!step.effect) return;
    const eff = effectFor(step.effect, a.recentCoffees, coffeeEffect, ACTIVITY_EFFECTS);
    a.needs = applyEffect(a.needs, eff);
    if (step.effect === "coffee") a.recentCoffees++;
  }

  private openPrivacy(a: Agent, t: TaskRuntime): void {
    const r = this.rm.get(t.resourceId!);
    a.hidden = true;
    if (r.def.doorTile) this.grid.addObstacle(r.def.doorTile.x, r.def.doorTile.y);
  }

  private closePrivacy(a: Agent, t: TaskRuntime): void {
    const r = t.resourceId ? this.rm.get(t.resourceId) : null;
    a.hidden = false;
    if (r?.def.doorTile && this.grid.hasDynamicObstacle(r.def.doorTile.x, r.def.doorTile.y)) this.grid.removeObstacle(r.def.doorTile.x, r.def.doorTile.y);
  }

  private updateTask(a: Agent): void {
    const t = a.task!;
    const step = this.stepDef(a);
    // Préemptions : réunion convoquée, urgence physiologique.
    if (this.tick % 10 === a.index % 10) {
      const preemptible = t.activity === "work" || t.activity === "rest" || t.activity === "socialize" || t.activity === "water" || (t.activity === "coffee" && t.phase !== "performing");
      if (preemptible && this.meetingFor(a)) return this.startTask(a, "meeting");
      if (a.needs.bladder > 0.96 && t.activity !== "toilet" && !(t.phase === "performing" && step.privacy)) return this.startTask(a, "toilet");
    }
    switch (t.phase) {
      case "navigating": {
        const r = t.resourceId ? this.rm.get(t.resourceId) : null;
        if (r && r.reservedBy !== a.id && r.occupant !== a.id) return this.beginStep(a); // réservation perdue
        const res = this.moveAlong(a);
        if (res === "blocked" && a.waitTicks > 400) return this.failTask(a, "chemin bloqué");
        if (res !== "arrived") return;
        if (!this.atDestination(a)) {
          if (!a.destination || !this.navigate(a, a.destination)) return this.failTask(a, "aucun chemin");
          return;
        }
        if (r && !this.rm.occupy(r.def.id, a.id)) return this.beginStep(a);
        a.setPhase("performing");
        a.dir = r ? r.def.facing : a.dir;
        const dur = step.duration === "until_released" ? Infinity : this.rng.int(step.duration[0], step.duration[1]);
        t.performUntil = this.tick + dur;
        if (step.holdDuring !== undefined) a.holding = step.holdDuring;
        a.setAnim(step.anim, this.tick);
        if (step.privacy) this.openPrivacy(a, t);
        if (t.activity === "work") a.nextDecisionTick = this.tick + 20 + this.rng.int(0, 40);
        return;
      }
      case "queueing": {
        const reserved = this.rm.reservationInPool(t.resourceId!, a.id);
        if (reserved) {
          t.resourceId = reserved.def.id;
          a.setPhase("navigating");
          if (!this.navigate(a, reserved.def.tile)) return this.failTask(a, "aucun chemin");
          return;
        }
        const r = this.rm.get(t.resourceId!);
        const pos = r.queue.indexOf(a.id);
        if (pos < 0) return this.beginStep(a);
        const spot = r.def.queueTiles[Math.min(pos, r.def.queueTiles.length - 1)];
        if (!a.destination || a.destination.x !== spot.x || a.destination.y !== spot.y) this.navigate(a, spot);
        const res = this.moveAlong(a);
        if (res === "arrived") {
          a.setAnim("wait", this.tick);
          a.dir = directionFrom(r.def.tile.x - a.tile.x, r.def.tile.y - a.tile.y, a.dir);
        }
        const patience = a.profile.habits.patienceMin * 60 * (a.needs.bladder > 0.8 && t.activity === "toilet" ? 3 : 1);
        if (this.tick - t.queuedAt > patience) {
          this.stats.queueAbandons++;
          a.needs = applyEffect(a.needs, { stress: 0.05 });
          this.log("queue", `${a.name} perd patience et quitte la file (${this.resourceLabel(r)}).`, [a.id]);
          return this.failTask(a, "trop d'attente");
        }
        return;
      }
      case "performing": {
        if (t.activity === "work") {
          if (this.tick >= a.nextDecisionTick) this.decide(a);
          return;
        }
        if (t.activity === "meeting") {
          a.setAnim("meeting", this.tick);
          return;
        }
        if (this.tick >= t.performUntil) this.completeStep(a);
        return;
      }
    }
  }

  private completeStep(a: Agent): void {
    const t = a.task!;
    const step = this.stepDef(a);
    this.applyStepEffect(a, step);
    if (step.privacy) this.closePrivacy(a, t);
    if (step.holdAfter !== undefined) a.holding = step.holdAfter;
    if (t.resourceId) this.rm.release(t.resourceId, a.id, this.tick);
    this.nextStep(a);
  }

  // ---------------------------------------------------------------- Besoins

  private updateNeeds(): void {
    const hours = (NEEDS_EVERY * SIM_SECONDS_PER_TICK) / 3600;
    for (const a of this.agents) {
      if (a.mode === "off_duty") continue;
      a.needs = tickNeeds(a.needs, hours, {
        activity: a.anim,
        personality: a.profile.personality,
        realBlocked: a.realWork.status === "blocked",
        realBusy: a.realWork.status === "busy",
        recentCoffees: a.recentCoffees,
        metabolism: a.profile.metabolism,
      });
      a.recentCoffees = Math.max(0, a.recentCoffees - hours / 2.5);
    }
  }

  // ---------------------------------------------------------------- Social

  private roomKind(t: Tile): RoomKind | null {
    const id = this.grid.roomIds[this.grid.idx(t.x, t.y)];
    return id >= 0 ? this.map.rooms[id].kind : null;
  }

  private socialState(a: Agent): "walking" | "idle" | null {
    if (a.mode !== "task" || a.hidden || a.claimed !== null || !a.task) return null;
    if (this.roomKind(a.tile) === "toilets") return null; // intimité : pas de conversation aux sanitaires
    const t = a.task;
    if (t.activity === "toilet" || t.activity === "meeting" || t.activity === "work") return null;
    if (t.phase === "navigating") return a.needs.bladder > 0.85 ? null : "walking";
    if (t.phase === "queueing") return "idle";
    return SOCIAL_PERFORMING.includes(a.anim) ? "idle" : null;
  }

  private updateSocial(): void {
    const cands: [Agent, "walking" | "idle"][] = [];
    for (const a of this.agents) {
      const s = this.socialState(a);
      if (s) cands.push([a, s]);
    }
    const busy = new Set<number>();
    for (let i = 0; i < cands.length; i++) {
      const [a, sa] = cands[i];
      if (busy.has(a.index)) continue;
      for (let j = i + 1; j < cands.length; j++) {
        const [b, sb] = cands[j];
        if (busy.has(b.index)) continue;
        const d = Math.hypot(a.tile.x - b.tile.x, a.tile.y - b.tile.y);
        const maxD = sa === "idle" && sb === "idle" ? 2.3 : 1.5;
        if (d > maxD) continue;
        const r = this.rel.get(a.index, b.index);
        if (this.tick - r.lastTalkTick < 900) continue;
        const pa = a.profile.personality;
        const pb = b.profile.personality;
        let p = 0.05 * (a.needs.social + b.needs.social) * (0.6 + (pa.extraversion + pb.extraversion) / 2) * (0.7 + 0.3 * (r.affinity + 1));
        if (a.task?.activity === "socialize" || b.task?.activity === "socialize") p += 0.15;
        if (sa === "walking" || sb === "walking") p *= 0.5;
        if (!this.rng.chance(p)) continue;
        const brief = sa === "walking" || sb === "walking";
        this.startConversation(a, b, brief ? this.rng.int(12, 30) : this.rng.int(40, 140));
        busy.add(a.index);
        busy.add(b.index);
        break;
      }
    }
  }

  private startConversation(a: Agent, b: Agent, duration: number): void {
    this.stats.conversations++;
    const room = this.roomKind(a.tile);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const t = x.task!;
      if (t.phase === "performing") t.remaining = Math.max(0, t.performUntil - this.tick);
      x.suspended = t;
      x.task = null;
      x.path = [];
      x.setMode("conversation", this.tick);
      x.conversationWith = y.index;
      x.conversationUntil = this.tick + duration;
      x.dir = directionFrom(y.tile.x - x.tile.x, y.tile.y - x.tile.y, x.dir);
      x.setAnim("talk", this.tick);
    }
    const rel = this.rel.get(a.index, b.index);
    const ctx = (s: Agent, l: Agent) => ({
      speakerName: s.name,
      listenerName: l.name,
      sameDepartment: s.profile.department === l.profile.department,
      room,
      hour: this.hour,
      affinity: rel.affinity,
      familiarity: rel.familiarity,
      speakerStress: s.needs.stress,
      speakerWork: s.realWork,
      drink: s.profile.preferences.drink,
      meetingSoon: this.meetings.some((m) => m.status === "scheduled" && m.startSec - this.sec < 1800 && m.participants.includes(s.id)),
    });
    const lineA = this.dialogue.line(ctx(a, b), this.rng);
    const lineB = this.dialogue.reply(ctx(b, a), this.rng, lineA);
    a.say(lineA, this.tick, Math.min(duration, 70));
    b.pendingLine = { text: lineB, at: this.tick + Math.min(Math.floor(duration / 2), 50), until: this.tick + duration };
    this.log("social", `${a.name} et ${b.name} discutent${room === "cafeteria" ? " à la cafétéria" : room === "corridor" ? " dans le couloir" : room === "lounge" ? " au lounge" : ""} : « ${lineA} »`, [a.id, b.id]);
  }

  private endConversation(a: Agent): void {
    const partner = a.conversationWith !== null ? this.agents[a.conversationWith] : null;
    let delta = 0;
    for (const x of partner && partner.mode === "conversation" && partner.conversationWith === a.index ? [a, partner] : [a]) {
      if (partner) {
        if (x === a) delta = this.rel.afterTalk(a.index, partner.index, a.profile.personality, partner.profile.personality, this.tick, this.rng);
        x.needs = applyEffect(x.needs, { social: -0.35, stress: delta > 0 ? -0.04 : 0.02 });
      }
      x.conversationWith = null;
      const t = x.suspended;
      x.suspended = null;
      if (!t) {
        x.setMode("deciding", this.tick, "fin de discussion");
        continue;
      }
      x.task = t;
      x.setMode("task", this.tick, "reprise");
      if (t.phase === "performing") {
        t.performUntil = this.tick + t.remaining;
        x.setAnim(this.stepDef(x).anim, this.tick);
      } else if (x.destination && !this.navigate(x, x.destination)) {
        this.failTask(x, "aucun chemin");
      }
    }
  }

  // ---------------------------------------------------------------- Réunions

  private meetingInfo() {
    return this.agents.map((a) => ({ id: a.id, department: a.profile.department, isLead: !!a.profile.isLead, isCEO: !!a.profile.isCEO }));
  }

  private seatedIn(m: Meeting): Agent[] {
    return m.participants
      .map((id) => this.byId.get(id)!)
      .filter((a) => a.mode === "task" && a.task?.activity === "meeting" && a.task.phase === "performing");
  }

  private updateMeetings(): void {
    for (const m of this.meetings) {
      if (m.status === "scheduled" && this.sec >= m.startSec - GATHER_LEAD_SEC) {
        const present = m.participants.filter((id) => this.byId.get(id)!.mode !== "off_duty");
        if (present.length < 2 && this.sec >= m.startSec) {
          m.status = "cancelled";
          this.log("meeting", `« ${m.title} » annulée (pas assez de monde).`, [m.organizer]);
          continue;
        }
        if (present.length < 2) continue;
        m.status = "gathering";
        this.log("meeting", `Ada convoque « ${m.title} » en salle Atlas (${m.participants.length} participants).`, m.participants);
      } else if (m.status === "gathering") {
        const seated = this.seatedIn(m);
        const present = m.participants.filter((id) => this.byId.get(id)!.mode !== "off_duty").length;
        const organizerIn = seated.some((a) => a.id === m.organizer);
        if ((organizerIn && seated.length >= Math.ceil(present * 0.6)) || this.sec >= m.startSec + START_GRACE_SEC) {
          m.status = "in_progress";
          m.startedAtSec = this.sec;
          this.log("meeting", `« ${m.title} » commence (${seated.length}/${m.participants.length} présents).`, m.participants);
        }
      } else if (m.status === "in_progress") {
        const seated = this.seatedIn(m);
        if (this.tick % 45 === 0 && seated.length > 0) {
          const s = this.rng.pick(seated);
          m.speaker = s.id;
          s.say(this.rng.pick(MEETING_LINES), this.tick, 40);
        }
        if (this.sec >= (m.startedAtSec ?? m.startSec) + m.durationSec) {
          m.status = "done";
          m.speaker = null;
          for (const a of seated) this.completeStep(a);
          for (const [aid, seat] of Object.entries(m.seats)) this.rm.release(seat, aid, this.tick);
          for (const id of m.participants) {
            const a = this.byId.get(id)!;
            a.needs = applyEffect(a.needs, { social: -0.25, stress: 0.03 });
          }
          this.log("meeting", `« ${m.title} » est terminée.`, m.participants);
        }
      }
    }
  }

  private maybeAdHocMeeting(): void {
    if (this.adHocToday || this.hour < 10 || this.hour > 16) return;
    const ceo = this.agents.find((a) => a.profile.isCEO);
    if (!ceo || ceo.mode === "off_duty") return;
    const depts = Object.keys(DEPARTMENTS).filter((d) => d !== "direction") as DepartmentId[];
    for (const d of depts) {
      const members = this.agents.filter((a) => a.profile.department === d && a.mode !== "off_duty");
      if (members.length < 2) continue;
      const avg = members.reduce((s, a) => s + a.needs.stress, 0) / members.length;
      if (avg < 0.55) continue;
      const m = adHocMeeting(this.day, this.sec, d, ceo.id, members.map((a) => a.id));
      const clash = this.meetings.some((o) => o.status !== "done" && o.status !== "cancelled" && Math.abs(o.startSec - m.startSec) < 3600);
      if (clash) continue;
      this.meetings.push(m);
      this.adHocToday = true;
      this.log("meeting", `Ada sent l'équipe ${DEPARTMENTS[d].label} sous tension et organise « ${m.title} ».`, [ceo.id]);
      return;
    }
  }

  // ---------------------------------------------------------------- Validation & récupération

  /** Récupération contrôlée d'un état invalide : seul cas de « téléportation » autorisé. */
  private validate(a: Agent): void {
    if (a.mode === "off_duty") return;
    const bad = !this.grid.inBounds(a.tile.x, a.tile.y) || !this.grid.isStaticWalkable(a.tile.x, a.tile.y) || !Number.isFinite(a.pos.x) || !Number.isFinite(a.pos.y);
    const stuck = a.stuckTicks > 1500;
    if (!bad && !stuck) return;
    this.recover(a, bad ? "position invalide" : "agent bloqué");
  }

  recover(a: Agent, why: string): void {
    this.stats.recoveries++;
    this.abortTask(a, false);
    if (a.suspended) a.suspended = null;
    this.rm.releaseAll(a.id, this.tick);
    this.freeTile(a, a.tile);
    if (a.claimed) this.freeTile(a, a.claimed);
    a.claimed = null;
    a.path = [];
    a.squeezing = false;
    a.hidden = false;
    a.stuckTicks = 0;
    let t = this.grid.nearestWalkable(a.tile) ?? this.map.exitTile;
    if (this.occupantAt(t.x, t.y)) {
      // Cherche une case libre autour.
      for (let r = 1; r < 6 && this.occupantAt(t.x, t.y); r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = t.x + dx;
            const y = t.y + dy;
            if (this.grid.isWalkable(x, y) && !this.occupantAt(x, y)) {
              t = { x, y };
              dy = r + 1;
              break;
            }
          }
    }
    a.tile = { ...t };
    a.pos = { ...t };
    a.prevPos = { ...t };
    this.ownTile(a, t);
    if (a.mode !== "deciding") {
      a.mode = "deciding";
      a.history.push(`${this.tick}:récupération (${why})`);
    }
    a.nextDecisionTick = this.tick;
    this.log("recovery", `Récupération contrôlée de ${a.name} : ${why}.`, [a.id]);
  }

  // ---------------------------------------------------------------- Sauvegarde

  snapshot(): WorldSnapshot {
    const rels: [number, number, number, number, number][] = [];
    for (let i = 0; i < this.agents.length; i++)
      for (let j = i + 1; j < this.agents.length; j++) {
        const r = this.rel.get(i, j);
        rels.push([i, j, r.affinity, r.familiarity, r.lastTalkTick]);
      }
    return {
      version: SNAPSHOT_VERSION,
      seed: this.seed,
      tick: this.tick,
      day: this.day,
      sec: this.sec,
      rng: this.rng.state,
      agents: this.agents.map((a) => ({
        id: a.id,
        x: a.mode === "off_duty" ? null : a.tile.x,
        y: a.mode === "off_duty" ? null : a.tile.y,
        dir: a.dir,
        needs: { ...a.needs },
        onDuty: a.mode !== "off_duty",
        arrivedToday: this.lastArrivalDay[a.index] === this.day,
        recentCoffees: a.recentCoffees,
        arrivalSec: a.arrivalSec,
        leaveHour: a.leaveHour,
      })),
      relationships: rels,
    };
  }

  static restore(snap: WorldSnapshot, opts: Omit<WorldOptions, "seed" | "startSec"> = {}): World {
    if (snap.version !== SNAPSHOT_VERSION) throw new Error(`Version de sauvegarde non supportée : ${snap.version}`);
    const w = new World({ ...opts, seed: snap.seed, startSec: snap.sec });
    w.tick = snap.tick;
    w.day = snap.day;
    w.rng.state = snap.rng;
    w.meetings = planDay(w.day, w.meetingInfo());
    // Les réunions déjà passées ne sont pas rejouées.
    for (const m of w.meetings) if (m.startSec + m.durationSec < w.sec) m.status = "done";
    for (const [i, j, aff, fam, last] of snap.relationships) w.rel.set(i, j, { affinity: aff, familiarity: fam, lastTalkTick: last });
    for (const s of snap.agents) {
      const a = w.byId.get(s.id);
      if (!a) continue;
      for (const k of Object.keys(a.needs) as (keyof typeof a.needs)[]) {
        const v = s.needs[k];
        a.needs[k] = Number.isFinite(v) ? clamp01(v) : a.needs[k];
      }
      a.dir = ((s.dir | 0) & 7) as Direction;
      a.recentCoffees = s.recentCoffees ?? 0;
      a.arrivalSec = s.arrivalSec ?? a.arrivalSec;
      a.leaveHour = s.leaveHour ?? a.leaveHour;
      if (s.arrivedToday) w.lastArrivalDay[a.index] = w.day;
      if (s.onDuty && s.x !== null && s.y !== null) {
        a.mode = "deciding";
        a.hidden = false;
        a.tile = { x: s.x, y: s.y };
        a.pos = { x: s.x, y: s.y };
        a.prevPos = { x: s.x, y: s.y };
        const valid = w.grid.inBounds(s.x, s.y) && w.grid.isStaticWalkable(s.x, s.y) && w.occupantAt(s.x, s.y) === null;
        if (valid) w.ownTile(a, a.tile);
        else w.recover(a, "position sauvegardée invalide");
        a.nextDecisionTick = w.tick;
      }
    }
    w.log("system", "Simulation restaurée depuis une sauvegarde.", []);
    return w;
  }
}

export const SNAPSHOT_VERSION = 1;

export interface WorldSnapshot {
  version: number;
  seed: number;
  tick: number;
  day: number;
  sec: number;
  rng: number;
  agents: {
    id: string;
    x: number | null;
    y: number | null;
    dir: number;
    needs: Record<string, number>;
    onDuty: boolean;
    arrivedToday: boolean;
    recentCoffees: number;
    arrivalSec: number;
    leaveHour: number;
  }[];
  relationships: [number, number, number, number, number][];
}

const MEETING_LINES = [
  "Point sur les objectifs de la semaine.",
  "Qui prend ce sujet ?",
  "On a un risque sur le planning.",
  "Bonne nouvelle : les chiffres montent.",
  "Je propose qu'on priorise ça.",
  "Des questions ?",
  "On valide et on avance.",
  "J'ai besoin d'un coup de main là-dessus.",
];

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
