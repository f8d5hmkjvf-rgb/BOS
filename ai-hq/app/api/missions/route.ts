import { NextResponse } from "next/server";
import { ceo } from "@/orchestrator/agents";
import { getContext, notConfigured, readJson } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  return NextResponse.json(await store.listMissions(30));
}

/** L'entrepreneur confie un objectif en langage naturel à Gaspard. */
export async function POST(req: Request) {
  const { store, missing, cfg } = await getContext();
  if (!store || missing.length) return notConfigured(missing);
  const body = await readJson<{ goal?: unknown; budgetUsd?: unknown; priority?: unknown }>(req);
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 10) return NextResponse.json({ error: "Décrivez l'objectif en une phrase au moins (10 caractères)." }, { status: 400 });
  if (goal.length > 8000) return NextResponse.json({ error: "Objectif trop long (8000 caractères max)." }, { status: 400 });
  const budget = Number(body?.budgetUsd ?? cfg.missionBudgetUsd);
  if (!Number.isFinite(budget) || budget <= 0 || budget > cfg.maxMissionBudgetUsd)
    return NextResponse.json({ error: `Budget invalide : entre 0 et ${cfg.maxMissionBudgetUsd} USD par mission.` }, { status: 400 });
  const priority = (["basse", "normale", "haute", "urgente"] as const).find((p) => p === body?.priority) ?? "normale";
  const m = await store.createMission(goal, budget, ceo().id, null, priority);
  return NextResponse.json(m, { status: 201 });
}
