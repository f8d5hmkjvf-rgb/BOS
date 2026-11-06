import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
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

/**
 * Permission d'administration : si AIHQ_ADMIN_TOKEN est défini, toute action qui dépense ou agit
 * (créer une mission, valider une action, modifier un budget) exige ce jeton.
 */
export function requireAdmin(req: Request): NextResponse | null {
  const token = process.env.AIHQ_ADMIN_TOKEN;
  if (!token) return null;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  if (a.length === b.length && timingSafeEqual(a, b)) return null;
  return NextResponse.json({ error: "non_autorise", message: "Jeton d'administration requis (AIHQ_ADMIN_TOKEN)." }, { status: 401 });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
