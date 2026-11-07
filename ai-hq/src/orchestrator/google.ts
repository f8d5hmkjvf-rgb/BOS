import { createHash } from "node:crypto";
import type { GoogleSecret, GoogleSettings } from "./connectors";

/**
 * Google : OAuth 2.0 (jamais de mot de passe), Gmail (recherche, lecture filtrée, brouillons, envoi)
 * et Google Sheets (upsert idempotent). Appels REST directs, `fetch` injectable pour les tests.
 */
type Fetch = typeof fetch;

export const SCOPES = {
  compose: "https://www.googleapis.com/auth/gmail.compose",
  readonly: "https://www.googleapis.com/auth/gmail.readonly",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
} as const;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Portées demandées : le strict nécessaire selon les réglages. */
export function scopesFor(s: Pick<GoogleSettings, "gmailRead">, sheetsDirect: boolean): string[] {
  const out: string[] = [SCOPES.compose];
  if (s.gmailRead) out.push(SCOPES.readonly);
  if (sheetsDirect) out.push(SCOPES.sheets);
  return out;
}

export function authUrl(clientId: string, redirectUri: string, state: string, scopes: string[]): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline", // jeton de rafraîchissement
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function json<T>(r: Response, what: string): Promise<T> {
  if (!r.ok) {
    const body = (await r.text().catch(() => "")).slice(0, 300);
    throw new GoogleApiError(`${what} : HTTP ${r.status}${body ? ` — ${body}` : ""}`, r.status);
  }
  return (await r.json()) as T;
}

