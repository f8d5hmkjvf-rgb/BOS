import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { tx } from "./db";

export type MissionStatus = "planning" | "running" | "reviewing" | "reporting" | "awaiting_approval" | "paused" | "done" | "failed" | "cancelled";
export type TaskKind = "plan" | "meeting" | "execute" | "review" | "report";
export type TaskStatus = "blocked" | "pending" | "running" | "awaiting_approval" | "done" | "failed" | "cancelled";

export interface Mission {
  id: string;
  goal: string;
  status: MissionStatus;
  plan: unknown;
  result: string | null;
  error: string | null;
  budget_usd: number;
  spent_usd: number;
  review_round: number;
  automation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  mission_id: string;
  key: string;
  kind: TaskKind;
  title: string;
  description: string;
  deliverable: string;
  assignee: string;
  participants: string[];
  depends_on: string[];
  status: TaskStatus;
  attempts: number;
  max_attempts: number;
  revision: number;
  feedback: string | null;
  result: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface NewTask {
  key: string;
  kind: TaskKind;
  title: string;
  description?: string;
  deliverable?: string;
  assignee: string;
  participants?: string[];
  depends_on?: string[];
}

type Q = Pool | PoolClient;

const toMission = (r: Record<string, unknown>): Mission => ({ ...(r as unknown as Mission), budget_usd: Number(r.budget_usd), spent_usd: Number(r.spent_usd) });

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Accès persistant aux missions, tâches, conversations, validations, coûts et événements. */
export class Store {
  constructor(readonly db: Pool) {}

  // ------------------------------------------------------------ Événements
  async emit(kind: string, payload: Record<string, unknown>, q: Q = this.db): Promise<void> {
    await q.query("INSERT INTO events (kind, payload) VALUES ($1, $2)", [kind, JSON.stringify(payload)]);
  }

  async eventsSince(id: number, limit = 200): Promise<{ id: number; kind: string; payload: Record<string, unknown>; created_at: string }[]> {
    const r = await this.db.query("SELECT id, kind, payload, created_at FROM events WHERE id > $1 ORDER BY id LIMIT $2", [id, limit]);
    return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
  }

  async lastEventId(): Promise<number> {
    const r = await this.db.query("SELECT COALESCE(MAX(id), 0) AS id FROM events");
    return Number(r.rows[0].id);
  }

  // ------------------------------------------------------------ Missions
  async createMission(goal: string, budgetUsd: number, ceoId: string, automationId: string | null = null): Promise<Mission> {
    return tx(this.db, async (c) => {
      const id = newId("m");
      const r = await c.query(
        "INSERT INTO missions (id, goal, status, budget_usd, automation_id) VALUES ($1,$2,'planning',$3,$4) RETURNING *",
        [id, goal, budgetUsd, automationId],
      );
      await this.insertTasks(id, [{ key: "plan", kind: "plan", title: "Analyse et plan de mission", description: goal, assignee: ceoId }], c);
      await this.emit("mission.created", { missionId: id, goal }, c);
      return toMission(r.rows[0]);
    });
  }

  async getMission(id: string): Promise<Mission | null> {
    const r = await this.db.query("SELECT * FROM missions WHERE id=$1", [id]);
    return r.rows[0] ? toMission(r.rows[0]) : null;
  }

  async listMissions(limit = 30): Promise<Mission[]> {
    const r = await this.db.query("SELECT * FROM missions ORDER BY created_at DESC LIMIT $1", [limit]);
    return r.rows.map(toMission);
  }

  async updateMission(id: string, fields: Partial<Pick<Mission, "status" | "plan" | "result" | "error" | "review_round" | "budget_usd">>, q: Q = this.db): Promise<void> {
    const keys = Object.keys(fields) as (keyof typeof fields)[];
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
    const vals = keys.map((k) => (k === "plan" ? JSON.stringify(fields[k]) : fields[k]));
    await q.query(`UPDATE missions SET ${sets}, updated_at=now() WHERE id=$1`, [id, ...vals]);
    await this.emit("mission.updated", { missionId: id, ...fields, plan: undefined }, q);
  }

