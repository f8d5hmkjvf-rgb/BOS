import { describe, expect, it } from "vitest";
import { World } from "@/sim/engine";
import { OrchestratorSync } from "@/components/sync";

describe("Pont orchestrateur → QG", () => {
  it("les statuts de tâches réelles pilotent l'état des agents", () => {
    const w = new World({ seed: 3 });
    const s = new OrchestratorSync(() => w);
    s.handle("task.updated", { taskId: "t1", kind: "execute", title: "Étude de marché", assignee: "mary", status: "running" });
    expect(w.byId.get("mary")!.realWork).toMatchObject({ status: "busy", taskTitle: "Étude de marché" });
    s.handle("task.updated", { taskId: "t1", kind: "execute", title: "Étude de marché", assignee: "mary", status: "awaiting_approval" });
    expect(w.byId.get("mary")!.realWork.status).toBe("awaiting_approval");
    s.handle("task.updated", { taskId: "t1", kind: "execute", title: "Étude de marché", assignee: "mary", status: "done" });
    expect(w.byId.get("mary")!.realWork.status).toBe("idle");
  });

  it("réunions et consultations : convocation, répliques et fin, y compris à la reconnexion", () => {
    const w = new World({ seed: 3 });
    const s = new OrchestratorSync(() => w);
    s.handle("snapshot", {
      tasks: [{ id: "t2", kind: "plan", title: "Plan", assignee: "gaspard", status: "running" }],
      conversations: [{ id: "c1", kind: "meeting", title: "Lancement", participants: ["gaspard", "hedy"], lines: [{ speaker: "gaspard", text: "Bonjour" }] }],
    });
    expect(w.byId.get("gaspard")!.realWork.status).toBe("busy");
    const m = w.meetings.find((x) => x.id === "c1")!;
    expect(m.external && m.queue).toEqual([{ speaker: "gaspard", text: "Bonjour" }]);
    s.handle("meeting.ended", { conversationId: "c1" });
    expect(m.ended).toBe(true);
    s.handle("consult.started", { conversationId: "c2", participants: ["alan", "grace"] });
    s.handle("consult.line", { conversationId: "c2", speaker: "alan", text: "Question" });
    expect(w.consults.c2.queue).toHaveLength(1);
  });
});
