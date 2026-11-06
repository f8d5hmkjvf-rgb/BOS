import type { Grid } from "./grid";
import type { Tile } from "./types";

export interface PathOptions {
  /** Cases supplémentaires à considérer comme bloquées (ex. agents immobiles). */
  isBlocked?: (x: number, y: number) => boolean;
  /** Coût additionnel par case (ex. éviter les zones encombrées). */
  extraCost?: (x: number, y: number) => number;
  /** Autorise les déplacements diagonaux (sans couper les coins). */
  diagonal?: boolean;
  /** Borne le nombre de nœuds explorés (garde-fou performance). */
  maxNodes?: number;
  /** Le but peut être bloqué (ex. une chaise de bureau occupée par soi-même). */
  allowBlockedGoal?: boolean;
}

const SQRT2 = Math.SQRT2;
const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Tas binaire minimal sur des indices de cases, trié par f puis h (départage déterministe). */
class MinHeap {
  private items: number[] = [];
  constructor(
    private f: Float64Array,
    private h: Float64Array,
  ) {}

  get size(): number {
    return this.items.length;
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a];
    const fb = this.f[b];
    if (fa !== fb) return fa < fb;
    const ha = this.h[a];
    const hb = this.h[b];
    if (ha !== hb) return ha < hb;
    return a < b;
  }

  push(n: number): void {
    const it = this.items;
    it.push(n);
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(it[i], it[p])) break;
      [it[i], it[p]] = [it[p], it[i]];
      i = p;
    }
  }

  pop(): number {
    const it = this.items;
    const top = it[0];
    const last = it.pop()!;
    if (it.length > 0) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && this.less(it[l], it[m])) m = l;
        if (r < it.length && this.less(it[r], it[m])) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m], it[i]];
        i = m;
      }
    }
    return top;
  }
}

function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max(ax, ay) + (SQRT2 - 1) * Math.min(ax, ay);
}

/**
 * A* sur grille, 8 directions sans coupure de coin, heuristique octile (admissible).
 * Retourne la liste des cases du départ (exclu) jusqu'au but (inclus), ou null si inatteignable.
 * Un chemin vide [] signifie qu'on est déjà sur le but.
 */
export function findPath(grid: Grid, start: Tile, goal: Tile, opts: PathOptions = {}): Tile[] | null {
  const { isBlocked, extraCost, diagonal = true, maxNodes = 20000, allowBlockedGoal = false } = opts;
  const W = grid.width;
  const sx = start.x;
  const sy = start.y;
  const gx = goal.x;
  const gy = goal.y;
  if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];

  const passable = (x: number, y: number): boolean => {
    if (!grid.isWalkable(x, y)) return false;
    if (isBlocked && isBlocked(x, y)) return x === gx && y === gy && allowBlockedGoal;
    return true;
  };
  if (!grid.isWalkable(gx, gy)) return null;
  if (isBlocked && isBlocked(gx, gy) && !allowBlockedGoal) return null;

  const N = W * grid.height;
  const g = new Float64Array(N).fill(Infinity);
  const f = new Float64Array(N).fill(Infinity);
  const h = new Float64Array(N);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap(f, h);

  const s = sy * W + sx;
  const goalIdx = gy * W + gx;
  g[s] = 0;
  h[s] = octile(gx - sx, gy - sy);
  f[s] = h[s];
  heap.push(s);
  let explored = 0;

  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goalIdx) {
      const path: Tile[] = [];
      let n = cur;
      while (n !== s) {
        path.push({ x: n % W, y: (n / W) | 0 });
        n = came[n];
      }
      path.reverse();
      return path;
    }
    closed[cur] = 1;
    if (++explored > maxNodes) return null;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const dirCount = diagonal ? 8 : 4;
    for (let d = 0; d < dirCount; d++) {
      const [dx, dy, cost] = DIRS[d];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      if (!passable(nx, ny)) continue;
      // Pas de coupure de coin : les deux cases orthogonales doivent être libres.
      if (dx !== 0 && dy !== 0) {
        if (!grid.isWalkable(cx + dx, cy) || !grid.isWalkable(cx, cy + dy)) continue;
        if (isBlocked && (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy))) continue;
      }
      const ng = g[cur] + cost + (extraCost ? extraCost(nx, ny) : 0);
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        h[ni] = octile(gx - nx, gy - ny);
        f[ni] = ng + h[ni];
        heap.push(ni);
      }
    }
  }
  return null;
}

/** Longueur d'un chemin (coût géométrique). */
export function pathLength(start: Tile, path: Tile[]): number {
  let len = 0;
  let px = start.x;
  let py = start.y;
  for (const t of path) {
    len += Math.hypot(t.x - px, t.y - py);
    px = t.x;
    py = t.y;
  }
  return len;
}
