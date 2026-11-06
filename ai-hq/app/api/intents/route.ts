import { NextResponse } from "next/server";
import { logAuthorizedIntent } from "@/server/db";

export const runtime = "nodejs";

/**
 * Appelé UNIQUEMENT après un clic humain « Autoriser » dans l'interface.
 * Ici, l'exécution se limite à tracer l'intention : brancher votre orchestrateur réel à cet endroit.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { id?: unknown; agentId?: unknown; kind?: unknown; summary?: unknown; humanConfirmed?: unknown } | null;
  if (!b || b.humanConfirmed !== true || typeof b.id !== "string" || typeof b.agentId !== "string" || typeof b.kind !== "string" || typeof b.summary !== "string")
    return NextResponse.json({ error: "confirmation humaine requise" }, { status: 400 });
  await logAuthorizedIntent({ id: b.id, agentId: b.agentId, kind: b.kind, summary: b.summary.slice(0, 500) });
  return NextResponse.json({ ok: true, executed: "logged" });
}
