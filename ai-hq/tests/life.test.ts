import { afterEach, describe, expect, it, vi } from "vitest";
import { World } from "@/sim/engine";

describe("QG vivant (sans mission IA)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("une journée complète sans mission : 29 agents visibles et toutes les routines de vie, sans aucun appel réseau", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const w = new World({ seed: 21 });
    w.proposeIntents = false;
    const seen = new Set<string>();
    let maxVisible = 0;
    for (let i = 0; i < 11 * 3600; i++) {
      w.step();
      if (i % 30 === 0) {
        maxVisible = Math.max(maxVisible, w.agents.filter((a) => !a.hidden).length);
        for (const a of w.agents) if (a.task) seen.add(a.task.activity);
      }
    }
    expect(maxVisible).toBe(29);
    for (const act of ["work", "toilet", "coffee", "eat", "water", "meeting"]) expect(seen).toContain(act);
    const kinds = new Set(w.events.map((e) => e.kind));
    expect(kinds.has("social")).toBe(true);
    // Le simulateur n'appelle jamais le réseau : zéro coût API pour la vie du QG.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(w.gate.all()).toHaveLength(0);
  }, 60_000);

  it("machine à café interactive : une pause offerte envoie les collègues les plus proches faire la queue", () => {
    const w = new World({ seed: 8 });
    w.runTicks(Math.round(10.5 * 3600 - w.sec));
    const machine = w.rm.get("coffee:0");
    const invited = w.invite("coffee", machine.def.tile, 3);
    expect(invited.length).toBeGreaterThan(0);
    let atMachine = false;
    for (let i = 0; i < 3000 && !atMachine; i++) {
      w.step();
      atMachine = w.rm.ofType("coffee_machine").some((r) => r.occupant && invited.includes(r.occupant));
    }
    expect(atMachine).toBe(true);
    // Tasse en main ensuite.
    for (let i = 0; i < 3000 && !invited.some((id) => w.byId.get(id)!.holding === "cup"); i++) w.step();
    expect(invited.some((id) => w.byId.get(id)!.holding === "cup")).toBe(true);
  }, 30_000);

  it("trois jours consécutifs : invariants de collision et aucune récupération forcée", () => {
    const w = new World({ seed: 5 });
    let overlaps = 0;
    for (let i = 0; i < 3 * 40000 && w.day < 3; i++) {
      w.step();
      if (i % 10) continue;
      const seen = new Set<string>();
      for (const a of w.agents) {
        if (a.mode === "off_duty" || a.squeezing) continue;
        const k = `${a.tile.x},${a.tile.y}`;
        if (seen.has(k)) overlaps++;
        seen.add(k);
      }
    }
    expect(w.day).toBeGreaterThanOrEqual(2);
    expect(overlaps).toBe(0);
    expect(w.stats.recoveries).toBe(0);
  }, 120_000);
});
