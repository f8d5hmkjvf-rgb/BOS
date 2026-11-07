import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement des secrets au repos (tokens OAuth, secrets de webhook) : AES-256-GCM.
 * Clé : AIHQ_ENCRYPTION_KEY = 32 octets en base64 (openssl rand -base64 32). Sans clé, aucun secret n'est stocké.
 */
export class SecretBox {
  private key: Buffer;

  constructor(base64Key: string) {
    const k = Buffer.from(base64Key, "base64");
    if (k.length !== 32) throw new Error("AIHQ_ENCRYPTION_KEY doit faire 32 octets encodés en base64 (openssl rand -base64 32).");
    this.key = k;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SecretBox | null {
    return env.AIHQ_ENCRYPTION_KEY ? new SecretBox(env.AIHQ_ENCRYPTION_KEY) : null;
  }

  seal(plain: unknown): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([c.update(JSON.stringify(plain), "utf8"), c.final()]);
    return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
  }

  open<T>(sealed: string): T {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1") throw new Error("Format de secret inconnu.");
    const d = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8")) as T;
  }
}

/** Signature HMAC des webhooks sortants : sha256=hex(HMAC(secret, timestamp + "." + corps)). */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Vérification (côté récepteur, et pour les tests) avec fenêtre anti-rejeu de 5 minutes. */
export function verifySignature(secret: string, timestamp: string, body: string, signature: string, nowMs = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts * 1000) > 5 * 60 * 1000) return false;
  const a = Buffer.from(signPayload(secret, timestamp, body));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
