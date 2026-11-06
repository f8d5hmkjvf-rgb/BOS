"use client";

import type { World } from "@/sim/engine";
import type { RealWorkStatus } from "@/sim/types";

interface TaskEvt {
  taskId: string;
  kind: string;
  title: string;
  assignee: string;
  status: string;
}

/**
 * Traduit les événements RÉELS de l'orchestrateur en comportements du QG.
 * Lecture seule pour la simulation : elle ne renvoie jamais rien vers l'orchestrateur.
 */
export class OrchestratorSync {
  private tasks = new Map<string, TaskEvt>();

  constructor(private getWorld: () => World | null) {}

  /** Réapplique l'état connu (après chargement d'une sauvegarde). */
  reapply(): void {
    const seen = new Set<string>();
    for (const t of this.tasks.values()) seen.add(t.assignee);
    for (const a of seen) this.refreshAgent(a);
  }

  handle(kind: string, data: Record<string, unknown>): void {
    const w = this.getWorld();
    switch (kind) {
      case "snapshot": {
        for (const t of (data.tasks as Record<string, unknown>[]) ?? [])
          this.task({ taskId: String(t.id), kind: String(t.kind), title: String(t.title), assignee: String(t.assignee), status: String(t.status) });
        for (const c of (data.conversations as { id: string; kind: string; title: string; participants: string[]; lines: { speaker: string; text: string }[] }[]) ?? []) {
          if (c.kind === "meeting") {
            w?.convokeMeeting(c.id, c.title, c.participants);
            for (const l of c.lines) w?.meetingLine(c.id, l.speaker, l.text);
          } else {
            w?.startConsult(c.id, c.participants[0], c.participants[1]);
            for (const l of c.lines) w?.consultLine(c.id, l.speaker, l.text);
          }
        }
        return;
      }
      case "task.updated":
        return this.task(data as unknown as TaskEvt);
      case "meeting.started":
        return w?.convokeMeeting(String(data.conversationId), String(data.title), data.participants as string[]);
      case "meeting.line":
        return w?.meetingLine(String(data.conversationId), String(data.speaker), String(data.text));
      case "meeting.ended":
        return w?.endExternalMeeting(String(data.conversationId));
      case "consult.started": {
        const p = data.participants as string[];
        return w?.startConsult(String(data.conversationId), p[0], p[1]);
      }
      case "consult.line":
        return w?.consultLine(String(data.conversationId), String(data.speaker), String(data.text));
      case "consult.ended":
        return w?.endConsult(String(data.conversationId));
    }
  }

  private task(t: TaskEvt): void {
    if (["done", "failed", "cancelled"].includes(t.status)) this.tasks.delete(t.taskId);
    else this.tasks.set(t.taskId, t);
    this.refreshAgent(t.assignee);
  }

  /** Statut réel d'un agent = agrégat de ses tâches (les réunions sont gérées par la convocation). */
  private refreshAgent(agentId: string): void {
    const w = this.getWorld();
    if (!w) return;
    const mine = [...this.tasks.values()].filter((t) => t.assignee === agentId && t.kind !== "meeting");
    const running = mine.find((t) => t.status === "running");
    const awaiting = mine.find((t) => t.status === "awaiting_approval");
    let status: RealWorkStatus = "idle";
    let title: string | null = null;
    if (running) {
      status = "busy";
      title = running.title;
    } else if (awaiting) {
      status = "awaiting_approval";
      title = awaiting.title;
    }
    w.setRealWork(agentId, { status, taskTitle: title });
  }
}
