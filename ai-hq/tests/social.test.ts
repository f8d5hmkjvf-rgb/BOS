import { describe, expect, it } from "vitest";
import { compatibility, RelationshipGraph } from "@/sim/social";
import { Rng } from "@/sim/rng";
import { World } from "@/sim/engine";

const P = (e: number, a: number) => ({ extraversion: e, agreeableness: a, conscientiousness: 0.5, neuroticism: 0.2, openness: 0.5 });

describe("Relations sociales", () => {
  it("compatibilité bornée et symétrique", () => {
    const c1 = compatibility(P(0.9, 0.9), P(0.1, 0.3));
    expect(c1).toBe(compatibility(P(0.1, 0.3), P(0.9, 0.9)));
    expect(Math.abs(c1)).toBeLessThanOrEqual(1);
    expect(compatibility(P(0.5, 1), P(0.5, 1))).toBeGreaterThan(c1);
  });

  it("matrice symétrique, les conversations augmentent la familiarité", () => {
    const g = new RelationshipGraph(3);
    g.seed([P(0.5, 0.5), P(0.5, 0.5), P(0.5, 0.5)], ["tech", "tech", "ops"], new Rng(1));
    expect(g.get(0, 1)).toEqual(g.get(1, 0));
    expect(g.get(0, 1).familiarity).toBeGreaterThan(g.get(0, 2).familiarity - 0.25);
    const before = g.get(0, 2).familiarity;
    g.afterTalk(0, 2, P(0.5, 0.5), P(0.5, 0.5), 100, new Rng(2));
    expect(g.get(0, 2).familiarity).toBeGreaterThan(before);
    expect(g.get(0, 2).lastTalkTick).toBe(100);
  });

  it("pas de conversation aux sanitaires (vie privée)", () => {
    const w = new World({ seed: 13 });
    for (let i = 0; i < 8 * 3600; i++) {
      w.step();
      for (const a of w.agents) {
        if (a.mode !== "conversation") continue;
        const room = w.grid.roomIds[w.grid.idx(a.tile.x, a.tile.y)];
        expect(w.map.rooms[room]?.kind).not.toBe("toilets");
      }
    }
  }, 60_000);
});
