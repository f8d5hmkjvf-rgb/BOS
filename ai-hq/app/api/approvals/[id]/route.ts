import { NextResponse } from "next/server";
import { applyDecision } from "@/orchestrator/actions";
import { getContext, notConfigured, readJson } from "@/server/context";

export const runtime = "nodejs";

/** Décision humaine sur une action sensible. Seul chemin par lequel une action externe est exécutée. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { store, missing, cfg } = await getContext();
  if (!store) return notConfigured(missing);
  const body = await readJson<{ decision?: string; humanConfirmed?: boolean }>(req);
  if (body?.humanConfirmed !== true || (body.decision !== "approved" && body.decision !== "rejected"))
    return NextResponse.json({ error: "Décision humaine explicite requise (decision + humanConfirmed)." }, { status: 400 });
  try {
    return NextResponse.json(await applyDecision(store, cfg, id, body.decision));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
