import { describe, expect, it } from "vitest";
import { ResourceManager } from "@/sim/resources";
import type { ResourceDef } from "@/sim/map";

const def = (id: string, extra: Partial<ResourceDef> = {}): ResourceDef => ({
  id,
  type: "coffee_machine",
  tile: { x: 0, y: 0 },
  facing: 0,
  queueTiles: [
    { x: 0, y: 1 },
    { x: 0, y: 2 },
  ],
  roomId: 0,
  ...extra,
});

describe("Ressources", () => {
  it("réservation exclusive puis occupation", () => {
    const rm = new ResourceManager([def("c")]);
    expect(rm.reserve("c", "a", 0)).toBe(true);
    expect(rm.reserve("c", "b", 0)).toBe(false);
    expect(rm.occupy("c", "b")).toBe(false);
    expect(rm.occupy("c", "a")).toBe(true);
    expect(rm.isFree("c")).toBe(false);
  });

  it("file d'attente FIFO avec promotion à la libération", () => {
    const rm = new ResourceManager([def("c")]);
    rm.reserve("c", "a", 0);
    rm.occupy("c", "a");
    expect(rm.enqueue("c", "b")).toBe(0);
    expect(rm.enqueue("c", "d")).toBe(1);
    expect(rm.enqueue("c", "b")).toBe(0); // idempotent
    rm.release("c", "a", 10);
    expect(rm.get("c").reservedBy).toBe("b");
    expect(rm.queuePosition("c", "d")).toBe(0);
  });

  it("personne ne double la file", () => {
    const rm = new ResourceManager([def("c")]);
    rm.reserve("c", "a", 0);
    rm.enqueue("c", "b");
    rm.release("c", "a", 1); // promotion de b
    expect(rm.reserve("c", "x", 1)).toBe(false);
  });

  it("une réservation non honorée expire et passe au suivant", () => {
    const rm = new ResourceManager([def("c")], 100);
    rm.reserve("c", "a", 0);
    rm.enqueue("c", "b");
    rm.update(50);
    expect(rm.get("c").reservedBy).toBe("a");
    rm.update(101);
    expect(rm.get("c").reservedBy).toBe("b");
    expect(rm.drainEvents().some((e) => e.kind === "expired" && e.agent === "a")).toBe(true);
  });

  it("une occupation n'expire jamais", () => {
    const rm = new ResourceManager([def("c")], 10);
    rm.reserve("c", "a", 0);
    rm.occupy("c", "a");
    rm.update(10_000);
    expect(rm.get("c").occupant).toBe("a");
  });

  it("annulation : releaseAll libère réservations, occupations et files", () => {
    const rm = new ResourceManager([def("c1"), def("c2")]);
    rm.reserve("c1", "a", 0);
    rm.reserve("c2", "b", 0);
    rm.enqueue("c2", "a");
    rm.releaseAll("a", 5);
    expect(rm.isFree("c1")).toBe(true);
    expect(rm.queuePosition("c2", "a")).toBe(-1);
    expect(rm.holdings("a")).toEqual([]);
  });

  it("file partagée entre cabines (queueKey) : la première cabine libérée sert la tête de file", () => {
    const rm = new ResourceManager([def("wc0", { queueKey: "wc", type: "toilet_stall" }), def("wc1", { queueKey: "wc", type: "toilet_stall" })]);
    rm.reserve("wc0", "a", 0);
    rm.occupy("wc0", "a");
    rm.reserve("wc1", "b", 0);
    rm.occupy("wc1", "b");
    rm.enqueue("wc0", "c");
    expect(rm.queuePosition("wc1", "c")).toBe(0);
    rm.release("wc1", "b", 3);
    expect(rm.reservationInPool("wc0", "c")?.def.id).toBe("wc1");
  });

  it("les bureaux attitrés ne sont proposés qu'à leur propriétaire", () => {
    const rm = new ResourceManager([def("desk:a", { type: "desk", owner: "a" })]);
    expect(rm.freeOfType("desk", "b")).toHaveLength(0);
    expect(rm.freeOfType("desk", "a")).toHaveLength(1);
  });
});
