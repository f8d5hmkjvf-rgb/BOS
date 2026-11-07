import type { Pool } from "pg";
import { SecretBox } from "./crypto";

/**
 * Registre des connecteurs configurables depuis les Paramètres d'AI HQ.
 * Règle : un connecteur n'est « connecté » (et ses outils proposés aux agents) qu'après un test réel réussi.
 */
export type ConnectorKind = "n8n" | "google" | "slack" | "sheets";
export type ConnectorStatus = "not_configured" | "configured" | "connected" | "error";

export interface N8nSettings {
  /** Hébergement de l'instance (indicatif). */
  hosting: "cloud" | "self-hosted";
  /** URL du webhook n8n (production) qui reçoit les appels d'AI HQ. */
  webhookUrl: string;
  /** Workflows que les agents peuvent demander (liste blanche). */
  allowedWorkflows: string[];
}
export interface N8nSecret {
  signingSecret: string;
}

export interface GoogleSettings {
  clientId: string;
  /** Lecture des e-mails par les agents (désactivée par défaut). */
  gmailRead: boolean;
  /** Seuls les messages correspondant à cette requête Gmail sont lisibles (ex. label:ai-hq). */
  readFilter: string;
  /** Envoi d'e-mails (toujours après validation humaine). */
  gmailSend: boolean;
  grantedScopes: string[];
}
export interface GoogleSecret {
  clientSecret: string;
  refreshToken?: string;
}

export interface SlackSecret {
  webhookUrl: string;
}

export type SheetsMode = "off" | "demo" | "n8n" | "direct";
export interface SheetsSettings {
  /** Une seule voie de synchronisation à la fois. */
  mode: SheetsMode;
  spreadsheetId: string;
  sheetName: string;
}

export interface ConnectorRow<S = Record<string, unknown>> {
  kind: ConnectorKind;
  settings: S;
  hasSecret: boolean;
  status: ConnectorStatus;
  account: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
}

export const DEFAULTS: Record<ConnectorKind, Record<string, unknown>> = {
  n8n: { hosting: "cloud", webhookUrl: "", allowedWorkflows: ["sync_mission"] } satisfies N8nSettings,
  google: { clientId: "", gmailRead: false, readFilter: "label:ai-hq", gmailSend: true, grantedScopes: [] } satisfies GoogleSettings,
  slack: {},
  sheets: { mode: "demo", spreadsheetId: "", sheetName: "Missions" } satisfies SheetsSettings,
};

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super("AIHQ_ENCRYPTION_KEY n'est pas défini : impossible de stocker un secret de manière sûre. Générez-la avec : openssl rand -base64 32");
  }
}

/** Connecteurs résolus pour l'exécution (secrets déchiffrés, uniquement côté serveur). */
export interface ResolvedConnectors {
  n8n: (N8nSettings & N8nSecret & { connected: boolean }) | null;
  google: (GoogleSettings & GoogleSecret & { connected: boolean; account: string | null }) | null;
  slack: (SlackSecret & { connected: boolean }) | null;
  sheets: SheetsSettings;
}

export class ConnectorStore {
  constructor(
    readonly db: Pool,
    readonly box: SecretBox | null = SecretBox.fromEnv(),
  ) {}

  private toRow(r: Record<string, unknown> | undefined, kind: ConnectorKind): ConnectorRow {
    if (!r) return { kind, settings: { ...DEFAULTS[kind] }, hasSecret: false, status: "not_configured", account: null, lastTestedAt: null, lastError: null };
    return {
      kind,
      settings: { ...DEFAULTS[kind], ...(r.settings as Record<string, unknown>) },
      hasSecret: Boolean(r.secret_enc),
      status: r.status as ConnectorStatus,
      account: (r.account as string) ?? null,
      lastTestedAt: r.last_tested_at ? String(r.last_tested_at) : null,
      lastError: (r.last_error as string) ?? null,
    };
  }

  async get(kind: ConnectorKind): Promise<ConnectorRow> {
    const r = await this.db.query("SELECT * FROM connectors WHERE kind=$1", [kind]);
    return this.toRow(r.rows[0], kind);
  }

  async list(): Promise<ConnectorRow[]> {
    return Promise.all((["n8n", "google", "slack", "sheets"] as ConnectorKind[]).map((k) => this.get(k)));
  }