  // ------------------------------------------------------------ Tâches
  async insertTasks(missionId: string, tasks: NewTask[], q: Q = this.db): Promise<Task[]> {
    const out: Task[] = [];
    for (const t of tasks) {
      const deps = t.depends_on ?? [];
      const r = await q.query(
        `INSERT INTO tasks (id, mission_id, key, kind, title, description, deliverable, assignee, participants, depends_on, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [newId("t"), missionId, t.key, t.kind, t.title, t.description ?? "", t.deliverable ?? "", t.assignee, t.participants ?? [], deps, deps.length ? "blocked" : "pending"],
      );
      out.push(r.rows[0]);
      await this.emit("task.updated", taskEvent(r.rows[0]), q);
    }
    // Les dépendances déjà satisfaites débloquent immédiatement.
    await this.unblock(missionId, q);
    return out;
  }

  async tasksOf(missionId: string): Promise<Task[]> {
    const r = await this.db.query("SELECT * FROM tasks WHERE mission_id=$1 ORDER BY created_at, key", [missionId]);
    return r.rows;
  }

  async getTask(id: string): Promise<Task | null> {
    const r = await this.db.query("SELECT * FROM tasks WHERE id=$1", [id]);
    return r.rows[0] ?? null;
  }

  /** Remet en file les tâches dont le bail a expiré (worker mort), puis réserve la prochaine tâche prête. */
  async claimTask(workerId: string, leaseSeconds: number): Promise<Task | null> {
    await this.db.query(
      `UPDATE tasks SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
              error = COALESCE(error, '') || ' [bail expiré]', lease_owner=NULL, lease_until=NULL, updated_at=now()
       WHERE status='running' AND lease_until < now()`,
    );
    const r = await this.db.query(
      `UPDATE tasks SET status='running', attempts=attempts+1, lease_owner=$1, lease_until=now() + ($2 || ' seconds')::interval,
              started_at=COALESCE(started_at, now()), updated_at=now()
       WHERE id = (
         SELECT t.id FROM tasks t JOIN missions m ON m.id = t.mission_id
         WHERE t.status='pending' AND t.run_after <= now() AND m.status NOT IN ('paused','cancelled','failed','done')
         ORDER BY t.run_after, t.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1)
       RETURNING *`,
      [workerId, String(leaseSeconds)],
    );
    const t = r.rows[0] as Task | undefined;
    if (t) await this.emit("task.updated", taskEvent(t));
    return t ?? null;
  }

  async extendLease(taskId: string, workerId: string, leaseSeconds: number): Promise<void> {
    await this.db.query("UPDATE tasks SET lease_until = now() + ($3 || ' seconds')::interval WHERE id=$1 AND lease_owner=$2 AND status='running'", [taskId, workerId, String(leaseSeconds)]);
  }

  async completeTask(taskId: string, result: string): Promise<Task> {
    return tx(this.db, async (c) => {
      const r = await c.query(
        "UPDATE tasks SET status='done', result=$2, error=NULL, lease_owner=NULL, lease_until=NULL, finished_at=now(), updated_at=now() WHERE id=$1 RETURNING *",
        [taskId, result],
      );
      const t = r.rows[0] as Task;
      await this.emit("task.updated", taskEvent(t), c);
      await this.unblock(t.mission_id, c);
      return t;
    });
  }

  /** Échec : nouvelle tentative avec backoff exponentiel, sinon échec définitif de la mission. */
  async failTask(taskId: string, error: string, retryable: boolean): Promise<Task> {
    return tx(this.db, async (c) => {
      const cur = (await c.query("SELECT * FROM tasks WHERE id=$1 FOR UPDATE", [taskId])).rows[0] as Task;
      const retry = retryable && cur.attempts < cur.max_attempts;
      const backoff = Math.min(600, 15 * 2 ** Math.max(0, cur.attempts - 1));
      const r = await c.query(
        `UPDATE tasks SET status=$2, error=$3, lease_owner=NULL, lease_until=NULL, run_after=now() + ($4 || ' seconds')::interval,
                finished_at = CASE WHEN $2='failed' THEN now() ELSE NULL END, updated_at=now() WHERE id=$1 RETURNING *`,
        [taskId, retry ? "pending" : "failed", error.slice(0, 2000), String(backoff)],
      );
      const t = r.rows[0] as Task;
      await this.emit("task.updated", taskEvent(t), c);
      if (!retry) await this.updateMission(t.mission_id, { status: "failed", error: `Tâche « ${t.title} » : ${error.slice(0, 500)}` }, c);
      return t;
    });
  }

  async setTaskStatus(taskId: string, status: TaskStatus, extra: { feedback?: string | null; revision?: number } = {}, q: Q = this.db): Promise<void> {
    const r = await q.query(
      `UPDATE tasks SET status=$2, feedback=COALESCE($3, feedback), revision=COALESCE($4, revision), lease_owner=NULL, lease_until=NULL,
              run_after=now(), updated_at=now() WHERE id=$1 RETURNING *`,
      [taskId, status, extra.feedback ?? null, extra.revision ?? null],
    );
    if (r.rows[0]) await this.emit("task.updated", taskEvent(r.rows[0]), q);
  }

  private async unblock(missionId: string, q: Q): Promise<void> {
    const r = await q.query(
      `UPDATE tasks t SET status='pending', updated_at=now()
       WHERE t.mission_id=$1 AND t.status='blocked' AND NOT EXISTS (
         SELECT 1 FROM tasks d WHERE d.mission_id=t.mission_id AND d.key = ANY(t.depends_on) AND d.status <> 'done')
       RETURNING *`,
      [missionId],
    );
    for (const t of r.rows) await this.emit("task.updated", taskEvent(t), q);
  }

  /** Relance les tâches échouées d'une mission (action humaine explicite). */
  async retryMission(missionId: string): Promise<void> {
    await tx(this.db, async (c) => {
      await c.query("UPDATE tasks SET status='pending', attempts=0, error=NULL, run_after=now(), updated_at=now() WHERE mission_id=$1 AND status='failed'", [missionId]);
      const hasPlan = (await c.query("SELECT 1 FROM tasks WHERE mission_id=$1 AND kind<>'plan'", [missionId])).rowCount;
      await this.updateMission(missionId, { status: hasPlan ? "running" : "planning", error: null }, c);
      await this.unblock(missionId, c);
    });
  }

  // ------------------------------------------------------------ Historique des agents
  async appendMessage(task: Pick<Task, "id" | "mission_id">, agentId: string, role: "user" | "assistant", content: unknown): Promise<void> {
    await this.db.query("INSERT INTO agent_messages (task_id, mission_id, agent_id, role, content) VALUES ($1,$2,$3,$4,$5)", [
      task.id,
      task.mission_id,
      agentId,
      role,
      JSON.stringify(content),
    ]);
  }

  async transcript(taskId: string): Promise<{ role: "user" | "assistant"; content: unknown }[]> {
    const r = await this.db.query("SELECT role, content FROM agent_messages WHERE task_id=$1 ORDER BY id", [taskId]);
    return r.rows;
  }

  async agentHistory(agentId: string, limit = 40): Promise<{ task_id: string; mission_id: string; role: string; content: unknown; created_at: string }[]> {
    const r = await this.db.query("SELECT task_id, mission_id, role, content, created_at FROM agent_messages WHERE agent_id=$1 ORDER BY id DESC LIMIT $2", [agentId, limit]);
    return r.rows;
  }

  // ------------------------------------------------------------ Conversations
  async openConversation(c: { missionId: string | null; taskId: string | null; kind: "meeting" | "consult"; title: string; participants: string[] }): Promise<string> {
    const id = newId("c");
    await this.db.query("INSERT INTO conversations (id, mission_id, task_id, kind, title, participants, status) VALUES ($1,$2,$3,$4,$5,$6,'open')", [
      id,
      c.missionId,
      c.taskId,
      c.kind,
      c.title,
      c.participants,
    ]);
    await this.emit(`${c.kind}.started`, { conversationId: id, missionId: c.missionId, title: c.title, participants: c.participants });
    return id;
  }

  async addLine(conversationId: string, kind: "meeting" | "consult", speaker: string, text: string): Promise<void> {
    await this.db.query("INSERT INTO conversation_lines (conversation_id, speaker, text) VALUES ($1,$2,$3)", [conversationId, speaker, text]);
    await this.emit(`${kind}.line`, { conversationId, speaker, text });
  }

  async closeConversation(conversationId: string, kind: "meeting" | "consult", status: "closed" | "failed", summary: string | null): Promise<void> {
    await this.db.query("UPDATE conversations SET status=$2, summary=$3 WHERE id=$1", [conversationId, status, summary]);
    await this.emit(`${kind}.ended`, { conversationId, status });
  }

  async conversations(missionId: string): Promise<{ id: string; kind: string; title: string; participants: string[]; status: string; summary: string | null; lines: { speaker: string; text: string }[] }[]> {
    const cs = (await this.db.query("SELECT * FROM conversations WHERE mission_id=$1 ORDER BY created_at", [missionId])).rows;
    for (const c of cs) c.lines = (await this.db.query("SELECT speaker, text FROM conversation_lines WHERE conversation_id=$1 ORDER BY id", [c.id])).rows;
    return cs;
  }

  // ------------------------------------------------------------ Validations humaines
  async createApproval(a: { missionId: string; taskId: string; agentId: string; toolUseId: string; action: string; summary: string; payload: unknown }): Promise<string> {
    return tx(this.db, async (c) => {
      const id = newId("a");
      await c.query(
        "INSERT INTO approvals (id, mission_id, task_id, agent_id, tool_use_id, action, summary, payload, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')",
        [id, a.missionId, a.taskId, a.agentId, a.toolUseId, a.action, a.summary, JSON.stringify(a.payload)],
      );
      await this.setTaskStatus(a.taskId, "awaiting_approval", {}, c);
      await this.updateMission(a.missionId, { status: "awaiting_approval" }, c);
      await this.emit("approval.created", { approvalId: id, missionId: a.missionId, agentId: a.agentId, summary: a.summary }, c);
      return id;
    });
  }

  async approvals(status?: string): Promise<{ id: string; mission_id: string; task_id: string; agent_id: string; tool_use_id: string; action: string; summary: string; payload: Record<string, unknown>; status: string; result: string | null }[]> {
    const r = status
      ? await this.db.query("SELECT * FROM approvals WHERE status=$1 ORDER BY created_at DESC LIMIT 50", [status])
      : await this.db.query("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50");
    return r.rows;
  }

  async approvalsForTask(taskId: string) {
    return (await this.db.query("SELECT * FROM approvals WHERE task_id=$1 ORDER BY created_at", [taskId])).rows;
  }

  /** Décision humaine : verrouillée, une seule fois. Retourne l'approbation si la décision a été prise ici. */
  async decideApproval(id: string, decision: "approved" | "rejected") {
    return tx(this.db, async (c) => {
      const r = await c.query("UPDATE approvals SET status=$2, decided_at=now() WHERE id=$1 AND status='pending' RETURNING *", [id, decision]);
      const a = r.rows[0];
      if (a) await this.emit("approval.decided", { approvalId: id, decision, agentId: a.agent_id }, c);
      return a ?? null;
    });
  }

  async finishApproval(id: string, status: "executed" | "failed" | "rejected", result: string): Promise<void> {
    await tx(this.db, async (c) => {
      const a = (await c.query("UPDATE approvals SET status=$2, result=$3 WHERE id=$1 RETURNING *", [id, status, result.slice(0, 4000)])).rows[0];
      if (!a) return;
      // La tâche reprend : le worker relira le résultat de l'action dans l'historique.
      await this.setTaskStatus(a.task_id, "pending", {}, c);
      const m = (await c.query("SELECT status FROM missions WHERE id=$1", [a.mission_id])).rows[0];
      if (m?.status === "awaiting_approval") await this.updateMission(a.mission_id, { status: "running" }, c);
    });
  }

  // ------------------------------------------------------------ Coûts
  async recordUsage(u: {
    missionId: string | null;
    taskId: string | null;
    agentId: string;
    purpose: string;
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    webSearches: number;
    costUsd: number;
    requestId: string | null;
  }): Promise<void> {
    await tx(this.db, async (c) => {
      await c.query(
        `INSERT INTO api_usage (mission_id, task_id, agent_id, purpose, model, input_tokens, output_tokens, cache_read, cache_write, web_searches, cost_usd, request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [u.missionId, u.taskId, u.agentId, u.purpose, u.model, u.input, u.output, u.cacheRead, u.cacheWrite, u.webSearches, u.costUsd, u.requestId],
      );
      if (u.missionId) await c.query("UPDATE missions SET spent_usd = spent_usd + $2, updated_at=now() WHERE id=$1", [u.missionId, u.costUsd]);
      await this.emit("usage", { missionId: u.missionId, agentId: u.agentId, costUsd: u.costUsd, model: u.model }, c);
    });
  }

