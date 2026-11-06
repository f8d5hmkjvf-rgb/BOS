import { NextResponse } from "next/server";
import { agentSpecs } from "@/orchestrator/agents";

export const runtime = "nodejs";

/** Fiches des 29 agents : compétences, outils autorisés, instructions système. */
export async function GET() {
  return NextResponse.json(agentSpecs());
}
