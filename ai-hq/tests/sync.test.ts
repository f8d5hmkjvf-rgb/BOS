import { describe, expect, it } from "vitest";
import { World } from "@/sim/engine";

/** Monde à 10 h, tout le monde au bureau. */
function morning(seed = 31) {
  const w = new World({ seed });
  w.proposeIntents = false;
  w.runTicks(Math.round(10 * 3600 - w.sec));
  return w;
}

describe("Synchronisation missions réelles → animations du QG", () => {
  it("réunion convoquée par Gaspard : les participants quittent leur bureau, s'assoient en salle Atlas, et les répliques IA sont jouées", () => {
    const w = morning();
    const parts = ["gaspard", "mary", "frances", "radia"];
    w.convokeMeeting("c_1", "Réunion de lancement", parts);
    const room = w.map.rooms.find((r) => r.kind === "meeting")!;
    let allSeated = false;
    for (let i = 0; i < 2500 && !allSeated; i++) {
      w.step();
      allSeated = parts.every((id) => {
        const a = w.byId.get(id)!;
        const inRoom = a.tile.x >= room.x0 && a.tile.x <= room.x1 && a.tile.y >= room.y0 && a.tile.y <= room.y1;
        return inRoom && a.task?.activity === "meeting" && a.task.phase === "performing" && a.anim === "meeting";
      });
    }
    expect(allSeated).toBe(true);
    const m = w.meetings.find((x) => x.id === "c_1")!;
    // Démarrage dès que les participants sont assis.
    for (let i = 0; i < 300 && m.status !== "in_progress"; i++) w.step();
    expect(m.status).toBe("in_progress");
    w.meetingLine("c_1", "gaspard", "Objectif : lancer l'offre en deux semaines.");
    w.meetingLine("c_1", "mary", "Je propose de cibler les indépendants.");
    w.step();
    expect(w.byId.get("gaspard")!.bubble?.text).toContain("Objectif");
    w.endExternalMeeting("c_1");
    for (let i = 0; i < 1000 && m.status !== "done"; i++) w.step();
    expect(m.status).toBe("done");
    expect(w.events.some((e) => e.text.includes("indépendants"))).toBe(true);
    // Les participants retournent travailler.
    w.runTicks(1500);
    expect(parts.filter((id) => w.byId.get(id)!.task?.activity === "meeting")).toHaveLength(0);
  }, 30_000);

  it("une mission en cours ramène l'agent à son bureau et l'y fait travailler", () => {
    const w = morning(5);
    const a = w.byId.get("grace")!;
    w.startTask(a, "rest");
    w.setRealWork("grace", { status: "busy", taskTitle: "API de paiement" });
    let working = false;
    for (let i = 0; i < 2000 && !working; i++) {
      w.step();
      const desk = w.rm.get("desk:grace").def.tile;
      working = a.task?.activity === "work" && a.task.phase === "performing" && a.tile.x === desk.x && a.tile.y === desk.y && a.anim === "work";
    }
    expect(working).toBe(true);
  }, 30_000);

  it("consultation : l'agent va au poste du collègue, l'échange réel est joué, puis il repart", () => {
    const w = morning(9);
    w.startConsult("c_9", "mary", "radia");
    const mary = w.byId.get("mary")!;
    const radia = w.byId.get("radia")!;
    let arrived = false;
    for (let i = 0; i < 2500 && !arrived; i++) {
      w.step();
      arrived = mary.task?.activity === "consult" && mary.task.phase === "performing";
    }
    expect(arrived).toBe(true);
    expect(Math.max(Math.abs(mary.tile.x - radia.tile.x), Math.abs(mary.tile.y - radia.tile.y))).toBeLessThanOrEqual(2);
    w.consultLine("c_9", "mary", "Qui est la cible ?");
    w.consultLine("c_9", "radia", "Les indépendants pressés.");
    w.endConsult("c_9");
    for (let i = 0; i < 1500 && w.consults["c_9"]; i++) w.step();
    expect(w.consults["c_9"]).toBeUndefined();
    expect(w.events.some((e) => e.text.includes("indépendants pressés"))).toBe(true);
    expect(mary.task?.activity).not.toBe("consult");
  }, 30_000);

  it("un agent rentré chez lui revient au bureau si une vraie mission l'attend", () => {
    const w = new World({ seed: 4 });
    const a = w.byId.get("hugo")!;
    // Avancer jusqu'à ce qu'Hugo soit rentré chez lui le soir du premier jour.
    for (let i = 0; i < 40000 && !(a.mode === "off_duty" && w.hour > 17); i++) w.step();
    expect(a.mode).toBe("off_duty");
    expect(w.day).toBe(0);
    w.setRealWork("hugo", { status: "busy", taskTitle: "Clôture budgétaire" });
    let atDesk = false;
    for (let i = 0; i < 3000 && !atDesk; i++) {
      w.step();
      atDesk = a.task?.activity === "work" && a.task.phase === "performing";
    }
    expect(atDesk).toBe(true);
    w.setRealWork("hugo", { status: "idle", taskTitle: null });
    for (let i = 0; i < 3000 && a.mode !== "off_duty"; i++) w.step();
    expect(a.mode).toBe("off_duty");
  }, 30_000);
});