  async spentToday(): Promise<number> {
    const r = await this.db.query("SELECT COALESCE(SUM(cost_usd),0) AS s FROM api_usage WHERE created_at >= date_trunc('day', now())");
    return Number(r.rows[0].s);
  }

  async usageSummary(): Promise<{ today: number; total: number; calls: number; byAgent: { agent_id: string; cost: number; calls: number }[] }> {
    const t = (await this.db.query("SELECT COALESCE(SUM(cost_usd),0) total, COUNT(*) calls, COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now())),0) today FROM api_usage")).rows[0];
    const by = (await this.db.query("SELECT agent_id, SUM(cost_usd)::float cost, COUNT(*)::int calls FROM api_usage GROUP BY agent_id ORDER BY cost DESC LIMIT 10")).rows;
    return { today: Number(t.today), total: Number(t.total), calls: Number(t.calls), byAgent: by };
  }

  // ------------------------------------------------------------ Automatisations
  async createAutomation(goal: string, intervalMinutes: number, budgetUsd: number): Promise<string> {
    const id = newId("auto");
    await this.db.query("INSERT INTO automations (id, goal, interval_minutes, budget_usd, next_run_at) VALUES ($1,$2,$3,$4, now())", [id, goal, intervalMinutes, budgetUsd]);
    return id;
  }

