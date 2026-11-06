import type { BetaMessage, LlmClient, LlmRequest } from "@/orchestrator/llm";

/**
 * Doublure de test UNIQUEMENT (jamais utilisée par l'application) : renvoie des réponses
 * scriptées au format exact de l'API pour tester l'orchestration sans clé.
 */
export type Script = (req: LlmRequest, n: number) => { content: unknown[]; stop_reason?: string };

export class ScriptedLlm implements LlmClient {
  calls: LlmRequest[] = [];
  constructor(private script: Script) {}
  async create(req: LlmRequest): Promise<BetaMessage> {
    this.calls.push(structuredClone(req));
    const r = this.script(req, this.calls.length);
    const hasTool = r.content.some((b) => (b as { type: string }).type === "tool_use");
    return {
      id: `msg_${this.calls.length}`,
      type: "message",
      role: "assistant",
      model: req.model,
      content: r.content,
      stop_reason: r.stop_reason ?? (hasTool ? "tool_use" : "end_turn"),
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null },
    } as unknown as BetaMessage;
  }
}

export const text = (t: string) => ({ type: "text", text: t });
let n = 0;
export const tool = (name: string, input: unknown) => ({ type: "tool_use", id: `toolu_${++n}`, name, input });

/** Dernier message utilisateur (texte ou résultats d'outils) sérialisé, pour aiguiller le script. */
export const lastUser = (req: LlmRequest) => JSON.stringify(req.messages[req.messages.length - 1]);
export const toolNames = (req: LlmRequest) => (req.tools ?? []).map((t) => (t as { name: string }).name);
