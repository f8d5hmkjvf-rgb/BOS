import { NextResponse } from "next/server";
import { getContext, notConfigured } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { store, missing } = await getContext();
  if (!store) return notConfigured(missing);
  return NextResponse.json(await store.approvals());
}
