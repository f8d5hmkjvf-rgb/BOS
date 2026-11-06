import type { WorldSnapshot } from "../sim/engine";
import { validateSnapshot } from "./schema";

/** Interface de persistance : le moteur ne connaît que ce contrat. */
export interface SaveAdapter {
  readonly name: string;
  save(slot: string, snap: WorldSnapshot): Promise<void>;
  load(slot: string): Promise<WorldSnapshot | null>;
}

export class MemorySaveAdapter implements SaveAdapter {
  readonly name = "mémoire";
  private store = new Map<string, string>();
  async save(slot: string, snap: WorldSnapshot): Promise<void> {
    this.store.set(slot, JSON.stringify(snap));
  }
  async load(slot: string): Promise<WorldSnapshot | null> {
    const v = this.store.get(slot);
    return v ? validateSnapshot(JSON.parse(v)) : null;
  }
}

/** Sauvegarde locale au navigateur (secours hors-ligne). */
export class LocalStorageSaveAdapter implements SaveAdapter {
  readonly name = "navigateur";
  private key(slot: string) {
    return `ai-hq:save:${slot}`;
  }
  async save(slot: string, snap: WorldSnapshot): Promise<void> {
    try {
      localStorage.setItem(this.key(slot), JSON.stringify(snap));
    } catch (e) {
      throw new Error(`Stockage local indisponible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async load(slot: string): Promise<WorldSnapshot | null> {
    try {
      const v = localStorage.getItem(this.key(slot));
      return v ? validateSnapshot(JSON.parse(v)) : null;
    } catch {
      return null;
    }
  }
}

/** Sauvegarde serveur (PostgreSQL via l'API Next.js). */
export class HttpSaveAdapter implements SaveAdapter {
  readonly name = "PostgreSQL";
  constructor(private base = "/api/saves") {}
  async save(slot: string, snap: WorldSnapshot): Promise<void> {
    const r = await fetch(`${this.base}/${encodeURIComponent(slot)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap),
    });
    if (!r.ok) throw new Error(`Sauvegarde serveur refusée (${r.status})`);
  }
  async load(slot: string): Promise<WorldSnapshot | null> {
    const r = await fetch(`${this.base}/${encodeURIComponent(slot)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Chargement serveur impossible (${r.status})`);
    return validateSnapshot(await r.json());
  }
}

/** Essaie le serveur, retombe sur le stockage local si PostgreSQL n'est pas configuré. */
export class FallbackSaveAdapter implements SaveAdapter {
  name: string;
  constructor(
    private primary: SaveAdapter,
    private secondary: SaveAdapter,
  ) {
    this.name = primary.name;
  }
  async save(slot: string, snap: WorldSnapshot): Promise<void> {
    try {
      await this.primary.save(slot, snap);
      this.name = this.primary.name;
    } catch {
      await this.secondary.save(slot, snap);
      this.name = this.secondary.name;
    }
  }
  async load(slot: string): Promise<WorldSnapshot | null> {
    try {
      const v = await this.primary.load(slot);
      if (v) return v;
    } catch {
      /* serveur indisponible */
    }
    return this.secondary.load(slot);
  }
}
