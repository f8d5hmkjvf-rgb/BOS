import { NextResponse } from "next/server";
import { ConnectorStore } from "@/orchestrator/connectors";
import { getContext, googleRedirectUri, notConfigured } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État des connecteurs (jamais de secret dans la réponse). */
export async function GET(req: Request) {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const cs = new ConnectorStore(store.db);
  return NextResponse.json({
    connectors: await cs.list(),
    encryptionKey: Boolean(process.env.AIHQ_ENCRYPTION_KEY),
    googleRedirectUri: googleRedirectUri(req),
  });
}
