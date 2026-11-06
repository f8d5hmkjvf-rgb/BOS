import type { ActivityId } from "./activities";
import type { Needs, Personality, Habits, RealWork } from "./types";

export interface UtilityInput {
  needs: Needs;
  personality: Personality;
  habits: Habits;
  realWork: RealWork;
  /** Heure décimale (ex. 14.25). */
  hour: number;
  leaveHour: number;
  /** Activité actuelle (pour l'inertie). */
  current: ActivityId | null;
  recentCoffees: number;
  /** Une réunion attend l'agent maintenant. */
  meetingPending: boolean;
  /** Distance (en cases) jusqu'à la ressource la plus proche de chaque activité, Infinity si aucune. */
  distance: Partial<Record<ActivityId, number>>;
  /** Longueur de file minimale pour l'activité, Infinity si saturée. */
  queue: Partial<Record<ActivityId, number>>;
  /** Activités en cooldown (échec récent). */
  cooldown: Set<ActivityId>;
  /** Bruit déterministe ∈ [0,1) par activité. */
  noise: (a: ActivityId) => number;
}

export interface UtilityScore {
  activity: ActivityId;
  score: number;
  reason: string;
}

const sq = (v: number) => v * v;
const cube = (v: number) => v * v * v;
/** Courbe logistique centrée en c, pente k. */
const logistic = (v: number, c: number, k: number) => 1 / (1 + Math.exp(-k * (v - c)));

/**
 * Utility AI : chaque activité reçoit un score à partir de courbes de réponse sur les besoins,
 * modulé par la personnalité, les habitudes, le planning et le coût d'accès (distance, file).
 * Le meilleur score gagne. Pur et déterministe.
 */
export function scoreActivities(u: UtilityInput): UtilityScore[] {
  const { needs: n, personality: p, habits: h } = u;
  const out: UtilityScore[] = [];
  const add = (activity: ActivityId, base: number, reason: string) => {
    let score = base;
    const d = u.distance[activity];
    const q = u.queue[activity];
    if (d === Infinity || q === Infinity) {
      out.push({ activity, score: -Infinity, reason: `${reason} · indisponible` });
      return;
    }
    if (d !== undefined) score -= 0.004 * d;
    if (q !== undefined) score -= 0.07 * q * (1.3 - p.agreeableness * 0.5);
    if (u.cooldown.has(activity)) score -= 0.6;
    if (u.current === activity) score += 0.08; // inertie (hystérésis)
    score += (u.noise(activity) - 0.5) * 0.04;
    out.push({ activity, score, reason });
  };

  const lunchGap = Math.abs(u.hour - h.lunchHour);
  const lunch = lunchGap < 0.5 ? 1 : lunchGap < 1.25 ? 0.5 : 0.15;
  const busy = u.realWork.status === "busy";
  const blocked = u.realWork.status === "blocked";

  // Travail : socle stable, renforcé par une mission réelle en cours.
  add(
    "work",
    0.32 + 0.22 * p.conscientiousness + (busy ? 0.18 : 0) - 0.18 * n.fatigue - 0.1 * n.stress * (blocked ? 1 : 0),
    busy ? "mission réelle en cours" : "travail courant",
  );

  // Toilettes : courbe très raide, prioritaire quand urgent.
  const tScore = n.bladder > 0.92 ? 1.6 : 1.5 * cube(n.bladder) + 0.4 * logistic(n.bladder, 0.75, 14);
  add("toilet", tScore, `vessie ${(n.bladder * 100) | 0}%`);

  const morning = u.hour >= 8.5 && u.hour <= 10.5 ? 0.15 : u.hour >= 13.5 && u.hour <= 15 ? 0.1 : 0;
  add(
    "coffee",
    (0.85 * Math.pow(1 - n.energy, 1.5) + morning) * (0.35 + h.coffeeLover) + 0.12 * n.social * p.extraversion - 0.16 * u.recentCoffees,
    `énergie ${(n.energy * 100) | 0}%`,
  );

  add("water", 1.15 * sq(n.thirst) + (n.thirst > 0.85 ? 0.4 : 0), `soif ${(n.thirst * 100) | 0}%`);

  const eatBase = n.hunger > 0.9 ? 1.3 : 1.25 * sq(n.hunger) * lunch + (lunchGap < 0.4 && n.hunger > 0.35 ? 0.3 : 0);
  add("eat", u.hour < 11.5 && n.hunger < 0.9 ? -1 : eatBase, `faim ${(n.hunger * 100) | 0}%`);

  add(
    "rest",
    (0.9 * sq(n.fatigue) + 0.55 * sq(n.stress)) * (1.25 - 0.5 * p.conscientiousness),
    `fatigue ${(n.fatigue * 100) | 0}% · stress ${(n.stress * 100) | 0}%`,
  );

  add("socialize", 0.9 * sq(n.social) * (0.35 + p.extraversion) + 0.12 * n.stress, `sociabilité ${(n.social * 100) | 0}%`);

  if (u.meetingPending) add("meeting", n.bladder > 0.9 ? 1.5 : 2.2, "réunion organisée par le CEO");
  if (u.hour >= u.leaveHour) add("leave", 3, "fin de journée");

  out.sort((a, b) => b.score - a.score || (a.activity < b.activity ? -1 : 1));
  return out;
}
