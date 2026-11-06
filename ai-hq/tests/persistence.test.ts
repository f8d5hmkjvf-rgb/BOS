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
    const full = snap.full!.agents.find((a) => a.id === victim.id)!;
    full.tile = { x: 0, y: 0 }; // coin de mur
    full.pos = { x: 0, y: 0 };
    const r = World.restore(snap);
    const a = r.byId.get(victim.id)!;
    expect(r.grid.isWalkable(a.tile.x, a.tile.y)).toBe(true);
    expect(r.events.some((e) => e.kind === "recovery")).toBe(true);
  });

  it("reprise exacte : sauvegarder puis recharger donne la même suite qu'une simulation continue", () => {
    const continuous = new World({ seed: 77 });
    continuous.runTicks(9000);
    const half = new World({ seed: 77 });
    half.runTicks(4500);
    // Aller-retour JSON, comme vers PostgreSQL.
    const restored = World.restore(validateSnapshot(JSON.parse(JSON.stringify(half.snapshot()))));
    restored.runTicks(4500);
    const view = (w: World) => w.agents.map((a) => [a.id, a.pos, a.mode, a.task?.activity ?? null, a.task?.phase ?? null, a.anim, a.holding, a.needs]);
    expect(view(restored)).toEqual(view(continuous));
    expect([...restored.occ]).toEqual([...continuous.occ]);
  }, 30_000);

  it("sauvegarde en pleine activité : tâches, files d'attente, conversations et réunions IA conservées", () => {
    const w = new World({ seed: 12 });
    w.runTicks(Math.round(10.2 * 3600 - w.sec));
    w.convokeMeeting("c_x", "Lancement", ["gaspard", "mary", "frances"]);
    w.meetingLine("c_x", "gaspard", "Bonjour à tous.");
    w.startConsult("c_y", "alan", "grace");
    w.runTicks(300);
    const r = World.restore(validateSnapshot(JSON.parse(JSON.stringify(w.snapshot()))));
    expect(r.meetings.find((m) => m.id === "c_x")).toEqual(w.meetings.find((m) => m.id === "c_x"));
    expect(r.consults).toEqual(w.consults);
    for (const a of w.agents) {
      const b = r.byId.get(a.id)!;
      expect(b.task).toEqual(a.task);
      expect(b.mode).toBe(a.mode);
      expect(b.conversationWith).toBe(a.conversationWith);
    }
    for (const [id, res] of w.rm.byId) {
      const o = r.rm.get(id);
      expect([o.occupant, o.reservedBy, o.queue]).toEqual([res.occupant, res.reservedBy, res.queue]);
    }
  }, 30_000);

  it("rejette une sauvegarde corrompue", () => {
    expect(() => validateSnapshot({ version: 1, agents: "nope" })).toThrow();
    expect(() => validateSnapshot(null)).toThrow();
  });
});
