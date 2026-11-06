import type { Personality, Relationship } from "./types";
import type { Rng } from "./rng";

/** Compatibilité de personnalité dans [-1, 1]. */
export function compatibility(a: Personality, b: Personality): number {
  const agree = (a.agreeableness + b.agreeableness) / 2;
  const extraGap = Math.abs(a.extraversion - b.extraversion);
  const openGap = Math.abs(a.openness - b.openness);
  const nervous = (a.neuroticism + b.neuroticism) / 2;
  return Math.max(-1, Math.min(1, agree * 1.2 - extraGap * 0.5 - openGap * 0.3 - nervous * 0.4));
}

/** Matrice de relations NxN (stockage plat, symétrique). */
export class RelationshipGraph {
  readonly n: number;
  readonly affinity: Float32Array;
  readonly familiarity: Float32Array;
  readonly lastTalk: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.affinity = new Float32Array(n * n);
    this.familiarity = new Float32Array(n * n);
    this.lastTalk = new Float64Array(n * n).fill(-1e9);
  }

  private i(a: number, b: number): number {
    return a < b ? a * this.n + b : b * this.n + a;
  }

  get(a: number, b: number): Relationship {
    const i = this.i(a, b);
    return { affinity: this.affinity[i], familiarity: this.familiarity[i], lastTalkTick: this.lastTalk[i] };
  }

  set(a: number, b: number, r: Relationship): void {
    const i = this.i(a, b);
    this.affinity[i] = Math.max(-1, Math.min(1, r.affinity));
    this.familiarity[i] = Math.max(0, Math.min(1, r.familiarity));
    this.lastTalk[i] = r.lastTalkTick;
  }

  /** Initialisation : collègues de département déjà familiers, affinité selon compatibilité. */
  seed(personalities: Personality[], departments: string[], rng: Rng): void {
    for (let a = 0; a < this.n; a++)
      for (let b = a + 1; b < this.n; b++) {
        const same = departments[a] === departments[b];
        const comp = compatibility(personalities[a], personalities[b]);
        this.set(a, b, {
          affinity: comp * 0.4 + (same ? 0.15 : 0) + (rng.next() - 0.5) * 0.3,
          familiarity: (same ? 0.45 : 0.08) + rng.next() * 0.2,
          lastTalkTick: -1e9,
        });
      }
  }

  /** Effet d'une conversation. */
  afterTalk(a: number, b: number, pa: Personality, pb: Personality, tick: number, rng: Rng): number {
    const r = this.get(a, b);
    const delta = 0.04 * compatibility(pa, pb) + (rng.next() - 0.45) * 0.04;
    this.set(a, b, { affinity: r.affinity + delta, familiarity: r.familiarity + 0.04, lastTalkTick: tick });
    return delta;
  }

  /** Meilleurs amis d'un agent (affinité décroissante). */
  friendsOf(a: number, count: number): number[] {
    const list: [number, number][] = [];
    for (let b = 0; b < this.n; b++) if (b !== a) list.push([b, this.get(a, b).affinity]);
    list.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    return list.slice(0, count).map(([b]) => b);
  }
}