  async automations() {
    return (await this.db.query("SELECT * FROM automations ORDER BY created_at DESC")).rows;
  }

  async setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db.query("UPDATE automations SET enabled=$2 WHERE id=$1", [id, enabled]);
  }

  /** Réserve atomiquement les automatisations échues (une seule instance de worker les déclenche). */
  async claimDueAutomations(): Promise<{ id: string; goal: string; budget_usd: number }[]> {
    const r = await this.db.query(
      `UPDATE automations SET next_run_at = now() + (interval_minutes || ' minutes')::interval
       WHERE id IN (SELECT id FROM automations WHERE enabled AND next_run_at <= now() FOR UPDATE SKIP LOCKED) RETURNING id, goal, budget_usd`,
    );
    return r.rows.map((x) => ({ ...x, budget_usd: Number(x.budget_usd) }));
  }

  async linkAutomationMission(id: string, missionId: string): Promise<void> {
    await this.db.query("UPDATE automations SET last_mission_id=$2 WHERE id=$1", [id, missionId]);
  }

  // ------------------------------------------------------------ Workers
  async workerHeartbeat(id: string, running: number): Promise<void> {
    await this.db.query(
      "INSERT INTO workers (id, heartbeat, running) VALUES ($1, now(), $2) ON CONFLICT (id) DO UPDATE SET heartbeat=now(), running=$2",
      [id, running],
    );
  }

  async liveWorkers(): Promise<number> {
    const r = await this.db.query("SELECT COUNT(*)::int n FROM workers WHERE heartbeat > now() - interval '30 seconds'");
    return r.rows[0].n;
  }
}

export function taskEvent(t: Task) {
  return { taskId: t.id, missionId: t.mission_id, key: t.key, kind: t.kind, title: t.title, assignee: t.assignee, participants: t.participants, status: t.status };
}
