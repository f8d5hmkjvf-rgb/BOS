import { NextResponse } from "next/server";
import { ConnectorStore, type GoogleSecret } from "@/orchestrator/connectors";
import { clearTokenCache, revoke } from "@/orchestrator/google";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";

/** Révocation : jeton invalidé chez Google ET effacé d'AI HQ (l'ID client est conservé). */
export async function POST() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  const sec = await cs.secret<GoogleSecret>("google").catch(() => null);
  let warning: string | null = null;
  if (sec?.refreshToken) {
    try {
      await revoke(sec.refreshToken);
    } catch (e) {
      warning = `Révocation côté Google incertaine (${e instanceof Error ? e.message : e}) : retirez aussi l'accès sur https://myaccount.google.com/permissions`;
    }
    await cs.save("google", { grantedScopes: [] }, { refreshToken: undefined }, true);
  }
  clearTokenCache();
  await cs.setStatus("google", "configured", { error: warning });
  await store.db.query("UPDATE connectors SET account=NULL WHERE kind='google'");
  await cs.logRun({ connector: "google", action: "revoke", status: warning ? "error" : "ok", error: warning });
  return NextResponse.json({ ok: true, warning });
}
