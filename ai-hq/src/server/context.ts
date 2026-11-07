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

/** URL publique de l'application (redirections OAuth). AIHQ_PUBLIC_URL prime sur les en-têtes. */
export function publicUrl(req: Request): string {
  if (process.env.AIHQ_PUBLIC_URL) return process.env.AIHQ_PUBLIC_URL.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const googleRedirectUri = (req: Request) => `${publicUrl(req)}/api/connectors/google/callback`;
