/**
 * Worker d'exécution des missions (processus séparé, peut tourner en plusieurs exemplaires).
 * Usage : npm run worker   (lit .env.local / l'environnement)
 */
import { loadConfig, missingConfiguration } from "../src/orchestrator/config";
import { closeAll, getDb } from "../src/orchestrator/db";
import { AnthropicLlm } from "../src/orchestrator/llm";
import { Store } from "../src/orchestrator/store";
import { Worker } from "../src/orchestrator/worker";

async function main() {
  const cfg = loadConfig();
  const missing = missingConfiguration(cfg);
  if (missing.length) {
    console.error("Le worker ne peut pas démarrer, configuration requise :\n- " + missing.join("\n- "));
    process.exit(1);
  }
  const store = new Store(await getDb(cfg.databaseUrl!));
  const worker = new Worker(store, new AnthropicLlm(cfg), cfg);
  const stop = () => {
    console.log("Arrêt demandé : fin des tâches en cours…");
    worker.stop();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await worker.start();
  await closeAll();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
