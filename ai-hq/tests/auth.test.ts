import { describe, expect, it } from "vitest";
import { authSettings, createSession, safeEqual, verifySession } from "@/server/session";

const SECRET = "x".repeat(40);

describe("Authentification", () => {
  it("session signée valide, puis expirée", async () => {
    const t = await createSession(SECRET, 1000);
    expect(await verifySession(t, SECRET, 1001)).toBe(true);
    expect(await verifySession(t, SECRET, 1000 + 8 * 24 * 3600)).toBe(false);
  });

  it("rejette une signature falsifiée, un autre secret ou un format inconnu", async () => {
    const t = await createSession(SECRET);
    const [v, exp, nonce, sig] = t.split(".");
    expect(await verifySession(`${v}.${Number(exp) + 999999}.${nonce}.${sig}`, SECRET)).toBe(false);
    expect(await verifySession(t, "y".repeat(40))).toBe(false);
    expect(await verifySession("n'importe.quoi", SECRET)).toBe(false);
    expect(await verifySession(undefined, SECRET)).toBe(false);
  });

  it("obligatoire en production, exige un mot de passe et un secret solides", () => {
    expect(authSettings({ NODE_ENV: "development" }).required).toBe(false);
    const prod = authSettings({ NODE_ENV: "production" });
    expect(prod.required).toBe(true);
    expect(prod.configured).toBe(false);
    expect(authSettings({ NODE_ENV: "production", AIHQ_ADMIN_PASSWORD: "court", AIHQ_SESSION_SECRET: SECRET }).configured).toBe(false);
    expect(authSettings({ NODE_ENV: "production", AIHQ_ADMIN_PASSWORD: "un-mot-de-passe-long", AIHQ_SESSION_SECRET: "court" }).configured).toBe(false);
    expect(authSettings({ NODE_ENV: "production", AIHQ_ADMIN_PASSWORD: "un-mot-de-passe-long", AIHQ_SESSION_SECRET: SECRET }).configured).toBe(true);
  });

  it("comparaison en temps constant correcte", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