  async secret<T>(kind: ConnectorKind): Promise<T | null> {
    const r = await this.db.query("SELECT secret_enc FROM connectors WHERE kind=$1", [kind]);
    const enc = r.rows[0]?.secret_enc as string | undefined;
    if (!enc) return null;
    if (!this.box) throw new EncryptionKeyMissingError();
    return this.box.open<T>(enc);
  }

  /**
   * Enregistre les réglages (et éventuellement un secret, fusionné avec l'existant).
   * Toute modification remet le connecteur à « configuré » : il doit être retesté.
   */
  async save(kind: ConnectorKind, settings: Record<string, unknown>, secretPatch?: Record<string, unknown> | null, configured = true): Promise<ConnectorRow> {
    let enc: string | null | undefined;
    if (secretPatch === null) enc = null;
    else if (secretPatch) {
      if (!this.box) throw new EncryptionKeyMissingError();
      const current = (await this.secret<Record<string, unknown>>(kind).catch(() => null)) ?? {};
      enc = this.box.seal({ ...current, ...secretPatch });
    }
    const merged = { ...(await this.get(kind)).settings, ...settings };
    await this.db.query(
      `INSERT INTO connectors (kind, settings, secret_enc, status, updated_at) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (kind) DO UPDATE SET settings=$2, secret_enc = CASE WHEN $5 THEN $3 ELSE connectors.secret_enc END,
         status=$4, last_error=NULL, updated_at=now()`,
      [kind, JSON.stringify(merged), enc ?? null, configured ? "configured" : "not_configured", enc !== undefined],
    );
    return this.get(kind);
  }

  async setStatus(kind: ConnectorKind, status: ConnectorStatus, extra: { account?: string | null; error?: string | null } = {}): Promise<void> {
    await this.db.query(
      `INSERT INTO connectors (kind, status, account, last_error, last_tested_at) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (kind) DO UPDATE SET status=$2, account=COALESCE($3, connectors.account), last_error=$4, last_tested_at=now(), updated_at=now()`,
      [kind, status, extra.account ?? null, extra.error ?? null],
    );
  }

  /** Efface identifiants et état (révocation). Les réglages non secrets sont conservés. */
  async clear(kind: ConnectorKind, keepSettings = true): Promise<void> {
    await this.db.query(
      `UPDATE connectors SET secret_enc=NULL, status='not_configured', account=NULL, last_error=NULL, updated_at=now()${keepSettings ? "" : ", settings='{}'"} WHERE kind=$1`,
      [kind],
    );
  }

  async resolve(): Promise<ResolvedConnectors> {
    const [n8n, google, slack, sheets] = await this.list();
    const sec = async <T,>(k: ConnectorKind): Promise<T | null> => (this.box ? this.secret<T>(k).catch(() => null) : null);
    const n8nSecret = n8n.hasSecret ? await sec<N8nSecret>("n8n") : null;
    const googleSecret = google.hasSecret ? await sec<GoogleSecret>("google") : null;
    const slackSecret = slack.hasSecret ? await sec<SlackSecret>("slack") : null;
    const ns = n8n.settings as unknown as N8nSettings;
    const gs = google.settings as unknown as GoogleSettings;
    return {
      n8n: ns.webhookUrl && n8nSecret ? { ...ns, ...n8nSecret, connected: n8n.status === "connected" } : null,
      google: gs.clientId && googleSecret ? { ...gs, ...googleSecret, connected: google.status === "connected" && !!googleSecret.refreshToken, account: google.account } : null,
      slack: slackSecret ? { ...slackSecret, connected: slack.status === "connected" } : null,
      sheets: sheets.settings as unknown as SheetsSettings,
    };
  }

  // ------------------------------------------------------------ Historique des exécutions
  async logRun(r: { connector: string; action: string; target?: string | null; status: "ok" | "error" | "demo"; httpStatus?: number | null; error?: string | null; durationMs?: number; idempotencyKey?: string | null }): Promise<void> {
    await this.db.query(
      "INSERT INTO sync_runs (connector, action, target, status, http_status, error, duration_ms, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [r.connector, r.action, r.target ?? null, r.status, r.httpStatus ?? null, r.error?.slice(0, 1000) ?? null, r.durationMs ?? null, r.idempotencyKey ?? null],
    );
    await this.db.query("INSERT INTO events (kind, payload) VALUES ('sync.run', $1)", [JSON.stringify({ connector: r.connector, action: r.action, status: r.status })]);
  }

  async runs(limit = 50) {
    return (await this.db.query("SELECT * FROM sync_runs ORDER BY id DESC LIMIT $1", [limit])).rows;
  }
}
