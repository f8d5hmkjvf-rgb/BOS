import { describe, expect, it } from "vitest";
import { World } from "@/sim/engine";
import { Cell } from "@/sim/grid";

/** Simule jusqu'à `hour` en vérifiant les invariants de collision à chaque pas. */
function runChecked(w: World, ticks: number) {
  let overlaps = 0;
  let wallHits = 0;
  let maxSqueeze = 0;
  const squeezeRun = new Map<string, number>();
  for (let i = 0; i < ticks; i++) {
    w.step();
    const seen = new Set<string>();
    for (const a of w.agents) {
      if (a.mode === "off_duty") continue;
      // Jamais dans un mur ni dans un meuble, même entre deux cases.
      for (const [x, y] of [
        [Math.floor(a.pos.x + 0.5), Math.floor(a.pos.y + 0.5)],
        [a.tile.x, a.tile.y],
      ])
        if (w.grid.get(x, y) !== Cell.Floor) wallHits++;
      // Pas de téléportation : déplacement par pas ≤ vitesse.
      expect(Math.hypot(a.pos.x - a.prevPos.x, a.pos.y - a.prevPos.y)).toBeLessThanOrEqual(a.speed + 1e-6);
      if (a.squeezing) {
        squeezeRun.set(a.id, (squeezeRun.get(a.id) ?? 0) + 1);
        maxSqueeze = Math.max(maxSqueeze, squeezeRun.get(a.id)!);
        continue;
      }
      squeezeRun.delete(a.id);
      const k = `${a.tile.x},${a.tile.y}`;
      if (seen.has(k)) overlaps++;
      seen.add(k);
    }
  }
  return { overlaps, wallHits, maxSqueeze };
}

describe("Simulation complète (29 agents)", () => {
  it("contient 29 agents, chacun avec un bureau attitré et 28 relations", () => {
    const w = new World({ seed: 7 });
    expect(w.agents).toHaveLength(29);
    for (const a of w.agents) expect(w.rm.get(`desk:${a.id}`).def.owner).toBe(a.id);
    const r = w.rel.get(0, 28);
    expect(r.affinity).toBeGreaterThanOrEqual(-1);
    expect(r.familiarity).toBeGreaterThanOrEqual(0);
  });

  it("une journée entière : collisions respectées, pas de mur traversé, besoins satisfaits", () => {
    const w = new World({ seed: 11 });
    const res = runChecked(w, 11 * 3600);
    expect(res.wallHits).toBe(0);
    expect(res.overlaps).toBe(0);
    expect(res.maxSqueeze).toBeLessThan(200);
    expect(w.stats.recoveries).toBe(0);
    const kinds = new Set(w.events.map((e) => e.kind));
    expect(kinds.has("social")).toBe(true);
    expect(kinds.has("meeting")).toBe(true);
    // Tous les agents sont rentrés chez eux (ou en train de partir).
    expect(w.agents.every((a) => a.mode === "off_duty" || a.mode === "leaving")).toBe(true);
    // Personne n'a fini la journée avec une vessie à 100 %.
    expect(w.agents.filter((a) => a.needs.bladder >= 0.99).length).toBe(0);
  }, 60_000);

  it("les cabines ne sont jamais occupées par deux personnes et l'occupant est masqué, porte fermée", () => {
    const w = new World({ seed: 3 });
    let seenOccupied = false;
    for (let i = 0; i < 6 * 3600; i++) {
      w.step();
      for (const r of w.rm.ofType("toilet_stall")) {
        if (!r.occupant) continue;
        const a = w.byId.get(r.occupant)!;
        if (a.task?.phase === "performing") {
          seenOccupied = true;
          expect(a.hidden).toBe(true);
          expect(w.grid.hasDynamicObstacle(r.def.doorTile!.x, r.def.doorTile!.y)).toBe(true);
          const inside = w.agents.filter((x) => x.tile.x === r.def.tile.x && x.tile.y === r.def.tile.y && x.mode !== "off_duty");
          expect(inside).toHaveLength(1);
        }
      }
    }
    expect(seenOccupied).toBe(true);
  }, 60_000);

  it("est déterministe pour une même graine", () => {
    const a = new World({ seed: 99 });
    const b = new World({ seed: 99 });
    a.runTicks(4000);
    b.runTicks(4000);
    expect(a.agents.map((x) => [x.pos, x.mode, x.needs])).toEqual(b.agents.map((x) => [x.pos, x.mode, x.needs]));
  });

  it("le pas fixe ne dépend pas de la cadence d'affichage", () => {
    const a = new World({ seed: 5 });
    const b = new World({ seed: 5 });
    for (let i = 0; i < 200; i++) a.advance(50); // 20 fps
    for (let i = 0; i < 600; i++) b.advance(50 / 3); // 60 fps
    expect(a.tick).toBe(b.tick);
    expect(a.agents.map((x) => x.pos)).toEqual(b.agents.map((x) => x.pos));
  });

  it("pause, x2 et x5", () => {
    const w = new World({ seed: 1 });
    w.setSpeed(0);
    expect(w.advance(1000)).toBe(0);
    w.setSpeed(2);
    const n2 = w.advance(100);
    w.setSpeed(5);
    const n5 = w.advance(100);
    expect(n2).toBe(4);
    expect(n5).toBe(10);
  });

  it("l'accélération est bornée (pas de spirale de la mort)", () => {
    const w = new World({ seed: 1 });
    w.setSpeed(5);
    expect(w.advance(10_000)).toBeLessThanOrEqual(24);
  });
});
