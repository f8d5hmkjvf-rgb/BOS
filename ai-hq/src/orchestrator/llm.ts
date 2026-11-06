import Anthropic from "@anthropic-ai/sdk";
import type { OrchestratorConfig, Effort } from "./config";
import { costUsd, worstCaseUsd } from "./pricing";
import type { Store } from "./store";

export type BetaMessage = Anthropic.Beta.BetaMessage;
export type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
export type BetaToolUnion = Anthropic.Beta.BetaToolUnion;
export type BetaContentBlock = Anthropic.Beta.BetaContentBlock;

export interface LlmRequest {
  model: string;
  system: string;
  messages: BetaMessageParam[];
  tools?: BetaToolUnion[];
  maxTokens: number;
  effort: Effort;
}

/** Contrat minimal vers le modèle : l'implémentation réelle est AnthropicLlm. */
export interface LlmClient {
  create(req: LlmRequest): Promise<BetaMessage>;
}

/** Erreur non relançable (requête invalide, authentification, budget, refus). */
export class FatalError extends Error {
  readonly fatal = true;
}
export class BudgetExceededError extends FatalError {}
export class NotConfiguredError extends FatalError {}

export function isRetryable(e: unknown): boolean {
  if (e instanceof FatalError) return false;
  if (e instanceof Anthropic.RateLimitError) return true;
  if (e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError) return e.status === 408 || e.status === 409 || (e.status ?? 0) >= 500;
  return true; // erreurs réseau inconnues : on retente (borné par max_attempts)
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Clé API Anthropic invalide (401). Vérifiez ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Accès refusé par l'API Anthropic (403).";
  if (e instanceof Anthropic.RateLimitError) return "Limite de débit Anthropic atteinte (429), nouvelle tentative programmée.";
  if (e instanceof Anthropic.BadRequestError) return `Requête refusée par l'API (400) : ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Erreur API Anthropic ${e.status ?? ""} : ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Client Anthropic réel. Clé lue uniquement côté serveur (ANTHROPIC_API_KEY), jamais exposée au navigateur.
 * Repli serveur automatique (`fallbacks: "default"`) si un modèle décline une requête.
 */
export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(cfg: OrchestratorConfig) {
    if (!cfg.anthropicConfigured) throw new NotConfiguredError("ANTHROPIC_API_KEY n'est pas défini : l'orchestrateur ne peut pas appeler l'API Anthropic.");
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: cfg.anthropicBaseUrl, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  async create(req: LlmRequest): Promise<BetaMessage> {
    return this.client.beta.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      output_config: { effort: req.effort },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  }
}

export interface CallContext {
  missionId: string | null;
  taskId: string | null;
  agentId: string;
  purpose: string;
}

/**
 * Enveloppe de contrôle des coûts : vérifie le budget de la mission et le plafond quotidien
 * AVANT chaque appel, puis trace l'usage réel APRÈS.
 */
export class MeteredLlm {
  constructor(
    private llm: LlmClient,
    private store: Store,
    private cfg: OrchestratorConfig,
  ) {}

  async call(req: LlmRequest, ctx: CallContext): Promise<BetaMessage> {
    const estInput = Math.ceil((req.system.length + JSON.stringify(req.messages).length) / 3.5);
    const worst = worstCaseUsd(req.model, estInput, req.maxTokens);
    const today = await this.store.spentToday();
    if (today + worst > this.cfg.dailyBudgetUsd)
      throw new BudgetExceededError(`Plafond quotidien atteint (${today.toFixed(2)} / ${this.cfg.dailyBudgetUsd} USD). Augmentez AIHQ_DAILY_BUDGET_USD ou attendez demain.`);
    if (ctx.missionId) {
      const m = await this.store.getMission(ctx.missionId);
      if (m && m.spent_usd + worst > m.budget_usd)
        throw new BudgetExceededError(`Budget de mission atteint (${m.spent_usd.toFixed(3)} / ${m.budget_usd} USD). Augmentez le budget pour reprendre.`);
    }
    const res = await this.llm.create(req);
    const u = res.usage;
    await this.store.recordUsage({
      ...ctx,
      model: res.model,
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      webSearches: u.server_tool_use?.web_search_requests ?? 0,
      costUsd: costUsd(res.model, u),
      requestId: (res as unknown as { _request_id?: string })._request_id ?? null,
    });
    if (res.stop_reason === "refusal") {
      const d = res.stop_details;
      throw new FatalError(`Le modèle a décliné la requête${d?.category ? ` (${d.category})` : ""}.`);
    }
    return res;
  }
}

export function textOf(m: BetaMessage): string {
  return m.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
