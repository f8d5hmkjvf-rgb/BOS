import { describe, expect, it } from "vitest";
import { Agent, MODE_TRANSITIONS, PHASE_TRANSITIONS } from "@/sim/agent";
import { buildRoster } from "@/sim/roster";
import { defaultNeeds } from "@/sim/needs";
import { scoreActivities, type UtilityInput } from "@/sim/utility";

const profile = buildRoster(1)[3];
const mk = () => new Agent(0, profile, defaultNeeds(), 0.12);

describe("Machine à états hiérarchique", () => {
  it("accepte le cycle de vie complet d'une journée", () => {
    const a = mk();
    a.setMode("arriving", 1);
    a.setMode("deciding", 2);
    a.setMode("task", 3);
    a.task = { activity: "coffee", step: 0, phase: "navigating", resourceId: null, performUntil: 0, queuedAt: 0, lastTile: null, remaining: 0 };
    a.setPhase("queueing");
    a.setPhase("navigating");
    a.setPhase("performing");
    a.setMode("conversation", 4);
    a.setMode("task", 5);
    a.setMode("leaving", 6);
    a.setMode("off_duty", 7);
    expect(a.mode).toBe("off_duty");
    expect(a.history.length).toBeGreaterThan(0);
  });

  it("refuse les transitions interdites", () => {
    const a = mk();
    expect(() => a.setMode("task", 1)).toThrow(/interdite/);
    a.setMode("arriving", 1);
    expect(() => a.setMode("conversation", 2)).toThrow();
    a.setMode("deciding", 2);
    a.setMode("task", 3);
    a.task = { activity: "work", step: 0, phase: "performing", resourceId: null, performUntil: 0, queuedAt: 0, lastTile: null, remaining: 0 };
    expect(() => a.setPhase("queueing")).toThrow(/Phase interdite/);
  });

  it("le graphe de transitions est cohérent (chaque état cible existe)", () => {
    for (const targets of Object.values(MODE_TRANSITIONS)) for (const t of targets) expect(MODE_TRANSITIONS).toHaveProperty(t);
    for (const targets of Object.values(PHASE_TRANSITIONS)) for (const t of targets) expect(PHASE_TRANSITIONS).toHaveProperty(t);
  });
});

describe("Utility AI", () => {
  const base = (over: Partial<UtilityInput> = {}): UtilityInput => ({
    needs: defaultNeeds(),
    personality: profile.personality,
    habits: { ...profile.habits, lunchHour: 12.5 },
    realWork: { status: "idle", taskTitle: null, updatedAt: 0 },
    hour: 10,
    leaveHour: 18,
    current: "work",
    recentCoffees: 0,
    meetingPending: false,
    distance: {},
    queue: {},
    cooldown: new Set(),
    noise: () => 0.5,
    ...over,
  });

  it("travaille quand tous les besoins sont satisfaits", () => {
    expect(scoreActivities(base())[0].activity).toBe("work");
  });

  it("va aux toilettes quand la vessie est pleine", () => {
    expect(scoreActivities(base({ needs: { ...defaultNeeds(), bladder: 0.95 } }))[0].activity).toBe("toilet");
  });

  it("déjeune à l'heure du déjeuner quand il a faim, pas à 10h", () => {
    const hungry = { ...defaultNeeds(), hunger: 0.7 };
    expect(scoreActivities(base({ needs: hungry, hour: 12.5 }))[0].activity).toBe("eat");
    expect(scoreActivities(base({ needs: hungry, hour: 10 }))[0].activity).not.toBe("eat");
  });

  it("une réunion convoquée l'emporte sur le travail", () => {
    expect(scoreActivities(base({ meetingPending: true }))[0].activity).toBe("meeting");
  });

  it("une ressource saturée est exclue", () => {
    const s = scoreActivities(base({ needs: { ...defaultNeeds(), thirst: 1 }, queue: { water: Infinity } }));
    expect(s.find((x) => x.activity === "water")!.score).toBe(-Infinity);
    expect(s[0].activity).not.toBe("water");
  });

  it("la file d'attente pénalise l'activité", () => {
    const n = { ...defaultNeeds(), energy: 0.2 };
    const free = scoreActivities(base({ needs: n, queue: { coffee: 0 } })).find((x) => x.activity === "coffee")!.score;
    const busy = scoreActivities(base({ needs: n, queue: { coffee: 3 } })).find((x) => x.activity === "coffee")!.score;
    expect(busy).toBeLessThan(free);
  });

  it("rentre chez soi après l'heure de départ", () => {
    expect(scoreActivities(base({ hour: 18.5 }))[0].activity).toBe("leave");
  });
});
