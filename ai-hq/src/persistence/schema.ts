import { SNAPSHOT_VERSION, type WorldSnapshot } from "../sim/engine";

/** Validation défensive d'une sauvegarde (données externes non fiables). */
export function validateSnapshot(raw: unknown): WorldSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("Sauvegarde invalide : objet attendu");
  const s = raw as Record<string, unknown>;
  const num = (k: string) => {
    if (typeof s[k] !== "number" || !Number.isFinite(s[k])) throw new Error(`Sauvegarde invalide : ${k}`);
    return s[k] as number;
  };
  if (s.version !== SNAPSHOT_VERSION) throw new Error(`Version de sauvegarde non supportée : ${String(s.version)}`);
  num("seed");
  num("tick");
  num("day");
  num("sec");
  num("rng");
  if (!Array.isArray(s.agents) || s.agents.length > 1000) throw new Error("Sauvegarde invalide : agents");
  for (const a of s.agents as unknown[]) {
    const o = a as Record<string, unknown>;
    if (!o || typeof o.id !== "string" || typeof o.needs !== "object" || o.needs === null) throw new Error("Sauvegarde invalide : agent");
    for (const k of ["x", "y"]) if (o[k] !== null && typeof o[k] !== "number") throw new Error("Sauvegarde invalide : position");
  }
  if (!Array.isArray(s.relationships)) throw new Error("Sauvegarde invalide : relations");
  return s as unknown as WorldSnapshot;
}
