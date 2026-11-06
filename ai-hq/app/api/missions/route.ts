import { NextResponse } from "next/server";
import { listMissions, upsertMission, VALID_STATUSES } from "@/server/missions";
import type { RealWorkStatus } from "@/sim/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listMissions());
}

/**
 * Point d'entrée pour l'orchestrateur RÉEL des agents IA : il publie ici le statut de ses
 * missions. La simulation ne fait que les afficher. Protégé par MISSIONS_TOKEN si défini.
 */
export async function POST(req: Request) {
  const token = process.env.MISSIONS_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { agentId?: unknown; status?: unknown; taskTitle?: unknown } | null;
  if (!body || typeof body.agentId !== "string" || !VALID_STATUSES.includes(body.status as RealWorkStatus))
    return NextResponse.json({ error: "agentId et status requis" }, { status: 400 });
  const m = await upsertMission({
    agentId: body.agentId,
    status: body.status as RealWorkStatus,
    taskTitle: typeof body.taskTitle === "string" ? body.taskTitle.slice(0, 200) : null,
  });
  return NextResponse.json(m);
}
