import { buildRoster, DEPARTMENTS, type AgentProfile } from "../sim/roster";
import type { Personality } from "../sim/types";

import type { IntegrationTool } from "./integrations";

export type ToolName = "web_search" | "consult_colleague" | "submit_deliverable" | IntegrationTool;

export interface AgentSpec {
  id: string;
  name: string;
  role: string;
  department: string;
  isCEO: boolean;
  skills: string[];
  tools: ToolName[];
  systemPrompt: string;
}

const SKILLS: Record<string, string[]> = {
  CEO: ["vision stratégique", "décomposition de missions", "arbitrage", "délégation", "contrôle qualité"],
  CTO: ["architecture logicielle", "choix techniques", "revue de code", "estimation"],
  "Ingénieure backend": ["API", "bases de données", "performance", "TypeScript/Node"],
  "Ingénieur frontend": ["React", "UX d'interface", "accessibilité", "CSS"],
  "Ingénieure plateforme": ["infrastructure", "CI/CD", "observabilité", "coûts cloud"],
  "Ingénieur sécurité": ["sécurité applicative", "RGPD technique", "audit", "gestion des secrets"],
  "Ingénieure QA": ["plans de test", "tests automatisés", "cas limites", "critères d'acceptation"],
  "Ingénieur mobile": ["iOS/Android", "React Native", "publication sur les stores"],
  "Head of Data": ["stratégie data", "KPI", "gouvernance des données"],
  "Data scientist": ["statistiques", "modélisation", "expérimentation A/B"],
  "Data engineer": ["pipelines", "SQL", "qualité des données"],
  "Analyste BI": ["tableaux de bord", "analyse de cohortes", "reporting"],
  "Head of Product": ["vision produit", "priorisation", "roadmap"],
  "Product manager": ["spécifications", "user stories", "découverte client"],
  "Product designer": ["parcours utilisateur", "wireframes", "design system"],
  "UX researcher": ["entretiens utilisateurs", "synthèse de recherche", "personas"],
  "Head of Marketing": ["positionnement", "plan marketing", "budget acquisition"],
  "Growth marketer": ["acquisition", "funnels", "expérimentations growth"],
  "Content strategist": ["rédaction", "ligne éditoriale", "calendrier de contenu"],
  "SEO specialist": ["SEO technique", "mots-clés", "contenu optimisé"],
  "Head of Sales": ["stratégie commerciale", "pipeline", "pricing"],
  "Account executive": ["closing", "propositions commerciales", "négociation"],
  "Business developer": ["prospection", "messages d'approche", "partenariats"],
  "Customer success": ["onboarding client", "rétention", "FAQ et support"],
  COO: ["opérations", "processus", "planification", "gestion des risques"],
  "Finance & admin": ["budget", "prévisionnel", "facturation", "conformité administrative"],
  "People & culture": ["recrutement", "fiches de poste", "culture d'équipe"],
  "Support client": ["réponses clients", "base de connaissances", "escalades"],
  "Office manager": ["organisation", "fournisseurs", "logistique"],
};

const WEB_DEPTS = new Set(["direction", "produit", "marketing", "ventes", "data", "tech", "ops"]);
/** Liste blanche des intégrations par département (toutes soumises à validation humaine). */
const INTEGRATION_DEPTS: Record<IntegrationTool, Set<string>> = {
  send_slack_message: new Set(["direction", "marketing", "ventes", "ops", "produit"]),
  trigger_n8n_workflow: new Set(["direction", "tech", "data", "ops", "ventes", "marketing"]),
  send_email: new Set(["direction", "ventes", "marketing", "ops"]),
  send_webhook: new Set(["direction", "marketing", "ventes", "ops"]),
};

function describePersonality(p: Personality): string {
  const t = (v: number, lo: string, hi: string) => (v > 0.66 ? hi : v < 0.33 ? lo : null);
  return [
    t(p.extraversion, "plutôt réservé·e", "très sociable et expansif·ve"),
    t(p.agreeableness, "franc·he, voire direct·e", "bienveillant·e et conciliant·e"),
    t(p.conscientiousness, "créatif·ve mais parfois brouillon·ne", "rigoureux·se et organisé·e"),
    t(p.neuroticism, "calme sous pression", "sensible au stress"),
    t(p.openness, "pragmatique et attaché·e aux méthodes éprouvées", "curieux·se et ouvert·e aux idées neuves"),
  ]
    .filter(Boolean)
    .join(", ");
}

function systemPromptFor(p: AgentProfile, skills: string[], tools: ToolName[]): string {
  const dept = DEPARTMENTS[p.department].label;
  const common = `Tu travailles chez AI HQ, une entreprise composée de 29 agents IA. Tu réponds toujours en français.
Tes livrables sont réels et doivent être directement utilisables par l'entrepreneur humain : concrets, structurés, sans remplissage.
N'invente jamais de faits, chiffres, sources ou résultats. Si une information manque, dis-le et propose comment l'obtenir.
Tu ne peux agir sur le monde extérieur qu'avec les outils fournis ; toute action externe sensible est soumise à validation humaine.`;
  if (p.isCEO)
    return `Tu es ${p.name}, CEO d'AI HQ. Personnalité : ${describePersonality(p.personality)}.
Ton rôle : comprendre l'objectif de l'entrepreneur, le décomposer en tâches précises, choisir les bons spécialistes, organiser leurs collaborations, vérifier la qualité des livrables avec exigence et présenter des résultats clairs.
Tu délègues : tu ne fais pas toi-même le travail des spécialistes.
${common}`;
  return `Tu es ${p.name}, ${p.role} (département ${dept}) chez AI HQ. Personnalité : ${describePersonality(p.personality)}.
Compétences : ${skills.join(", ")}.
Outils autorisés : ${tools.join(", ")}.
Tu reçois des tâches de Gaspard, le CEO. Quand une question sort de ton domaine, consulte le collègue compétent avec consult_colleague plutôt que de deviner.
Termine toujours ta tâche en appelant submit_deliverable avec le livrable complet.
${common}`;
}

let cache: AgentSpec[] | null = null;

/** Les 29 agents : identité, compétences, outils autorisés et instructions système. */
export function agentSpecs(seed = 42): AgentSpec[] {
  if (cache) return cache;
  cache = buildRoster(seed).map((p) => {
    const tools: ToolName[] = ["consult_colleague", "submit_deliverable"];
    if (WEB_DEPTS.has(p.department)) tools.unshift("web_search");
    for (const [t, depts] of Object.entries(INTEGRATION_DEPTS) as [IntegrationTool, Set<string>][]) if (depts.has(p.department)) tools.push(t);
    const skills = SKILLS[p.role] ?? [];
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      department: DEPARTMENTS[p.department].label,
      isCEO: !!p.isCEO,
      skills,
      tools,
      systemPrompt: systemPromptFor(p, skills, tools),
    };
  });
  return cache;
}

export function agentById(id: string): AgentSpec | undefined {
  return agentSpecs().find((a) => a.id === id);
}

export function ceo(): AgentSpec {
  return agentSpecs().find((a) => a.isCEO)!;
}

/** Annuaire compact pour Gaspard (stable → mis en cache par l'API). */
export function directory(): string {
  return agentSpecs()
    .filter((a) => !a.isCEO)
    .map((a) => `- ${a.id} : ${a.name}, ${a.role} (${a.department}) — ${a.skills.join(", ")} — outils : ${a.tools.join(", ")}`)
    .join("\n");
}
