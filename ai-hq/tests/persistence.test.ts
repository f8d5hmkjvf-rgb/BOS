import { describe, expect, it } from "vitest";
import { World } from "@/sim/engine";
import { MemorySaveAdapter } from "@/persistence/adapters";
import { validateSnapshot } from "@/persistence/schema";

describe("Sauvegarde et chargement", () => {
  it("restaure positions, besoins, relations et horloge", async () => {
    const w = new World({ seed: 21 });
    w.runTicks(2 * 3600);
    const snap = w.snapshot();
    const store = new MemorySaveAdapter();
    await store.save("slot1", snap);
    const loaded = await store.load("slot1");
    expect(loaded).not.toBeNull();
    const r = World.restore(validateSnapshot(JSON.parse(JSON.stringify(loaded))));
    expect(r.tick).toBe(w.tick);
    expect(r.sec).toBe(w.sec);
    for (const a of w.agents) {
      const b = r.byId.get(a.id)!;
      expect(b.needs.bladder).toBeCloseTo(a.needs.bladder, 6);
      if (a.mode !== "off_duty") expect(b.tile).toEqual(a.tile);
    }
    expect(r.rel.get(2, 9).affinity).toBeCloseTo(w.rel.get(2, 9).affinity, 5);
    // La simulation reprend sans erreur après chargement.
    r.runTicks(2000);
    expect(r.stats.recoveries).toBe(0);
  }, 30_000);

  it("récupère proprement une position invalide (dans un mur)", () => {
    const w = new World({ seed: 2 });
    w.runTicks(3000);
    const snap = w.snapshot();
    const victim = snap.agents.find((a) => a.onDuty)!;
    victim.x = 0;
    victim.y = 0; // coin de mur
    const r = World.restore(snap);
    const a = r.byId.get(victim.id)!;
    expect(r.grid.isWalkable(a.tile.x, a.tile.y)).toBe(true);
    expect(r.events.some((e) => e.kind === "recovery")).toBe(true);
  });

  it("rejette une sauvegarde corrompue", () => {
    expect(() => validateSnapshot({ version: 1, agents: "nope" })).toThrow();
    expect(() => validateSnapshot(null)).toThrow();
  });
});
