import { NextResponse } from "next/server";
import { getContext, notConfigured, readJson, requireAdmin } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const mission = await store.getMission(id);
  if (!mission) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const [tasks, conversations, approvals] = await Promise.all([store.tasksOf(id), store.conversations(id), store.approvals()]);
  return NextResponse.json({ mission, tasks, conversations, approvals: approvals.filter((a) => a.mission_id === id) });
}

/** Actions humaines : relancer après échec, annuler, reprendre avec un budget relevé. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const { store, missing, cfg } = await getContext();
  if (!store) return notConfigured(missing);
  const m = await store.getMission(id);
  if (!m) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const body = await readJson<{ action?: string; budgetUsd?: number }>(req);
  switch (body?.action) {
    case "retry":
      if (m.status !== "failed") return NextResponse.json({ error: "Seule une mission échouée peut être relancée." }, { status: 409 });
      await store.retryMission(id);
      break;
    case "cancel":
      if (["done", "cancelled"].includes(m.status)) return NextResponse.json({ error: "Mission déjà terminée." }, { status: 409 });
      await store.updateMission(id, { status: "cancelled" });
      break;
    case "resume": {
      if (m.status !== "paused") return NextResponse.json({ error: "La mission n'est pas en pause." }, { status: 409 });
      const budget = Number(body.budgetUsd ?? m.budget_usd);
      if (!Number.isFinite(budget) || budget <= m.spent_usd || budget > cfg.dailyBudgetUsd)
        return NextResponse.json({ error: `Nouveau budget requis : supérieur à ${m.spent_usd.toFixed(3)} USD déjà dépensés.` }, { status: 400 });
      const tasks = await store.tasksOf(id);
      await store.updateMission(id, { budget_usd: budget, error: null, status: tasks.some((t) => t.kind !== "plan") ? "running" : "planning" });
      break;
    }
    default:
      return NextResponse.json({ error: "action inconnue (retry | cancel | resume)" }, { status: 400 });
  }
  return NextResponse.json(await store.getMission(id));
}
