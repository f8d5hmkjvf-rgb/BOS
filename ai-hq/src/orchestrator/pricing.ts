/** Tarifs publics Anthropic (USD par million de tokens), utilisés pour le contrôle des coûts. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
/** Recherche web : 10 USD pour 1 000 requêtes. */
const WEB_SEARCH_USD = 0.01;

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** Prix inconnu → on applique le tarif le plus cher connu (prudence budgétaire). */
export function priceOf(model: string): Price {
  return PRICES[model] ?? { input: 10, output: 50, cacheRead: 1 };
}

export function costUsd(model: string, u: UsageLike): number {
  const p = priceOf(model);
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (
    (u.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.output) / 1e6 +
    searches * WEB_SEARCH_USD
  );
}

/** Coût maximal d'un appel (pour vérifier le budget AVANT l'appel). */
export function worstCaseUsd(model: string, estInputTokens: number, maxTokens: number): number {
  const p = priceOf(model);
  return (estInputTokens * p.input + maxTokens * p.output) / 1e6;
}
