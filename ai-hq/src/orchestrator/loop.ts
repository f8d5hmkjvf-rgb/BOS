import type Anthropic from "@anthropic-ai/sdk";
import type { Effort, OrchestratorConfig } from "./config";
import { FatalError, textOf, type BetaMessageParam, type BetaToolUnion, type MeteredLlm } from "./llm";
import type { Store, Task } from "./store";
import type { ConnectorStore } from "./connectors";

export type ToolOutcome =
  | { kind: "result"; content: string; isError?: boolean }
  /** Action sensible : la boucle s'arrête jusqu'à la décision humaine. */
  | { kind: "awaiting"; approvalId: string }
  /** Outil terminal (livrable, plan, revue) : fin de la boucle. */
  | { kind: "done"; value: unknown; content: string };

export type ToolHandler = (input: Record<string, unknown>, toolUseId: string, siblings: ToolResultParam[]) => Promise<ToolOutcome>;
export type ToolResultParam = Anthropic.Beta.BetaToolResultBlockParam;

export interface LoopParams {
  task: Task;
  agentId: string;
  purpose: string;
  model: string;
  effort: Effort;
  maxTokens: number;
  system: string;
  kickoff: string;
  tools: BetaToolUnion[];
  handlers: Record<string, ToolHandler>;
  /** Si aucun outil terminal n'est défini, la réponse texte finale termine la boucle. */
  terminal: string[];
  nudge?: string;
  onProgress?: () => Promise<void>;
}

export type LoopResult = { kind: "done"; value: unknown } | { kind: "text"; text: string } | { kind: "awaiting" };

export interface LoopDeps {
  store: Store;
  llm: MeteredLlm;
  cfg: OrchestratorConfig;
  /** Connecteurs configurés dans les Paramètres (absent : aucune intégration). */
  connectors?: ConnectorStore;
  fetchImpl?: typeof fetch;
}

/**
 * Boucle agentique persistante : chaque message est enregistré, la boucle reprend exactement
 * là où elle s'était arrêtée (crash du worker, attente de validation humaine, révision demandée).
 */
export async function runLoop(d: LoopDeps, p: LoopParams): Promise<LoopResult> {
  const messages = (await d.store.transcript(p.task.id)) as BetaMessageParam[];
  if (messages.length === 0) {
    const first: BetaMessageParam = { role: "user", content: [{ type: "text", text: p.kickoff }] };
    await d.store.appendMessage(p.task, p.agentId, "user", first.content);
    messages.push(first);
  }

  // Reprise : le dernier message est un appel d'outils sans résultat (attente de validation ou crash).
  const last = messages[messages.length - 1];
  if (last.role === "assistant") {
    const r = await handleTools(d, p, messages, last.content as Anthropic.Beta.BetaContentBlock[]);
    if (r) return r;
  }

  let nudges = 0;
  let iterations = messages.filter((m) => m.role === "assistant").length;
  while (iterations < d.cfg.maxToolIterations) {
    iterations++;
    await p.onProgress?.();
    const res = await d.llm.call(
      { model: p.model, system: p.system, messages, tools: p.tools.length ? p.tools : undefined, maxTokens: p.maxTokens, effort: p.effort },
      { missionId: p.task.mission_id, taskId: p.task.id, agentId: p.agentId, purpose: p.purpose },
    );
    messages.push({ role: "assistant", content: res.content });
    await d.store.appendMessage(p.task, p.agentId, "assistant", res.content);

    if (res.stop_reason === "pause_turn") continue;
    const hasTools = res.content.some((b) => b.type === "tool_use");
    if (hasTools) {
      const r = await handleTools(d, p, messages, res.content);
      if (r) return r;
      continue;
    }
    if (p.terminal.length === 0) return { kind: "text", text: textOf(res) };
    if (res.stop_reason === "max_tokens") {
      await pushUser(d, p, messages, "Ta réponse a été coupée (limite de longueur). Sois plus concis et termine avec l'outil prévu.");
      continue;
    }
    if (++nudges > 2) throw new FatalError(`${p.agentId} n'a pas utilisé ${p.terminal.join("/")} malgré deux relances.`);
    await pushUser(d, p, messages, p.nudge ?? `Termine en appelant l'outil ${p.terminal[0]}.`);
  }
  throw new FatalError(`Nombre maximal d'itérations atteint (${d.cfg.maxToolIterations}) pour « ${p.task.title} ».`);
}

async function pushUser(d: LoopDeps, p: LoopParams, messages: BetaMessageParam[], text: string) {
  const content = [{ type: "text" as const, text }];
  messages.push({ role: "user", content });
  await d.store.appendMessage(p.task, p.agentId, "user", content);
}

async function handleTools(d: LoopDeps, p: LoopParams, messages: BetaMessageParam[], content: Anthropic.Beta.BetaContentBlock[] | unknown): Promise<LoopResult | null> {
  const blocks = (Array.isArray(content) ? content : []) as Anthropic.Beta.BetaContentBlock[];
  const uses = blocks.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  if (uses.length === 0) return null;
  const results: ToolResultParam[] = [];
  let done: { value: unknown } | null = null;
  // Résultats déjà calculés avant une mise en attente de validation : on ne réexécute pas ces outils.
  const cached = new Map<string, ToolResultParam>();
  for (const a of await d.store.approvalsForTask(p.task.id))
    for (const r of ((a.payload as { siblings?: ToolResultParam[] }).siblings ?? [])) cached.set(r.tool_use_id, r);
  for (const u of uses) {
    const hit = cached.get(u.id);
    if (hit) {
      results.push(hit);
      continue;
    }
    const h = p.handlers[u.name];
    let out: ToolOutcome;
    if (!h) out = { kind: "result", content: `Outil « ${u.name} » non autorisé pour cet agent.`, isError: true };
    else {
      try {
        out = await h((u.input ?? {}) as Record<string, unknown>, u.id, results);
      } catch (e) {
        if (e instanceof FatalError) throw e;
        out = { kind: "result", content: `Erreur de l'outil : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    }
    if (out.kind === "awaiting") return { kind: "awaiting" };
    if (out.kind === "done") done = { value: out.value };
    results.push({ type: "tool_result", tool_use_id: u.id, content: out.content, ...(out.kind === "result" && out.isError ? { is_error: true } : {}) });
  }
  messages.push({ role: "user", content: results });
  await d.store.appendMessage(p.task, p.agentId, "user", results);
  return done ? { kind: "done", value: done.value } : null;
}
