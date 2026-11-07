import { NextResponse } from "next/server";

/** Sonde de disponibilité publique (aucune information interne). */
export function GET() {
  return NextResponse.json({ ok: true });
}
