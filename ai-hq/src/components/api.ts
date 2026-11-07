"use client";

/** Client HTTP de l'interface (session par cookie ; redirection vers /login si elle a expiré). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly missing: string[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  const r = await fetch(path, { ...init, headers });
  if (r.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError("Session expirée", 401);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error === "configuration_requise" ? "Configuration requise" : (data.error ?? data.message ?? `HTTP ${r.status}`), r.status, data.missing ?? []);
  return data as T;
}

export interface Status {
  ready: boolean;
  missing: string[];
  database: string;
  anthropic: string;
  workers: number;
  workerWarning: string | null;
  models: { economy: string; advanced: string };
  budgets: { missionUsd: number; maxMissionUsd: number; dailyUsd: number };
  integrations: { slack: boolean; n8n: boolean; gmail: string | false; webhook: boolean; notify: boolean; webSearch: boolean };
  authRequired?: boolean;
  usage: { today: number; total: number; calls: number; byAgent: { agent_id: string; cost: number; calls: number }[] } | null;
}

export interface MissionRow {
  id: string;
  goal: string;
  status: string;
  result: string | null;
  error: string | null;
  budget_usd: number;
  spent_usd: number;
  created_at: string;
}

export interface TaskRow {
  id: string;
  key: string;
  kind: string;
  title: string;
  assignee: string;
  participants: string[];
  status: string;
  revision: number;
  attempts: number;
  result: string | null;
  error: string | null;
  feedback: string | null;
}

export interface ApprovalRow {
  id: string;
  mission_id: string;
  agent_id: string;
  action: string;
  summary: string;
  payload: Record<string, unknown>;
  status: string;
  result: string | null;
}

export interface MissionDetail {
  mission: MissionRow;
  tasks: TaskRow[];
  conversations: { id: string; kind: string; title: string; participants: string[]; status: string; lines: { speaker: string; text: string }[] }[];
  approvals: ApprovalRow[];
}
