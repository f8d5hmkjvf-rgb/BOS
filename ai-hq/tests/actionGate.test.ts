import { describe, expect, it, vi } from "vitest";
import { ActionGate } from "@/sim/actionGate";
import { World } from "@/sim/engine";

describe("Séparation simulation / actions réelles", () => {
  it("la simulation ne fait que proposer : rien n'est exécuté sans autorisation", async () => {
    const w = new World({ seed: 4 });
    w.setRealWork("grace", { status: "blocked", taskTitle: "Migration base de données" });
    w.setRealWork("alan", { status: "awaiting_approval", taskTitle: "Déployer la v2" });
    w.runTicks(3 * 3600);
    const pending = w.pendingIntents;
    expect(pending.map((p) => p.agentId).sort()).toEqual(["alan", "grace"]);
    expect(pending.every((p) => p.status === "pending")).toBe(true);
    // Une seule intention par mission (pas de spam).
    w.runTicks(3600);
    expect(w.pendingIntents).toHaveLength(2);
  });

  it("exécute uniquement après autorisation explicite, une seule fois", async () => {
    const gate = new ActionGate();
    const exec = vi.fn(async () => {});
    const i = gate.propose({ agentId: "a", kind: "escalate_blocker", summary: "x", payload: {}, tick: 0 });
    expect(exec).not.toHaveBeenCalled();
    await gate.authorize(i.id, exec);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(i.status).toBe("executed");
    await expect(gate.authorize(i.id, exec)).rejects.toThrow(/déjà traitée/);
  });

  it("une intention refusée n'est jamais exécutée", async () => {
    const gate = new ActionGate();
    const i = gate.propose({ agentId: "a", kind: "request_approval", summary: "x", payload: {}, tick: 0 });
    gate.reject(i.id);
    await expect(gate.authorize(i.id, async () => {})).rejects.toThrow();
    expect(gate.pending()).toHaveLength(0);
  });

  it("un échec d'exécution est capturé", async () => {
    const gate = new ActionGate();
    const i = gate.propose({ agentId: "a", kind: "request_approval", summary: "x", payload: {}, tick: 0 });
    await gate.authorize(i.id, async () => {
      throw new Error("réseau");
    });
    expect(i.status).toBe("failed");
    expect(i.error).toBe("réseau");
  });

  it("le statut réel influence la simulation (stress), sans l'inverse", () => {
    const a = new World({ seed: 8 });
    const b = new World({ seed: 8 });
    b.setRealWork("grace", { status: "blocked", taskTitle: "Bug critique" });
    a.runTicks(2 * 3600);
    b.runTicks(2 * 3600);
    expect(b.byId.get("grace")!.needs.stress).toBeGreaterThan(a.byId.get("grace")!.needs.stress);
  });
});
