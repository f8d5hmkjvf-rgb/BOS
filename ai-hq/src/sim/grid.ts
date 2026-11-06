import type { Tile } from "./types";

export const enum Cell {
  Floor = 0,
  Wall = 1,
  Furniture = 2,
  Void = 3,
}

/**
 * Grille de navigation. Les murs et le mobilier sont statiques ; les obstacles
 * dynamiques (portes fermées, objets temporaires) sont gérés par un compteur
 * par case pour permettre l'empilement.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  /** Identifiant de pièce par case (index dans `rooms`), -1 = aucune. */
  readonly roomIds: Int16Array;
  private readonly dynamic: Uint16Array;
  /** Incrémenté à chaque changement d'obstacle : permet d'invalider les chemins. */
  version = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height).fill(Cell.Void);
    this.roomIds = new Int16Array(width * height).fill(-1);
    this.dynamic = new Uint16Array(width * height);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Cell {
    if (!this.inBounds(x, y)) return Cell.Void;
    return this.cells[this.idx(x, y)] as Cell;
  }

  set(x: number, y: number, c: Cell): void {
    if (!this.inBounds(x, y)) return;
    this.cells[this.idx(x, y)] = c;
    this.version++;
  }

  /** Case franchissable en ignorant les obstacles dynamiques. */
  isStaticWalkable(x: number, y: number): boolean {
    return this.get(x, y) === Cell.Floor;
  }

  isWalkable(x: number, y: number): boolean {
    return this.isStaticWalkable(x, y) && this.dynamic[this.idx(x, y)] === 0;
  }

  addObstacle(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.dynamic[this.idx(x, y)]++;
    this.version++;
  }

  removeObstacle(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.dynamic[i] > 0) {
      this.dynamic[i]--;
      this.version++;
    }
  }

  hasDynamicObstacle(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.dynamic[this.idx(x, y)] > 0;
  }

  /** Case franchissable la plus proche (BFS), utilisée pour la récupération d'état invalide. */
  nearestWalkable(from: Tile, maxRadius = 64): Tile | null {
    const sx = Math.round(from.x);
    const sy = Math.round(from.y);
    if (this.isWalkable(sx, sy)) return { x: sx, y: sy };
    const seen = new Uint8Array(this.width * this.height);
    const queue: Tile[] = [];
    const cx = Math.min(Math.max(sx, 0), this.width - 1);
    const cy = Math.min(Math.max(sy, 0), this.height - 1);
    queue.push({ x: cx, y: cy });
    seen[this.idx(cx, cy)] = 1;
    for (let head = 0; head < queue.length; head++) {
      const t = queue[head];
      if (this.isWalkable(t.x, t.y)) return t;
      if (Math.abs(t.x - cx) + Math.abs(t.y - cy) > maxRadius) continue;
      const n: Tile[] = [
        { x: t.x + 1, y: t.y },
        { x: t.x - 1, y: t.y },
        { x: t.x, y: t.y + 1 },
        { x: t.x, y: t.y - 1 },
      ];
      for (const m of n) {
        if (!this.inBounds(m.x, m.y)) continue;
        const i = this.idx(m.x, m.y);
        if (seen[i]) continue;
        seen[i] = 1;
        queue.push(m);
      }
    }
    return null;
  }
}
