import { NextResponse } from "next/server";
import { agentById } from "@/orchestrator/agents";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fiche et historique réel d'un agent (échanges avec l'API, persistés). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spec = agentById(id);
  if (!spec) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const { store, missing } = await getContext();
  if (!store) return NextResponse.json({ spec, history: [], missing });
  return NextResponse.json({ spec, history: await store.agentHistory(id, 30) });
}
