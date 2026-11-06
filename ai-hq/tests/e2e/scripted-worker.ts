/**
 * TEST UNIQUEMENT — worker branché sur un modèle SCRIPTÉ pour vérifier l'interface et la
 * synchronisation des animations sans clé API. Jamais utilisé par l'application.
 */
import { loadConfig } from "../../src/orchestrator/config";
import { getDb } from "../../src/orchestrator/db";
import { Store } from "../../src/orchestrator/store";
import { Worker } from "../../src/orchestrator/worker";
import { lastUser, ScriptedLlm, text, tool, toolNames, type Script } from "../helpers/fakeLlm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = loadConfig();
  const store = new Store(await getDb(cfg.databaseUrl!));
  let n = 0;
  const script: Script = (req) => {
    n++;
    const tools = toolNames(req);
    const lu = lastUser(req);
    if (tools.includes("submit_plan"))
      return {
        content: [
          tool("submit_plan", {
            analysis: "[TEST SCRIPTÉ] Plan de démonstration de l'interface.",
            meeting: { needed: true, participants: ["mary", "frances", "sophie"], agenda: "[TEST] Aligner le message de lancement." },
            tasks: [
              { key: "cible", title: "[TEST] Cible", description: "x", deliverable: "x", assignee: "mary", depends_on: [] },
              { key: "page", title: "[TEST] Page de vente", description: "x", deliverable: "x", assignee: "rosalind", depends_on: ["cible"] },
            ],
          }),
        ],
      };
    if (tools.includes("submit_review")) return { content: [tool("submit_review", { verdicts: [{ key: "cible", decision: "accept", feedback: "" }, { key: "page", decision: "accept", feedback: "" }], summary: "[TEST]" })] };
    if (req.system.includes("réunion d'équipe")) return { content: [text(`[TEST SCRIPTÉ] Réplique de réunion n°${n}.`)] };
    if (lu.includes("te consulte")) return { content: [text("[TEST SCRIPTÉ] Réponse du collègue consulté.")] };
    if (tools.includes("submit_deliverable")) {
      if (req.system.includes("Mary") && !lu.includes("Réponse de")) return { content: [tool("consult_colleague", { colleague: "radia", question: "[TEST] Qui est la cible ?" })] };
      return { content: [tool("submit_deliverable", { summary: "[TEST SCRIPTÉ]", content: "[TEST SCRIPTÉ] livrable", open_questions: [] })] };
    }
    return { content: [text("# [TEST SCRIPTÉ] Rapport\nAucun contenu réel.")] };
  };
  const inner = new ScriptedLlm(script);
  // Rythme ralenti pour observer les animations.
  const llm = { create: async (r: Parameters<typeof inner.create>[0]) => (await sleep(Number(process.env.E2E_DELAY ?? 2500)), inner.create(r)) };
  await new Worker(store, llm, cfg).start(500);
}
main();
