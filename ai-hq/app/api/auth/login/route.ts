import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { authSettings, createSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/server/session";

export const runtime = "nodejs";

// Limitation des tentatives : 5 essais par 15 minutes et par adresse IP.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 5;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const auth = authSettings();
  if (!auth.configured) return NextResponse.json({ error: "Authentification non configurée sur le serveur (AIHQ_ADMIN_PASSWORD, AIHQ_SESSION_SECRET)." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= MAX) return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const pwd = typeof body?.password === "string" ? body.password : "";
  if (!timingSafeEqual(digest(pwd), digest(auth.password!))) {
    attempts.set(ip, { n: a && a.until > now ? a.n + 1 : 1, until: a && a.until > now ? a.until : now + WINDOW_MS });
    await new Promise((r) => setTimeout(r, 400)); // ralentit la force brute
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(auth.secret!), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.AIHQ_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
