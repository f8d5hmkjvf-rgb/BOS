import { NextResponse } from "next/server";
import { ConnectorStore, type GoogleSecret, type GoogleSettings } from "@/orchestrator/connectors";
import { accessToken, clearTokenCache, exchangeCode, gmailProfile } from "@/orchestrator/google";
import { getContext, googleRedirectUri, publicUrl } from "@/server/context";

export const runtime = "nodejs";

/** Retour de Google : vérification du state (usage unique), échange du code, stockage CHIFFRÉ du jeton, test réel. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${publicUrl(req)}/?google=${encodeURIComponent(q)}`);
  const { store } = await getContext();
  if (!store) return back("erreur:base de données indisponible");
  if (url.searchParams.get("error")) return back(`erreur:${url.searchParams.get("error")}`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const used = await store.db.query("DELETE FROM oauth_states WHERE state=$1 AND created_at > now() - interval '10 minutes' RETURNING state", [state]);
  if (!used.rowCount || !code) return back("erreur:requête OAuth invalide ou expirée, recommencez");
  const cs = new ConnectorStore(store.db);
  const s = (await cs.get("google")).settings as unknown as GoogleSettings;
  const sec = await cs.secret<GoogleSecret>("google");
  if (!sec) return back("erreur:identifiants client manquants");
  try {
    const t = await exchangeCode(s.clientId, sec.clientSecret, code, googleRedirectUri(req));
    if (!t.refresh_token) return back("erreur:Google n'a pas fourni de jeton de rafraîchissement ; révoquez l'accès d'AI HQ dans votre compte Google puis reconnectez");
    const granted = (t.scope ?? "").split(" ").filter(Boolean);
    await cs.save("google", { grantedScopes: granted }, { refreshToken: t.refresh_token });
    clearTokenCache();
    const email = await gmailProfile(await accessToken({ ...s, clientSecret: sec.clientSecret, refreshToken: t.refresh_token }));
    await cs.setStatus("google", "connected", { account: email, error: null });
    await cs.logRun({ connector: "google", action: "oauth_connect", status: "ok", target: email });
    return back(`ok:${email}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await cs.setStatus("google", "error", { error: msg });
    await cs.logRun({ connector: "google", action: "oauth_connect", status: "error", error: msg });
    return back(`erreur:${msg.slice(0, 200)}`);
  }
}