export async function exchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string, f: Fetch = fetch) {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  return json<{ access_token: string; refresh_token?: string; scope?: string; expires_in: number }>(r, "Échange du code OAuth");
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function accessToken(g: Pick<GoogleSettings, "clientId"> & GoogleSecret, f: Fetch = fetch): Promise<string> {
  if (!g.refreshToken) throw new GoogleApiError("Compte Google non connecté.", 401);
  const key = createHash("sha256").update(g.refreshToken).digest("hex");
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: "refresh_token" }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j = await json<{ access_token: string; expires_in: number }>(r, "Rafraîchissement du jeton Google (reconnectez le compte si le problème persiste)");
  tokenCache.set(key, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export function clearTokenCache(): void {
  tokenCache.clear();
}

/** Révocation côté Google : le jeton devient inutilisable immédiatement. */
export async function revoke(token: string, f: Fetch = fetch): Promise<void> {
  const r = await f("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  // 400 = jeton déjà invalide : la révocation est acquise.
  if (!r.ok && r.status !== 400) throw new GoogleApiError(`Révocation Google : HTTP ${r.status}`, r.status);
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function api<T>(token: string, url: string, init: RequestInit, what: string, f: Fetch): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  return json<T>(await f(url, { ...init, headers, signal: AbortSignal.timeout(20000) }), what);
}

export async function gmailProfile(token: string, f: Fetch = fetch): Promise<string> {
  const p = await api<{ emailAddress: string }>(token, `${GMAIL}/profile`, {}, "Profil Gmail", f);
  return p.emailAddress;
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

type Header = { name: string; value: string };
const header = (hs: Header[] | undefined, n: string) => hs?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

/** La requête de l'agent est TOUJOURS combinée au filtre autorisé choisi par l'entrepreneur. */
export function scopedQuery(filter: string, query: string): string {
  const f = filter.trim();
  const q = query.trim();
  return f ? (q ? `(${f}) (${q})` : `(${f})`) : q;
}

export async function searchEmails(token: string, filter: string, query: string, max: number, f: Fetch = fetch): Promise<EmailSummary[]> {
  const q = scopedQuery(filter, query);
  const list = await api<{ messages?: { id: string }[] }>(token, `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(Math.min(max, 10)) })}`, {}, "Recherche Gmail", f);
  const out: EmailSummary[] = [];
  for (const m of list.messages ?? []) {
    const msg = await api<{ id: string; snippet: string; payload?: { headers?: Header[] } }>(
      token,
      `${GMAIL}/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      {},
      "Lecture d'en-têtes Gmail",
      f,
    );
    out.push({ id: msg.id, from: header(msg.payload?.headers, "From"), subject: header(msg.payload?.headers, "Subject"), date: header(msg.payload?.headers, "Date"), snippet: msg.snippet });
  }
  return out;
}

interface Part {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: Header[];
}

function plainText(p: Part | undefined): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const t = plainText(c);
    if (t) return t;
  }
  if (p.mimeType === "text/html" && p.body?.data)
    return Buffer.from(p.body.data, "base64url")
      .toString("utf8")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  return "";
}

/** Lecture d'un message, refusée s'il ne correspond pas au filtre autorisé. */
export async function readEmail(token: string, filter: string, id: string, f: Fetch = fetch) {
  const msg = await api<{ id: string; payload?: Part }>(token, `${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, {}, "Lecture Gmail", f);
  const msgId = header(msg.payload?.headers, "Message-ID") || header(msg.payload?.headers, "Message-Id");
  if (filter.trim()) {
    if (!msgId) throw new GoogleApiError("Message non vérifiable : lecture refusée.", 403);
    const check = await api<{ messages?: { id: string }[] }>(token, `${GMAIL}/messages?${new URLSearchParams({ q: scopedQuery(filter, `rfc822msgid:${msgId.replace(/[<>]/g, "")}`), maxResults: "5" })}`, {}, "Vérification du filtre Gmail", f);
    if (!check.messages?.some((m) => m.id === msg.id)) throw new GoogleApiError("Ce message ne fait pas partie des e-mails autorisés (filtre des Paramètres).", 403);
  }
  const h = msg.payload?.headers;
  return { id: msg.id, from: header(h, "From"), to: header(h, "To"), subject: header(h, "Subject"), date: header(h, "Date"), body: plainText(msg.payload).slice(0, 20000) };
}

export async function createDraft(token: string, raw: string, f: Fetch = fetch): Promise<string> {
  const d = await api<{ id: string }>(token, `${GMAIL}/drafts`, { method: "POST", body: JSON.stringify({ message: { raw } }) }, "Création du brouillon Gmail", f);
  return d.id;
}

export async function sendRaw(token: string, raw: string, f: Fetch = fetch): Promise<string> {
  const m = await api<{ id: string }>(token, `${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw }) }, "Envoi Gmail", f);
  return m.id;
}

// ------------------------------------------------------------------ Google Sheets

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

function a1(sheet: string, range: string): string {
  return encodeURIComponent(`'${sheet.replace(/'/g, "''")}'!${range}`);
}

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Upsert idempotent : la clé (colonne A) est cherchée ; la ligne est mise à jour si elle existe,
 * ajoutée sinon. Rejouer la même synchronisation ne crée jamais de doublon.
 */
export async function upsertRow(token: string, spreadsheetId: string, sheet: string, headers: string[], row: (string | number)[], f: Fetch = fetch): Promise<"updated" | "appended"> {
  const last = colLetter(headers.length);
  const base = `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values`;
  const col = await api<{ values?: string[][] }>(token, `${base}/${a1(sheet, "A:A")}`, {}, "Lecture de la feuille", f);
  const keys = (col.values ?? []).map((r) => r[0]);
  if (keys.length === 0 || keys[0] !== headers[0])
    await api(token, `${base}/${a1(sheet, `A1:${last}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) }, "Écriture des en-têtes", f);
  const idx = keys.indexOf(String(row[0]));
  if (idx > 0) {
    await api(token, `${base}/${a1(sheet, `A${idx + 1}:${last}${idx + 1}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) }, "Mise à jour de la ligne", f);
    return "updated";
  }
  await api(token, `${base}/${a1(sheet, `A:${last}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) }, "Ajout de la ligne", f);
  return "appended";
}
