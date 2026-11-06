import type { AnimationId, NeedId, Needs, Personality } from "./types";

export const NEED_IDS: NeedId[] = ["energy", "fatigue", "hunger", "thirst", "bladder", "stress", "social"];

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function defaultNeeds(): Needs {
  return { energy: 0.85, fatigue: 0.1, hunger: 0.2, thirst: 0.2, bladder: 0.15, stress: 0.15, social: 0.3 };
}

/**
 * Variation de base de chaque besoin, PAR HEURE SIMULÉE.
 * Valeur positive = le besoin augmente (sauf energy : positif = regain).
 */
const BASE_RATES: Needs = {
  energy: -0.06,
  fatigue: 0.05,
  hunger: 0.16,
  thirst: 0.22,
  bladder: 0.24,
  stress: 0.02,
  social: 0.12,
};

/** Modificateurs de taux selon l'activité en cours (additifs, par heure). */
const ACTIVITY_RATES: Partial<Record<AnimationId, Partial<Needs>>> = {
  work: { energy: -0.05, fatigue: 0.03, stress: 0.05 },
  meeting: { energy: -0.06, stress: 0.03, social: -0.5 },
  talk: { social: -2.2, stress: -0.4 },
  rest: { energy: 0.6, fatigue: -0.5, stress: -0.6 },
  walk: { energy: -0.02, stress: -0.05 },
  eat: { energy: 0.1, social: -0.2 },
  coffee_drink: { social: -0.1, stress: -0.2 },
};

export interface NeedContext {
  activity: AnimationId;
  personality: Personality;
  /** Mission réelle bloquée → stress accru. */
  realBlocked: boolean;
  /** Mission réelle en cours → plus de charge mentale. */
  realBusy: boolean;
  /** Nombre de cafés récents (tolérance à la caféine). */
  recentCoffees: number;
  /** Multiplicateurs individuels (métabolisme). */
  metabolism?: Partial<Record<NeedId, number>>;
}

/** Fait évoluer les besoins sur `hours` heures simulées. Pur, sans effet de bord. */
export function tickNeeds(needs: Needs, hours: number, ctx: NeedContext): Needs {
  const p = ctx.personality;
  const act = ACTIVITY_RATES[ctx.activity] ?? {};
  const out = { ...needs };
  for (const id of NEED_IDS) {
    let rate = BASE_RATES[id] + (act[id] ?? 0);
    if (id === "social") rate *= 0.5 + p.extraversion; // les extravertis ont plus besoin de contact
    if (id === "stress") {
      rate += (p.neuroticism - 0.4) * 0.05;
      if (ctx.realBlocked) rate += 0.12;
      if (ctx.realBusy && ctx.activity === "work") rate += 0.03;
      // La fatigue et la faim nourrissent le stress.
      rate += Math.max(0, needs.hunger - 0.7) * 0.2 + Math.max(0, needs.fatigue - 0.7) * 0.15;
    }
    if (id === "energy") rate -= needs.fatigue * 0.04;
    const m = ctx.metabolism?.[id];
    if (m !== undefined && rate > 0 === (id !== "energy")) rate *= m;
    out[id] = clamp01(needs[id] + rate * hours);
  }
  return out;
}

export type NeedEffect = Partial<Needs>;

/** Applique un effet instantané (fin d'activité), borné. */
export function applyEffect(needs: Needs, effect: NeedEffect, scale = 1): Needs {
  const out = { ...needs };
  for (const id of NEED_IDS) {
    const d = effect[id];
    if (d !== undefined) out[id] = clamp01(out[id] + d * scale);
  }
  return out;
}

/**
 * Effets du café : modérés et décroissants avec la consommation récente
 * (1er café = 100 %, 2e = 60 %, 3e = 36 %...). Légèrement diurétique.
 */
export function coffeeEffect(recentCoffees: number): NeedEffect {
  const k = Math.pow(0.6, recentCoffees);
  return { energy: 0.18 * k, fatigue: -0.04 * k, thirst: -0.12, bladder: 0.08, stress: -0.04 };
}

export const ACTIVITY_EFFECTS: Record<string, NeedEffect> = {
  toilet: { bladder: -1 },
  wash_hands: {},
  water: { thirst: -0.6, bladder: 0.05 },
  eat_grab: {},
  eat: { hunger: -0.85, thirst: -0.2, energy: 0.08, bladder: 0.06 },
  rest: { stress: -0.05 },
};

/** Sommeil de nuit : remise à niveau au début de chaque journée. */
export function overnight(needs: Needs, rngValue: number): Needs {
  return {
    energy: 0.8 + 0.2 * rngValue,
    fatigue: 0.05 + 0.1 * (1 - rngValue),
    hunger: 0.25,
    thirst: 0.25,
    bladder: 0.15,
    stress: clamp01(needs.stress * 0.4),
    social: clamp01(needs.social * 0.6 + 0.15),
  };
}
