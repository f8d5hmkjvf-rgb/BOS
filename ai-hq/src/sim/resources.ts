import type { ResourceDef } from "./map";
import type { ResourceType } from "./types";

export interface ResourceState {
  def: ResourceDef;
  /** Agent physiquement en train d'utiliser la ressource. */
  occupant: string | null;
  /** Agent ayant réservé la ressource (en route). */
  reservedBy: string | null;
  /** Tick d'expiration de la réservation. */
  reservedUntil: number;
  /** File d'attente FIFO (ids d'agents). */
  queue: string[];
}

export type ResourceEvent =
  | { kind: "reserved"; resource: string; agent: string }
  | { kind: "released"; resource: string; agent: string }
  | { kind: "expired"; resource: string; agent: string }
  | { kind: "promoted"; resource: string; agent: string }
  | { kind: "left_queue"; resource: string; agent: string };

/**
 * Gestion des ressources partagées : réservation exclusive, occupation, files d'attente
 * FIFO, expiration des réservations (agent qui n'arrive jamais) et annulation.
 * Invariants : une ressource a au plus un occupant ; occupant et réservation appartiennent
 * au même agent ; un agent est au plus dans une file à la fois.
 */
export class ResourceManager {
  readonly byId = new Map<string, ResourceState>();
  readonly byType = new Map<ResourceType, ResourceState[]>();
  private events: ResourceEvent[] = [];
  /** Durée de validité d'une réservation (ticks). */
  reservationTtl: number;

  constructor(defs: ResourceDef[], reservationTtl = 1200) {
    this.reservationTtl = reservationTtl;
    const queues = new Map<string, string[]>();
    for (const def of defs) {
      // Les ressources d'un même `queueKey` partagent une file unique (ex. cabines de toilettes).
      const key = def.queueKey ?? def.id;
      let queue = queues.get(key);
      if (!queue) {
        queue = [];
        queues.set(key, queue);
      }
      const st: ResourceState = { def, occupant: null, reservedBy: null, reservedUntil: 0, queue };
      this.byId.set(def.id, st);
      const list = this.byType.get(def.type) ?? [];
      list.push(st);
      this.byType.set(def.type, list);
    }
  }

  get(id: string): ResourceState {
    const r = this.byId.get(id);
    if (!r) throw new Error(`Ressource inconnue : ${id}`);
    return r;
  }

  drainEvents(): ResourceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  isFree(id: string): boolean {
    const r = this.get(id);
    return r.occupant === null && r.reservedBy === null;
  }

  /** Disponible pour `agent` : libre, ou déjà réservée/occupée par lui. */
  isAvailableFor(id: string, agent: string): boolean {
    const r = this.get(id);
    return (r.occupant === null || r.occupant === agent) && (r.reservedBy === null || r.reservedBy === agent);
  }

  reserve(id: string, agent: string, tick: number, ttl = this.reservationTtl): boolean {
    const r = this.get(id);
    if (!this.isAvailableFor(id, agent)) return false;
    // Une ressource libre ne peut pas être prise par quelqu'un qui double la file.
    if (r.queue.length > 0 && r.queue[0] !== agent && r.reservedBy !== agent) return false;
    r.reservedBy = agent;
    r.reservedUntil = tick + ttl;
    this.removeFromQueue(id, agent, false);
    this.events.push({ kind: "reserved", resource: id, agent });
    return true;
  }

  /** L'agent est arrivé : la réservation devient une occupation. */
  occupy(id: string, agent: string): boolean {
    const r = this.get(id);
    if (r.reservedBy !== agent && !(r.reservedBy === null && r.occupant === null && r.queue.length === 0)) return false;
    if (r.occupant !== null && r.occupant !== agent) return false;
    r.occupant = agent;
    r.reservedBy = agent;
    r.reservedUntil = Number.POSITIVE_INFINITY;
    return true;
  }

  /** Libère la ressource (fin d'utilisation ou annulation). Promeut la tête de file. */
  release(id: string, agent: string, tick: number): void {
    const r = this.get(id);
    let changed = false;
    if (r.occupant === agent) {
      r.occupant = null;
      changed = true;
    }
    if (r.reservedBy === agent) {
      r.reservedBy = null;
      changed = true;
    }
    if (changed) {
      this.events.push({ kind: "released", resource: id, agent });
      this.promote(r, tick);
    }
  }

  enqueue(id: string, agent: string): number {
    const r = this.get(id);
    const i = r.queue.indexOf(agent);
    if (i >= 0) return i;
    r.queue.push(agent);
    return r.queue.length - 1;
  }

  queuePosition(id: string, agent: string): number {
    return this.get(id).queue.indexOf(agent);
  }

  removeFromQueue(id: string, agent: string, emit = true): void {
    const r = this.get(id);
    const i = r.queue.indexOf(agent);
    if (i >= 0) {
      r.queue.splice(i, 1);
      if (emit) this.events.push({ kind: "left_queue", resource: id, agent });
    }
  }

  /** Annule tout ce que détient un agent (réservations, occupations, files). */
  releaseAll(agent: string, tick: number): void {
    for (const r of this.byId.values()) {
      if (r.queue.includes(agent)) this.removeFromQueue(r.def.id, agent);
      if (r.occupant === agent || r.reservedBy === agent) this.release(r.def.id, agent, tick);
    }
  }

  private promote(r: ResourceState, tick: number): void {
    if (r.occupant !== null || r.reservedBy !== null) return;
    const next = r.queue.shift();
    if (next) {
      r.reservedBy = next;
      r.reservedUntil = tick + this.reservationTtl;
      this.events.push({ kind: "promoted", resource: r.def.id, agent: next });
    }
  }

  /** Expire les réservations dont l'agent n'est jamais arrivé. */
  update(tick: number): void {
    for (const r of this.byId.values()) {
      if (r.reservedBy !== null && r.occupant === null && tick > r.reservedUntil) {
        const agent = r.reservedBy;
        r.reservedBy = null;
        this.events.push({ kind: "expired", resource: r.def.id, agent });
        this.promote(r, tick);
      }
    }
  }

  /** Ressources d'un type, libres pour l'agent (hors ressources attitrées à d'autres). */
  freeOfType(type: ResourceType, agent: string): ResourceState[] {
    return (this.byType.get(type) ?? []).filter(
      (r) => (!r.def.owner || r.def.owner === agent) && this.isAvailableFor(r.def.id, agent) && r.queue.length === 0,
    );
  }

  ofType(type: ResourceType): ResourceState[] {
    return this.byType.get(type) ?? [];
  }

  /** Ressource du même pool de file (`queueKey`) réservée pour l'agent, s'il y en a une. */
  reservationInPool(id: string, agent: string): ResourceState | null {
    const key = this.get(id).def.queueKey ?? id;
    for (const r of this.byId.values()) {
      if ((r.def.queueKey ?? r.def.id) === key && r.reservedBy === agent) return r;
    }
    return null;
  }

  holdings(agent: string): string[] {
    const out: string[] = [];
    for (const r of this.byId.values()) if (r.occupant === agent || r.reservedBy === agent) out.push(r.def.id);
    return out;
  }
}
