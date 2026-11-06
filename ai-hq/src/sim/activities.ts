import type { NeedEffect } from "./needs";
import type { AnimationId, ResourceType } from "./types";

export type ActivityId = "work" | "toilet" | "coffee" | "water" | "eat" | "rest" | "socialize" | "meeting" | "leave";

export type StepTarget = { type: ResourceType } | { ownDesk: true } | { meetingSeat: true };

export interface StepDef {
  target: StepTarget;
  anim: AnimationId;
  /** Durée en secondes simulées [min, max], ou "until_released" (travail, réunion). */
  duration: [number, number] | "until_released";
  /** Clé d'effet appliquée à la fin de l'étape (voir needs.ts). */
  effect?: string;
  /** Objet tenu en main pendant et après cette étape. */
  holdAfter?: "cup" | "plate" | null;
  holdDuring?: "cup" | "plate" | null;
  /** Étape facultative : si aucune ressource, on l'ignore (et on applique son effet). */
  optional?: boolean;
  /** Autorise l'attente en file si la ressource est occupée. */
  queue?: boolean;
  /** Masque l'agent et ferme la porte (intimité). */
  privacy?: boolean;
  /** Choisir la ressource la plus proche de l'étape précédente. */
  nearPrevious?: boolean;
  /** Préférer une ressource proche d'amis (cafétéria). */
  social?: boolean;
}

export interface ActivityDef {
  id: ActivityId;
  label: string;
  steps: StepDef[];
  /** Délai minimal avant de reprendre la même activité après échec (s simulées). */
  failCooldown: number;
}

export const ACTIVITIES: Record<ActivityId, ActivityDef> = {
  work: {
    id: "work",
    label: "travaille",
    failCooldown: 30,
    steps: [{ target: { ownDesk: true }, anim: "work", duration: "until_released" }],
  },
  toilet: {
    id: "toilet",
    label: "va aux toilettes",
    failCooldown: 60,
    steps: [
      { target: { type: "toilet_stall" }, anim: "toilet", duration: [120, 240], effect: "toilet", queue: true, privacy: true },
      { target: { type: "sink" }, anim: "wash_hands", duration: [25, 40], effect: "wash_hands", queue: true, nearPrevious: true },
    ],
  },
  coffee: {
    id: "coffee",
    label: "prend un café",
    failCooldown: 300,
    steps: [
      { target: { type: "coffee_machine" }, anim: "coffee_make", duration: [40, 70], queue: true, holdAfter: "cup" },
      { target: { type: "coffee_spot" }, anim: "coffee_drink", duration: [180, 360], effect: "coffee", optional: true, holdDuring: "cup", holdAfter: null, nearPrevious: true },
    ],
  },
  water: {
    id: "water",
    label: "boit de l'eau",
    failCooldown: 120,
    steps: [{ target: { type: "water_cooler" }, anim: "drink_water", duration: [20, 35], effect: "water", queue: true }],
  },
  eat: {
    id: "eat",
    label: "déjeune",
    failCooldown: 300,
    steps: [
      { target: { type: "food_counter" }, anim: "idle", duration: [50, 90], queue: true, holdAfter: "plate" },
      { target: { type: "cafeteria_seat" }, anim: "eat", duration: [900, 1500], effect: "eat", holdDuring: "plate", holdAfter: null, social: true },
    ],
  },
  rest: {
    id: "rest",
    label: "fait une pause",
    failCooldown: 300,
    steps: [{ target: { type: "sofa" }, anim: "rest", duration: [400, 800], effect: "rest" }],
  },
  socialize: {
    id: "socialize",
    label: "cherche à discuter",
    failCooldown: 300,
    steps: [{ target: { type: "coffee_spot" }, anim: "idle", duration: [150, 300], social: true }],
  },
  meeting: {
    id: "meeting",
    label: "est en réunion",
    failCooldown: 30,
    steps: [{ target: { meetingSeat: true }, anim: "meeting", duration: "until_released" }],
  },
  leave: {
    id: "leave",
    label: "rentre chez soi",
    failCooldown: 30,
    steps: [{ target: { type: "exit" }, anim: "idle", duration: [1, 1] }],
  },
};

export function effectFor(key: string | undefined, recentCoffees: number, coffee: (n: number) => NeedEffect, table: Record<string, NeedEffect>): NeedEffect {
  if (!key) return {};
  if (key === "coffee") return coffee(recentCoffees);
  return table[key] ?? {};
}
