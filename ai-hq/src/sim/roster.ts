import { Rng, hashString } from "./rng";
import type { DepartmentId, Habits, Personality, Preferences } from "./types";

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  department: DepartmentId;
  isCEO?: boolean;
  isLead?: boolean;
  personality: Personality;
  habits: Habits;
  preferences: Preferences;
  /** Multiplicateurs de vitesse d'évolution des besoins (métabolisme individuel). */
  metabolism: Partial<Record<"hunger" | "thirst" | "bladder" | "social" | "energy", number>>;
  /** Couleurs procédurales pour le rendu. */
  look: { shirt: number; skin: number; hair: number };
}

export const DEPARTMENTS: Record<DepartmentId, { label: string; color: number }> = {
  direction: { label: "Direction", color: 0xc9a227 },
  tech: { label: "Tech", color: 0x3b82f6 },
  data: { label: "Data", color: 0x06b6d4 },
  produit: { label: "Produit", color: 0x8b5cf6 },
  marketing: { label: "Marketing", color: 0xec4899 },
  ventes: { label: "Ventes", color: 0x22c55e },
  ops: { label: "Ops", color: 0xf97316 },
};

/** L'équipe : 29 agents IA. Ordre = ordre d'attribution des bureaux. */
const TEAM: [string, string, DepartmentId, ("ceo" | "lead")?][] = [
  ["Ada", "CEO", "direction", "ceo"],
  ["Linus", "CTO", "tech", "lead"],
  ["Grace", "Ingénieure backend", "tech"],
  ["Alan", "Ingénieur frontend", "tech"],
  ["Margaret", "Ingénieure plateforme", "tech"],
  ["Dennis", "Ingénieur sécurité", "tech"],
  ["Barbara", "Ingénieure QA", "tech"],
  ["Ken", "Ingénieur mobile", "tech"],
  ["Hedy", "Head of Data", "data", "lead"],
  ["John", "Data scientist", "data"],
  ["Katherine", "Data engineer", "data"],
  ["Claude", "Analyste BI", "data"],
  ["Steve", "Head of Product", "produit", "lead"],
  ["Frances", "Product manager", "produit"],
  ["Ivan", "Product designer", "produit"],
  ["Radia", "UX researcher", "produit"],
  ["Mary", "Head of Marketing", "marketing", "lead"],
  ["Edward", "Growth marketer", "marketing"],
  ["Rosalind", "Content strategist", "marketing"],
  ["Tim", "SEO specialist", "marketing"],
  ["Sophie", "Head of Sales", "ventes", "lead"],
  ["Paul", "Account executive", "ventes"],
  ["Nina", "Business developer", "ventes"],
  ["Omar", "Customer success", "ventes"],
  ["Léa", "COO", "ops", "lead"],
  ["Hugo", "Finance & admin", "ops"],
  ["Inès", "People & culture", "ops"],
  ["Yanis", "Support client", "ops"],
  ["Chloé", "Office manager", "ops"],
];

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
const HAIR = [0x2c1b10, 0x4a2f1b, 0x7b4b2a, 0xd6b370, 0x111111, 0xa0522d, 0x9ca3af];
const DRINKS: Preferences["drink"][] = ["café", "café", "thé", "eau", "matcha"];

export function buildRoster(seed: number): AgentProfile[] {
  return TEAM.map(([name, role, department, flag]) => {
    const id = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const rng = new Rng(hashString(id) ^ seed);
    const personality: Personality = {
      extraversion: rng.next(),
      agreeableness: 0.3 + 0.7 * rng.next(),
      conscientiousness: 0.3 + 0.7 * rng.next(),
      neuroticism: rng.next() * 0.8,
      openness: rng.next(),
    };
    const habits: Habits = {
      coffeeLover: rng.next(),
      lunchHour: 12 + rng.int(0, 4) * 0.25,
      arrivalOffsetMin: rng.int(-10, 25) * (1.2 - personality.conscientiousness),
      patienceMin: 3 + 6 * personality.agreeableness,
    };
    const preferences: Preferences = {
      drink: rng.pick(DRINKS),
      crowdTolerance: 0.3 + 0.7 * personality.extraversion,
    };
    const m = () => 0.75 + rng.next() * 0.55;
    const metabolism = { hunger: m(), thirst: m(), bladder: m(), social: m(), energy: m() };
    return {
      id,
      name,
      metabolism,
      role,
      department,
      isCEO: flag === "ceo",
      isLead: flag === "lead" || flag === "ceo",
      personality,
      habits,
      preferences,
      look: {
        shirt: DEPARTMENTS[department].color,
        skin: rng.pick(SKIN),
        hair: rng.pick(HAIR),
      },
    };
  });
}
