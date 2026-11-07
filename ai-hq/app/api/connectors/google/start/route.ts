import { NextResponse } from "next/server";
import { ConnectorStore, type GoogleSettings, type SheetsSettings } from "@/orchestrator/connectors";
import { randomSecret } from "@/orchestrator/crypto";
import { authUrl, scopesFor } from "@/orchestrator/google";
import { getContext, googleRedirectUri, notConfigured } from "@/server/context";

export const runtime = "nodejs";

/** Démarre la connexion OAuth Google : l'utilisateur s'authentifie CHEZ GOOGLE (jamais de mot de passe ici). */
export async function POST(req: Request) {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  const g = (await cs.get("google")) as { settings: unknown; hasSecret: boolean };
  const s = g.settings as GoogleSettings;
  if (!s.clientId || !g.hasSecret) return NextResponse.json({ error: "Enregistrez d'abord l'ID client et le code secret OAuth." }, { status: 400 });
  const sheets = (await cs.get("sheets")).settings as unknown as SheetsSettings;
  const state = randomSecret(24);
  await store.db.query("DELETE FROM oauth_states WHERE created_at < now() - interval '10 minutes'");
  await store.db.query("INSERT INTO oauth_states (state) VALUES ($1)", [state]);
  return NextResponse.json({ url: authUrl(s.clientId, googleRedirectUri(req), state, scopesFor(s, sheets.mode === "direct")) });
}
