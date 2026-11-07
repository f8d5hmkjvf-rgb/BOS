/**
 * Vérifie la connexion réelle à l'API Anthropic (un appel minimal, coût < 0,01 USD).
 * Usage : ANTHROPIC_API_KEY=... npm run check:anthropic
 */
import { loadConfig } from "../src/orchestrator/config";
import { AnthropicLlm, describeError, textOf } from "../src/orchestrator/llm";
import { costUsd } from "../src/orchestrator/pricing";

async function main(): Promise<number> {
  const cfg = loadConfig();
  if (!cfg.anthropicConfigured) {
    console.error("✗ ANTHROPIC_API_KEY n'est pas défini. Ajoutez-le à .env.local puis relancez.");
    return 1;
  }
  try {
    const llm = new AnthropicLlm(cfg);
    const r = await llm.create({
      model: cfg.models.economy,
      system: "Tu es Gaspard, CEO d'AI HQ. Réponds en une phrase.",
      messages: [{ role: "user", content: "Confirme que tu es opérationnel." }],
      maxTokens: 2000,
      effort: "low",
    });
    console.log(`✓ API Anthropic joignable — modèle ${r.model}, stop_reason ${r.stop_reason}`);
    console.log(`  Réponse : ${textOf(r)}`);
    console.log(`  Coût : ${costUsd(r.model, r.usage).toFixed(5)} USD`);
    return 0;
  } catch (e) {
    console.error(`✗ ${describeError(e)}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
