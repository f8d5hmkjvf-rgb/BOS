import { randomUUID } from "node:crypto";
import { notifyMissionDone } from "./actions";
import { ceo } from "./agents";
import { advanceMission, runPlan, runReport, runReview } from "./ceo";
import type { OrchestratorConfig } from "./config";
import { runExecution } from "./executor";
import { BudgetExceededError, describeError, isRetryable, MeteredLlm, type LlmClient } from "./llm";
import type { LoopDeps } from "./loop";
import { runMeeting } from "./meeting";
import type { Store, Task } from "./store";

/**
 * Worker d'exécution longue : réserve des tâches en base (SKIP LOCKED), renouvelle son bail,
 * gère reprises, backoff, budgets et automatisations. Plusieurs workers peuvent tourner en parallèle.
 */
export class Worker {
  readonly id = `worker-${randomUUID().slice(0, 8)}`;
  private running = new Set<Promise<void>>();
  private stopped = false;
  readonly deps: LoopDeps;

  constructor(
    private store: Store,
    llm: LlmClient,
    private cfg: OrchestratorConfig,
    private log: (msg: string) => void = (m) => console.log(m),
  ) {
    this.deps = { store, llm: new MeteredLlm(llm, store, cfg), cfg };
  }

  /** Une itération : automatisations + remplissage des créneaux libres. Retourne le nombre de tâches lancées. */
  async tick(): Promise<number> {
    await this.store.workerHeartbeat(this.id, this.running.size);
    for (const a of await this.store.claimDueAutomations()) {
      const m = await this.store.createMission(a.goal, a.budget_usd, ceo().id, a.id);
      await this.store.linkAutomationMission(a.id, m.id);
      this.log(`[auto] mission ${m.id} créée par l'automatisation ${a.id}`);
    }
    let started = 0;
    while (this.running.size < this.cfg.workerConcurrency) {
      const t = await this.store.claimTask(this.id, this.cfg.leaseSeconds);
      if (!t) break;
      started++;
      const p = this.process(t).finally(() => this.running.delete(p));
      this.running.add(p);
    }
    return started;
  }

  async drain(): Promise<void> {
    while (this.running.size) await Promise.race(this.running);
  }

  async start(pollMs = 1000): Promise<void> {
    this.log(`${this.id} démarré (concurrence ${this.cfg.workerConcurrency})`);
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (e) {
        this.log(`[worker] ${describeError(e)}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    await this.drain();
  }

  stop(): void {
    this.stopped = true;
  }

  async process(task: Task): Promise<void> {
    const mission = await this.store.getMission(task.mission_id);
    if (!mission) return;
    const lease = setInterval(() => void this.store.extendLease(task.id, this.id, this.cfg.leaseSeconds).catch(() => undefined), (this.cfg.leaseSeconds * 1000) / 3);
    const onProgress = () => this.store.extendLease(task.id, this.id, this.cfg.leaseSeconds);
    this.log(`[${task.kind}] ${task.assignee} → ${task.title}`);
    try {
      const d = this.deps;
      const r =
        task.kind === "plan"
          ? await runPlan(d, mission, task, onProgress)
          : task.kind === "meeting"
            ? await runMeeting(d, mission, task, onProgress)
            : task.kind === "execute"
              ? await runExecution(d, mission, task, onProgress)
              : task.kind === "review"
                ? await runReview(d, mission, task, onProgress)
                : await runReport(d, mission, task, onProgress);
      if (r === "awaiting") {
        this.log(`[attente] ${task.title} : validation humaine requise`);
        return;
      }
      await advanceMission(d, mission.id);
      const after = await this.store.getMission(mission.id);
      if (after?.status === "done") await notifyMissionDone(this.cfg, after);
    } catch (e) {
      const msg = describeError(e);
      if (e instanceof BudgetExceededError) {
        // Pas un échec : la mission est mise en pause, la tâche reprendra quand le budget sera relevé.
        await this.store.setTaskStatus(task.id, "pending");
        await this.store.updateMission(mission.id, { status: "paused", error: msg });
      } else {
        await this.store.failTask(task.id, msg, isRetryable(e));
      }
      this.log(`[erreur] ${task.title} : ${msg}`);
    } finally {
      clearInterval(lease);
    }
  }
}
