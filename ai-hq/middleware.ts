import { NextResponse, type NextRequest } from "next/server";
import { authSettings, safeEqual, SESSION_COOKIE, verifySession } from "@/server/session";

/** Pages et routes accessibles sans session. */
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health"];

/**
 * Authentification de toute l'application (pages, API, flux SSE) :
 * - session signée (cookie httpOnly) obtenue via /login ;
 * - ou jeton d'API `Authorization: Bearer AIHQ_ADMIN_TOKEN` (n8n, scripts) ;
 * - protection CSRF : les requêtes modifiantes en session doivent venir de la même origine.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  const auth = authSettings();
  const isApi = pathname.startsWith("/api/");
  const deny = (status: number, error: string) =>
    isApi ? NextResponse.json({ error }, { status }) : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url));

  if (!auth.required) return NextResponse.next(); // développement local sans mot de passe
  if (!auth.configured) return deny(503, "Authentification non configurée : définissez AIHQ_ADMIN_PASSWORD (12+ caractères) et AIHQ_SESSION_SECRET (32+ caractères).");

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (isApi && bearer && auth.apiToken && auth.apiToken.length >= 24 && safeEqual(bearer, auth.apiToken)) return NextResponse.next();

  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value, auth.secret!))) return deny(401, "non_authentifie");

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "origine refusée" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
