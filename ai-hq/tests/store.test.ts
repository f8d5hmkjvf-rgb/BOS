import { afterAll, describe, expect, it } from "vitest";
import { closeAll } from "@/orchestrator/db";
import { freshStore, TEST_DB } from "./helpers/db";

describe.skipIf(!TEST_DB)("Persistance des missions (PostgreSQL réel)", () => {
  afterAll(closeAll);

  it("crée une mission avec sa tâche de planification pour Gaspard", async () => {
    const s = await freshStore();
    const m = await s.createMission("Lancer une newsletter", 2, "gaspard");
    const tasks = await s.tasksOf(m.id);
    expect(m.status).toBe("planning");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "plan", assignee: "gaspard", status: "pending" });
    expect((await s.eventsSince(0)).map((e) => e.kind)).toContain("mission.created");
  });

  it("résout les dépendances : une tâche bloquée devient prête quand ses prérequis sont faits", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    await s.insertTasks(m.id, [
      { key: "a", kind: "execute", title: "A", assignee: "grace" },
      { key: "b", kind: "execute", title: "B", assignee: "alan", depends_on: ["a"] },
    ]);
    let tasks = await s.tasksOf(m.id);
    expect(tasks.find((t) => t.key === "b")!.status).toBe("blocked");
    const a = tasks.find((t) => t.key === "a")!;
    await s.completeTask(a.id, "livrable A");
    tasks = await s.tasksOf(m.id);
    expect(tasks.find((t) => t.key === "b")!.status).toBe("pending");
  });

  it("réservation concurrente : deux workers ne prennent jamais la même tâche", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    await s.insertTasks(m.id, [
      { key: "a", kind: "execute", title: "A", assignee: "grace" },
      { key: "b", kind: "execute", title: "B", assignee: "alan" },
    ]);
    const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => s.claimTask(`w${i}`, 60)));
    const ids = claims.filter(Boolean).map((t) => t!.id);
    expect(ids).toHaveLength(3); // plan + a + b
    expect(new Set(ids).size).toBe(3);
    expect(await s.claimTask("w9", 60)).toBeNull();
  });

  it("bail expiré : une tâche d'un worker mort est reprise", async () => {
    const s = await freshStore();
    await s.createMission("x", 2, "gaspard");
    const t = (await s.claimTask("mort", 60))!;
    await s.db.query("UPDATE tasks SET lease_until = now() - interval '1 second' WHERE id=$1", [t.id]);
    const again = await s.claimTask("vivant", 60);
    expect(again?.id).toBe(t.id);
    expect(again?.attempts).toBe(2);
  });

  it("échec : nouvelle tentative avec backoff, puis échec définitif de la mission", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    let t = (await s.claimTask("w", 60))!;
    t = await s.failTask(t.id, "erreur réseau", true);
    expect(t.status).toBe("pending");
    expect(await s.claimTask("w", 60)).toBeNull(); // backoff : pas encore
    t = await s.failTask(t.id, "requête invalide", false);
    expect(t.status).toBe("failed");
    expect((await s.getMission(m.id))!.status).toBe("failed");
    await s.retryMission(m.id);
    expect((await s.getMission(m.id))!.status).toBe("planning");
  });

  it("validation humaine : décision unique, la tâche reprend après exécution", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    const t = (await s.claimTask("w", 60))!;
    const id = await s.createApproval({ missionId: m.id, taskId: t.id, agentId: "gaspard", toolUseId: "tu1", action: "send_webhook", summary: "Envoyer", payload: { a: 1 } });
    expect((await s.getTask(t.id))!.status).toBe("awaiting_approval");
    expect((await s.getMission(m.id))!.status).toBe("awaiting_approval");
    expect(await s.decideApproval(id, "approved")).not.toBeNull();
    expect(await s.decideApproval(id, "rejected")).toBeNull(); // déjà décidée
    await s.finishApproval(id, "executed", "ok");
    expect((await s.getTask(t.id))!.status).toBe("pending");
    expect((await s.getMission(m.id))!.status).toBe("running");
  });

  it("coûts : chaque appel est tracé et cumulé sur la mission et la journée", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    const u = { missionId: m.id, taskId: null, agentId: "grace", purpose: "execute", model: "claude-opus-5-5", input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, webSearches: 0, requestId: null };
    await s.recordUsage({ ...u, costUsd: 0.014 });
    await s.recordUsage({ ...u, costUsd: 0.006 });
    expect((await s.getMission(m.id))!.spent_usd).toBeCloseTo(0.02, 6);
    expect(await s.spentToday()).toBeCloseTo(0.02, 6);
  });

  it("historique des agents et conversations persistés", async () => {
    const s = await freshStore();
    const m = await s.createMission("x", 2, "gaspard");
    const t = (await s.tasksOf(m.id))[0];
    await s.appendMessage(t, "gaspard", "user", [{ type: "text", text: "Bonjour" }]);
    await s.appendMessage(t, "gaspard", "assistant", [{ type: "text", text: "Plan prêt" }]);
    expect(await s.transcript(t.id)).toHaveLength(2);
    const c = await s.openConversation({ missionId: m.id, taskId: t.id, kind: "meeting", title: "Kick-off", participants: ["gaspard", "grace"] });
    await s.addLine(c, "meeting", "gaspard", "On démarre.");
    await s.closeConversation(c, "meeting", "closed", "Décisions : …");
    const convs = await s.conversations(m.id);
    expect(convs[0].lines).toEqual([{ speaker: "gaspard", text: "On démarre." }]);
  });

  it("automatisations : déclenchement atomique et reprogrammation", async () => {
    const s = await freshStore();
    await s.createAutomation("Veille concurrentielle", 60, 1);
    const due = await Promise.all([s.claimDueAutomations(), s.claimDueAutomations()]);
    expect(due.flat()).toHaveLength(1);
    expect(await s.claimDueAutomations()).toHaveLength(0);
  });
});
