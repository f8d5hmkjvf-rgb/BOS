/**
 * Types partagés du moteur de simulation.
 * Le moteur est 100 % déterministe et indépendant du rendu : aucun import DOM / Pixi ici.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Tile {
  x: number;
  y: number;
}

/** 8 directions isométriques (0 = est, sens horaire en coordonnées grille). */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DepartmentId =
  | "direction"
  | "tech"
  | "produit"
  | "marketing"
  | "ventes"
  | "ops"
  | "data";

export type AnimationId =
  | "idle"
  | "walk"
  | "work"
  | "coffee_make"
  | "coffee_drink"
  | "talk"
  | "eat"
  | "toilet"
  | "wash_hands"
  | "meeting"
  | "rest"
  | "drink_water"
  | "wait";

export type ResourceType =
  | "desk"
  | "toilet_stall"
  | "sink"
  | "coffee_machine"
  | "coffee_spot"
  | "water_cooler"
  | "food_counter"
  | "cafeteria_seat"
  | "sofa"
  | "meeting_seat"
  | "exit";

export type NeedId =
  | "energy"
  | "fatigue"
  | "hunger"
  | "thirst"
  | "bladder"
  | "stress"
  | "social";

/**
 * Besoins simulés, tous normalisés dans [0, 1].
 * Convention : plus la valeur est haute, plus le besoin est PRESSANT,
 * sauf `energy` où 1 = plein d'énergie.
 */
export type Needs = Record<NeedId, number>;

export interface Personality {
  /** Big Five simplifié, chaque trait dans [0, 1]. */
  extraversion: number;
  agreeableness: number;
  conscientiousness: number;
  neuroticism: number;
  openness: number;
}

export interface Habits {
  /** 0..1 : appétence au café. */
  coffeeLover: number;
  /** Heure préférée de déjeuner (heures décimales, ex. 12.5). */
  lunchHour: number;
  /** Décalage d'arrivée en minutes (ponctualité). */
  arrivalOffsetMin: number;
  /** Patience en file d'attente (minutes simulées). */
  patienceMin: number;
}

export interface Preferences {
  /** Boisson favorite pour les dialogues. */
  drink: "café" | "thé" | "eau" | "matcha";
  /** Préférence pour les espaces calmes (0) ou animés (1). */
  crowdTolerance: number;
}

/** Statut de la mission IA RÉELLE (alimenté de l'extérieur, en lecture seule pour la simulation). */
export type RealWorkStatus = "idle" | "busy" | "blocked" | "awaiting_approval" | "offline";

export interface RealWork {
  status: RealWorkStatus;
  taskTitle: string | null;
  updatedAt: number;
}

export interface Relationship {
  /** Affinité dans [-1, 1]. */
  affinity: number;
  /** Familiarité dans [0, 1]. */
  familiarity: number;
  /** Tick de la dernière conversation (−∞ si jamais). */
  lastTalkTick: number;
}

export interface ScheduleBlock {
  /** Heure de début (heures décimales). */
  start: number;
  end: number;
  kind: "work" | "lunch" | "focus";
}

export interface DecisionRecord {
  tick: number;
  chosen: string;
  scores: { activity: string; score: number; reason: string }[];
}
