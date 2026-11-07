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
  // Sans configuration complète, le worker attend (pas de boucle de redémarrage) et le signale clairement.
  let cfg = loadConfig();
  let missing = missingConfiguration(cfg);
  let stopped = false;
  process.on("SIGTERM", () => (stopped = true));
  process.on("SIGINT", () => (stopped = true));
  if (missing.length) console.error("Worker en attente de configuration (vérification toutes les 60 s) :\n- " + missing.join("\n- "));
  while (missing.length && !stopped) {
    await new Promise((r) => setTimeout(r, 60_000));
    cfg = loadConfig();
    missing = missingConfiguration(cfg);
  }
  if (stopped) process.exit(0);
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
