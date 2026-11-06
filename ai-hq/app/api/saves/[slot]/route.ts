import { NextResponse } from "next/server";
import { loadSnapshot, saveSnapshot } from "@/server/db";
import { validateSnapshot } from "@/persistence/schema";

export const runtime = "nodejs";
const SLOT = /^[a-z0-9_-]{1,40}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params;
  if (!SLOT.test(slot)) return NextResponse.json({ error: "slot invalide" }, { status: 400 });
  const snap = await loadSnapshot(slot);
  if (snap === undefined) return NextResponse.json({ error: "PostgreSQL non configuré (DATABASE_URL)" }, { status: 501 });
  if (snap === null) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json(snap);
}

export async function PUT(req: Request, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params;
  if (!SLOT.test(slot)) return NextResponse.json({ error: "slot invalide" }, { status: 400 });
  let snap;
  try {
    snap = validateSnapshot(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalide" }, { status: 400 });
  }
  const ok = await saveSnapshot(slot, snap);
  if (!ok) return NextResponse.json({ error: "PostgreSQL non configuré (DATABASE_URL)" }, { status: 501 });
  return NextResponse.json({ ok: true });
}
