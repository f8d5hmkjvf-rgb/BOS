import { NextResponse } from "next/server";
import { getContext, notConfigured, readJson } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  return NextResponse.json(await store.automations());
}

/** Mission récurrente (ex. veille hebdomadaire). Chaque exécution respecte budget et validations. */
export async function POST(req: Request) {
  const { store, missing, cfg } = await getContext();
  if (!store || missing.length) return notConfigured(missing);
  const b = await readJson<{ goal?: string; intervalMinutes?: number; budgetUsd?: number }>(req);
  const goal = (b?.goal ?? "").trim();
  const interval = Number(b?.intervalMinutes);
  const budget = Number(b?.budgetUsd ?? cfg.missionBudgetUsd);
  if (goal.length < 10) return NextResponse.json({ error: "Objectif trop court." }, { status: 400 });
  if (!Number.isInteger(interval) || interval < 15) return NextResponse.json({ error: "Intervalle minimal : 15 minutes." }, { status: 400 });
  if (!(budget > 0 && budget <= cfg.maxMissionBudgetUsd)) return NextResponse.json({ error: "Budget invalide." }, { status: 400 });
  const id = await store.createAutomation(goal, interval, budget);
  return NextResponse.json({ id }, { status: 201 });
}
