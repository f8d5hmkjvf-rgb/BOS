/**
 * Sessions signées (HMAC-SHA256, Web Crypto) : utilisables dans le middleware (Edge) et les routes (Node).
 * Jeton : v1.<expiration>.<nonce>.<signature>. Aucun état serveur, révocation globale en changeant AIHQ_SESSION_SECRET.
 */
export const SESSION_COOKIE = "aihq_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Comparaison en temps constant de deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSession(secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = `v1.${nowSec + SESSION_TTL_SEC}.${nonce}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifySession(token: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < nowSec) return false;
  return safeEqual(parts[3], await hmac(secret, parts.slice(0, 3).join(".")));
}

export interface AuthSettings {
  password: string | null;
  secret: string | null;
  apiToken: string | null;
  configured: boolean;
  /** En production, l'authentification est obligatoire (sauf dérogation explicite). */
  required: boolean;
}

export function authSettings(env: Record<string, string | undefined> = process.env): AuthSettings {
  const password = env.AIHQ_ADMIN_PASSWORD || null;
  const secret = env.AIHQ_SESSION_SECRET && env.AIHQ_SESSION_SECRET.length >= 32 ? env.AIHQ_SESSION_SECRET : null;
  const configured = Boolean(password && password.length >= 12 && secret);
  const required = configured || (env.NODE_ENV === "production" && env.AIHQ_ALLOW_NO_AUTH !== "1");
  return { password, secret, apiToken: env.AIHQ_ADMIN_TOKEN || null, configured, required };
}
