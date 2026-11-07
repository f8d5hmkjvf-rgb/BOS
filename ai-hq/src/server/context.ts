import "server-only";
import { NextResponse } from "next/server";
import { loadConfig, missingConfiguration, type OrchestratorConfig } from "@/orchestrator/config";
import { getDb } from "@/orchestrator/db";
import { Store } from "@/orchestrator/store";

export interface ServerContext {
  cfg: OrchestratorConfig;
  store: Store | null;
  missing: string[];
}

export async function getContext(): Promise<ServerContext> {
  const cfg = loadConfig();
  const missing = missingConfiguration(cfg);
  if (!cfg.databaseUrl) return { cfg, store: null, missing };
  try {
    return { cfg, store: new Store(await getDb(cfg.databaseUrl)), missing };
  } catch (e) {
    return { cfg, store: null, missing: [...missing, `Connexion PostgreSQL impossible : ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** Réponse explicite quand une fonctionnalité doit être configurée (jamais de faux résultat). */
export function notConfigured(missing: string[]) {
  return NextResponse.json({ error: "configuration_requise", missing }, { status: 503 });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
