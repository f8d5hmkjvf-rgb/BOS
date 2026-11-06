import { NextResponse } from "next/server";
import { getContext } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État de configuration : ce qui fonctionne réellement et ce qui reste à configurer. */
export async function GET() {
  const { cfg, store, missing } = await getContext();
  const workers = store ? await store.liveWorkers() : 0;
  const usage = store ? await store.usageSummary() : null;
  return NextResponse.json({
    ready: missing.length === 0 && workers > 0,
    missing,
    database: store ? "ok" : cfg.databaseUrl ? "erreur" : "non configurée",
    anthropic: cfg.anthropicConfigured ? "configurée" : "non configurée",
    workers,
    workerWarning: store && workers === 0 ? "Aucun worker actif : lancez `npm run worker` pour exécuter les missions." : null,
    models: cfg.models,
    budgets: { missionUsd: cfg.missionBudgetUsd, dailyUsd: cfg.dailyBudgetUsd },
    integrations: { webhook: Boolean(cfg.webhookUrl), notify: Boolean(cfg.notifyWebhookUrl), webSearch: cfg.webSearchEnabled },
    adminTokenRequired: Boolean(process.env.AIHQ_ADMIN_TOKEN),
    usage,
  });
}
