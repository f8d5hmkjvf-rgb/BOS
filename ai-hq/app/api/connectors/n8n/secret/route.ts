import { NextResponse } from "next/server";
import { ConnectorStore, type N8nSecret } from "@/orchestrator/connectors";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Affiche le secret de signature (à coller dans n8n pour vérifier les appels). Réservé à l'utilisateur connecté. */
export async function POST() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const s = await new ConnectorStore(store.db).secret<N8nSecret>("n8n");
  if (!s) return NextResponse.json({ error: "n8n n'est pas configuré." }, { status: 404 });
  return NextResponse.json({ signingSecret: s.signingSecret }, { headers: { "cache-control": "no-store" } });
}
