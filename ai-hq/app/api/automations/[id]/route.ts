import { NextResponse } from "next/server";
import { getContext, notConfigured, readJson, requireAdmin } from "@/server/context";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  const b = await readJson<{ enabled?: boolean }>(req);
  if (typeof b?.enabled !== "boolean") return NextResponse.json({ error: "enabled (booléen) requis" }, { status: 400 });
  await store.setAutomationEnabled(id, b.enabled);
  return NextResponse.json({ ok: true });
}
