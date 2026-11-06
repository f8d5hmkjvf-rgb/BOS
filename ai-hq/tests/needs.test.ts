import { describe, expect, it } from "vitest";
import { applyEffect, coffeeEffect, defaultNeeds, NEED_IDS, tickNeeds, type NeedContext } from "@/sim/needs";

const ctx = (over: Partial<NeedContext> = {}): NeedContext => ({
  activity: "work",
  personality: { extraversion: 0.5, agreeableness: 0.5, conscientiousness: 0.5, neuroticism: 0.4, openness: 0.5 },
  realBlocked: false,
  realBusy: false,
  recentCoffees: 0,
  ...over,
});

describe("Besoins", () => {
  it("la vessie, la faim et la soif augmentent avec le temps simulé", () => {
    const n0 = defaultNeeds();
    const n1 = tickNeeds(n0, 1, ctx());
    expect(n1.bladder).toBeGreaterThan(n0.bladder);
    expect(n1.hunger).toBeGreaterThan(n0.hunger);
    expect(n1.thirst).toBeGreaterThan(n0.thirst);
    expect(n1.energy).toBeLessThan(n0.energy);
  });

  it("évolue proportionnellement au temps (pas fixe cohérent)", () => {
    const n0 = defaultNeeds();
    let a = n0;
    for (let i = 0; i < 360; i++) a = tickNeeds(a, 10 / 3600, ctx());
    const b = tickNeeds(n0, 1, ctx());
    expect(a.bladder).toBeCloseTo(b.bladder, 2);
  });

  it("reste toujours borné dans [0, 1]", () => {
    let n = defaultNeeds();
    for (let i = 0; i < 100; i++) n = tickNeeds(n, 1, ctx({ realBlocked: true }));
    for (const id of NEED_IDS) {
      expect(n[id]).toBeGreaterThanOrEqual(0);
      expect(n[id]).toBeLessThanOrEqual(1);
    }
    n = applyEffect(n, { bladder: -5, energy: 5 });
    expect(n.bladder).toBe(0);
    expect(n.energy).toBe(1);
  });

  it("le repos fait remonter l'énergie et baisser le stress", () => {
    const n0 = { ...defaultNeeds(), energy: 0.3, stress: 0.6 };
    const n1 = tickNeeds(n0, 0.5, ctx({ activity: "rest" }));
    expect(n1.energy).toBeGreaterThan(n0.energy);
    expect(n1.stress).toBeLessThan(n0.stress);
  });

  it("une mission réelle bloquée augmente le stress", () => {
    const n0 = defaultNeeds();
    expect(tickNeeds(n0, 1, ctx({ realBlocked: true })).stress).toBeGreaterThan(tickNeeds(n0, 1, ctx()).stress);
  });

  it("le café a un effet modéré et décroissant, et il est diurétique", () => {
    const e0 = coffeeEffect(0);
    const e2 = coffeeEffect(2);
    expect(e0.energy!).toBeLessThanOrEqual(0.2);
    expect(e2.energy!).toBeLessThan(e0.energy!);
    expect(e0.bladder!).toBeGreaterThan(0);
  });
});
