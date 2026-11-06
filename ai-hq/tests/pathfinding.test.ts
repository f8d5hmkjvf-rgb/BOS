import { describe, expect, it } from "vitest";
import { Cell, Grid } from "@/sim/grid";
import { findPath, pathLength } from "@/sim/pathfinding";

function gridFrom(rows: string[]): Grid {
  const g = new Grid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => g.set(x, y, c === "#" ? Cell.Wall : c === "F" ? Cell.Furniture : Cell.Floor)));
  return g;
}

describe("A*", () => {
  it("trouve le chemin le plus court en ligne droite", () => {
    const g = gridFrom([".....", ".....", "....."]);
    const p = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(p).toHaveLength(4);
    expect(p.at(-1)).toEqual({ x: 4, y: 1 });
  });

  it("retourne [] si départ = arrivée et null si inatteignable", () => {
    const g = gridFrom(["..#..", "..#..", "..#.."]);
    expect(findPath(g, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it("contourne les murs et le mobilier sans jamais les traverser", () => {
    const g = gridFrom([".......", ".####F.", ".#...#.", ".#.#.#.", "...#..."]);
    const p = findPath(g, { x: 2, y: 2 }, { x: 6, y: 4 })!;
    expect(p).not.toBeNull();
    for (const t of p) expect(g.isWalkable(t.x, t.y)).toBe(true);
  });

  it("ne coupe jamais un coin en diagonale", () => {
    const g = gridFrom(["..", "#."]);
    // (0,0) → (1,1) : la diagonale frôlerait le mur en (0,1) → interdit.
    const p = findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 })!;
    expect(p).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    // Chaque pas est adjacent au précédent.
    let prev = { x: 0, y: 0 };
    for (const t of p) {
      expect(Math.max(Math.abs(t.x - prev.x), Math.abs(t.y - prev.y))).toBe(1);
      prev = t;
    }
  });

  it("utilise les diagonales (coût octile optimal)", () => {
    const g = gridFrom([".....", ".....", ".....", ".....", "....."]);
    const p = findPath(g, { x: 0, y: 0 }, { x: 4, y: 4 })!;
    expect(p).toHaveLength(4);
    expect(pathLength({ x: 0, y: 0 }, p)).toBeCloseTo(4 * Math.SQRT2);
  });

  it("respecte les obstacles dynamiques et leur retrait", () => {
    const g = gridFrom(["...", "...", "..."]);
    g.addObstacle(1, 0);
    g.addObstacle(1, 1);
    g.addObstacle(1, 2);
    expect(findPath(g, { x: 0, y: 1 }, { x: 2, y: 1 })).toBeNull();
    g.removeObstacle(1, 2);
    const p = findPath(g, { x: 0, y: 1 }, { x: 2, y: 1 })!;
    expect(p.some((t) => t.x === 1 && t.y === 2)).toBe(true);
  });

  it("évite les cases bloquées par prédicat (agents immobiles)", () => {
    const g = gridFrom([".....", ".....", "....."]);
    const p = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 }, { isBlocked: (x, y) => x === 2 && y === 1 })!;
    expect(p.some((t) => t.x === 2 && t.y === 1)).toBe(false);
  });

  it("est déterministe", () => {
    const g = gridFrom(["......", "......", "......", "......"]);
    const a = findPath(g, { x: 0, y: 0 }, { x: 5, y: 3 });
    const b = findPath(g, { x: 0, y: 0 }, { x: 5, y: 3 });
    expect(a).toEqual(b);
  });

  it("borne le nombre de nœuds explorés", () => {
    const g = gridFrom(Array.from({ length: 50 }, () => ".".repeat(50)));
    expect(findPath(g, { x: 0, y: 0 }, { x: 49, y: 49 }, { maxNodes: 10 })).toBeNull();
  });
});
