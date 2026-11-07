"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ApprovalRow, type MissionDetail, type MissionRow, type Status } from "./api";

const STATUS_FR: Record<string, string> = {
  planning: "Gaspard planifie",
  running: "En cours",
  reviewing: "Vérification",
  reporting: "Rapport final",
  awaiting_approval: "Attend ta validation",
  paused: "En pause",
  done: "Terminée",
  failed: "Échec",
  cancelled: "Annulée",
  blocked: "En attente",
  pending: "Prête",
};
const KIND_FR: Record<string, string> = { plan: "Plan", meeting: "Réunion", execute: "Tâche", review: "Revue", report: "Rapport" };

export type NameOf = (id: string) => string;

export function useStatus(refreshKey: number) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    api<Status>("/api/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [refreshKey]);
  return status;
}

export function ConfigBanner({ status }: { status: Status | null }) {
  if (!status) return <div className="banner warn">Statut de l&apos;orchestrateur indisponible.</div>;
  const today = status.usage?.today ?? 0;
  const daily = status.budgets.dailyUsd;
  if (today >= daily)
    return (
      <div className="banner warn" role="alert">
        <strong>Plafond quotidien atteint</strong> ({today.toFixed(2)} / {daily} $) : plus aucun appel IA aujourd&apos;hui, le QG continue de vivre.
      </div>
    );
  const budgetWarn =
    today >= 0.8 * daily ? (
      <div className="banner warn" role="alert">
        <strong>Attention :</strong> {Math.round((today / daily) * 100)} % du budget quotidien consommé ({today.toFixed(2)} / {daily} $).
      </div>
    ) : null;
  if (budgetWarn && status.missing.length === 0 && !status.workerWarning) return budgetWarn;
  if (status.missing.length === 0 && !status.workerWarning) return null;
  return (
    <div className="banner warn" role="alert">
      <strong>Configuration requise</strong>
      <ul className="plain">
        {status.missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
        {status.workerWarning && <li>{status.workerWarning}</li>}
      </ul>
      <p className="small muted">Le QG continue de vivre, mais aucune mission IA ne s&apos;exécute tant que ces points ne sont pas réglés. Voir le README.</p>
    </div>
  );
}

export function GaspardPanel({ status, refreshKey, nameOf, onError }: { status: Status | null; refreshKey: number; nameOf: NameOf; onError: (m: string) => void }) {
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [priority, setPriority] = useState("normale");
  const [sending, setSending] = useState(false);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MissionDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setMissions(await api<MissionRow[]>("/api/missions"));
    } catch {
      setMissions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!openId) return setDetail(null);
    api<MissionDetail>(`/api/missions/${openId}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [openId, refreshKey]);

  const submit = async () => {
    setSending(true);
    try {
      const m = await api<MissionRow>("/api/missions", { method: "POST", body: JSON.stringify({ goal, priority, budgetUsd: budget ? Number(budget) : undefined }) });
      setGoal("");
      setOpenId(m.id);
      await load();
    } catch (e) {
      onError(e instanceof ApiError && e.missing.length ? e.missing.join(" ") : e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const act = async (action: string) => {
    if (!openId) return;
    let budgetUsd: number | undefined;
    if (action === "resume") {
      const v = window.prompt("Nouveau budget total de la mission (USD) :", String((detail?.mission.budget_usd ?? 1) * 2));
      if (!v) return;
      budgetUsd = Number(v);
    }
    if (action === "cancel" && !window.confirm("Annuler cette mission ?")) return;
    try {
      await api(`/api/missions/${openId}`, { method: "POST", body: JSON.stringify({ action, budgetUsd }) });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const disabled = !status || status.missing.length > 0;
  return (
    <>
      <section className="card">
        <h3>Confier un objectif à Gaspard</h3>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={4}
          placeholder="Ex. : Prépare le lancement de ma formation en ligne : cible, offre, page de vente et plan d'acquisition sur 30 jours."
          aria-label="Objectif"
          disabled={disabled}
        />
        <div className="row between">
          <label className="small muted">
            Priorité{" "}
            <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={disabled}>
              <option value="basse">basse</option>
              <option value="normale">normale</option>
              <option value="haute">haute</option>
              <option value="urgente">urgente</option>
            </select>
          </label>
          <label className="small muted">
            Budget (USD){" "}
            <input type="number" min="0.1" step="0.5" max={status?.budgets.maxMissionUsd} value={budget} placeholder={String(status?.budgets.missionUsd ?? "")} onChange={(e) => setBudget(e.target.value)} disabled={disabled} className="num-in" />
          </label>
          <button className="primary" onClick={submit} disabled={disabled || sending || goal.trim().length < 10}>
            {sending ? "Envoi…" : "Confier à Gaspard"}
          </button>
        </div>
        {disabled && <p className="small muted">Indisponible tant que la configuration n&apos;est pas complète.</p>}
      </section>

      <section className="card">
        <h3>Missions</h3>
        {missions.length === 0 ? (
          <p className="small muted">Aucune mission pour l&apos;instant.</p>
        ) : (
          <ul className="plain missions">
            {missions.map((m) => (
              <li key={m.id}>
                <button className={`mission ${openId === m.id ? "on" : ""}`} onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                  <span className={`pill s-${m.status}`}>{STATUS_FR[m.status] ?? m.status}</span>
                  <span className="goal">{m.goal}</span>
                  <span className={`small ${m.spent_usd >= 0.8 * m.budget_usd ? "warn-text" : "muted"}`}>
                    {m.spent_usd.toFixed(3)} / {m.budget_usd} ${m.spent_usd >= 0.8 * m.budget_usd ? " ⚠ 80 % du budget" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && (
        <section className="card">
          <div className="row between">
            <h3>Détail</h3>
            <span className="row">
              {detail.mission.status === "failed" && <button onClick={() => act("retry")}>Relancer</button>}
              {detail.mission.status === "paused" && <button onClick={() => act("resume")}>Relever le budget</button>}
              {!["done", "cancelled", "failed"].includes(detail.mission.status) && (
                <button className="link" onClick={() => act("cancel")}>
                  Annuler
                </button>
              )}
            </span>
          </div>
          {detail.mission.error && <p className="error small">{detail.mission.error}</p>}
          <ul className="plain tasks">
            {detail.tasks.map((t) => (
              <li key={t.id}>
                <span className={`pill s-${t.status}`}>{STATUS_FR[t.status] ?? t.status}</span> <strong>{KIND_FR[t.kind]}</strong> · {t.title} —{" "}
                <em>{t.kind === "meeting" ? t.participants.map(nameOf).join(", ") : nameOf(t.assignee)}</em>
                {t.revision > 0 && <span className="small muted"> (révision {t.revision})</span>}
                {t.error && t.status !== "done" && <div className="error small">{t.error}</div>}
                {t.result && t.kind === "execute" && (
                  <details>
                    <summary>Livrable</summary>
                    <div className="md">{t.result}</div>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {detail.conversations.map((c) => (
            <details key={c.id}>
              <summary>
                {c.kind === "meeting" ? "🗣 Réunion" : "💬 Consultation"} : {c.title} ({c.lines.length} répliques)
              </summary>
              <ul className="plain lines">
                {c.lines.map((l, i) => (
                  <li key={i}>
                    <strong>{nameOf(l.speaker)}</strong> : {l.text}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {detail.mission.result && (
            <details open>
              <summary>Rapport de Gaspard</summary>
              <div className="md">{detail.mission.result}</div>
            </details>
          )}
        </section>
      )}
    </>
  );
}

export function ApprovalsPanel({ refreshKey, nameOf, onError }: { refreshKey: number; nameOf: NameOf; onError: (m: string) => void }) {
  const [items, setItems] = useState<ApprovalRow[]>([]);
  const load = useCallback(() => {
    api<ApprovalRow[]>("/api/approvals")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load, refreshKey]);
  const decide = async (a: ApprovalRow, decision: "approved" | "rejected") => {
    const verb = decision === "approved" ? "AUTORISER et exécuter" : "refuser";
    if (!window.confirm(`Voulez-vous ${verb} cette action réelle ?\n\n${a.summary}\n\n${JSON.stringify(a.payload.message ?? a.payload, null, 2).slice(0, 800)}`)) return;
    try {
      await api(`/api/approvals/${a.id}`, { method: "POST", body: JSON.stringify({ decision, humanConfirmed: true }) });
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const pending = items.filter((a) => a.status === "pending");
  return (
    <section className="card">
      <h3>Validations humaines ({pending.length})</h3>
      {items.length === 0 && <p className="small muted">Aucune action sensible demandée. Rien ne part vers l&apos;extérieur sans ton accord.</p>}
      <ul className="plain intents">
        {items.map((a) => (
          <li key={a.id}>
            <span>
              <strong>{nameOf(a.agent_id)}</strong> — {a.summary}
            </span>
            {typeof a.payload.message === "string" && <div className="md small">{a.payload.message}</div>}
            {a.status === "pending" ? (
              <span className="row">
                <button className="primary" onClick={() => decide(a, "approved")}>
                  Autoriser
                </button>
                <button className="link" onClick={() => decide(a, "rejected")}>
                  Refuser
                </button>
              </span>
            ) : (
              <em className="muted small">
                {a.status}
                {a.result ? ` — ${a.result}` : ""}
              </em>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CostsPanel({ status, nameOf, refreshKey, onError }: { status: Status | null; nameOf: NameOf; refreshKey: number; onError: (m: string) => void }) {
  const [autos, setAutos] = useState<{ id: string; goal: string; interval_minutes: number; enabled: boolean; next_run_at: string }[]>([]);
  const [goal, setGoal] = useState("");
  const [every, setEvery] = useState("1440");
  const load = useCallback(() => {
    api<typeof autos>("/api/automations")
      .then(setAutos)
      .catch(() => setAutos([]));
  }, []);
  useEffect(load, [load, refreshKey]);
  const create = async () => {
    try {
      await api("/api/automations", { method: "POST", body: JSON.stringify({ goal, intervalMinutes: Number(every) }) });
      setGoal("");
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggle = async (id: string, enabled: boolean) => {
    await api(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }).catch((e) => onError(String(e)));
    load();
  };
  const u = status?.usage;
  return (
    <>
      <section className="card">
        <h3>Coûts API</h3>
        {u ? (
          <>
            <p>
              Aujourd&apos;hui : <strong>{u.today.toFixed(3)} $</strong> / plafond {status!.budgets.dailyUsd} $ · Total : {u.total.toFixed(3)} $ · {u.calls} appels
            </p>
            <ul className="plain small">
              {u.byAgent.map((b) => (
                <li key={b.agent_id}>
                  {nameOf(b.agent_id)} : {b.cost.toFixed(3)} $ ({b.calls} appels)
                </li>
              ))}
            </ul>
            <p className="small muted">
              Modèle économique (par défaut) : {status!.models.economy} · modèle avancé (Gaspard et tâches complexes) : {status!.models.advanced}. Budget par mission :{" "}
              {status!.budgets.missionUsd} $ (plafond {status!.budgets.maxMissionUsd} $).
            </p>
          </>
        ) : (
          <p className="small muted">Disponible quand PostgreSQL est configuré.</p>
        )}
      </section>
      <section className="card">
        <h3>Automatisations</h3>
        <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex. : Veille concurrentielle et synthèse des nouveautés du marché." aria-label="Objectif récurrent" />
        <div className="row between">
          <label className="small muted">
            Toutes les{" "}
            <select value={every} onChange={(e) => setEvery(e.target.value)}>
              <option value="60">heures</option>
              <option value="1440">24 h</option>
              <option value="10080">semaines</option>
            </select>
          </label>
          <button onClick={create} disabled={goal.trim().length < 10}>
            Programmer
          </button>
        </div>
        <ul className="plain small">
          {autos.map((a) => (
            <li key={a.id} className="row between">
              <span>{a.goal}</span>
              <button className="link" onClick={() => toggle(a.id, !a.enabled)}>
                {a.enabled ? "Désactiver" : "Activer"}
              </button>
            </li>
          ))}
        </ul>
        <ul className="plain small">
          <li>Slack : {status?.integrations.slack ? "connecté" : "non configuré (AIHQ_SLACK_WEBHOOK_URL)"}</li>
          <li>n8n : {status?.integrations.n8n ? "connecté" : "non configuré (AIHQ_N8N_WEBHOOK_URL)"}</li>
          <li>Gmail : {status?.integrations.gmail ? `connecté (${status.integrations.gmail})` : "non configuré (GMAIL_*)"}</li>
          <li>Recherche web : {status?.integrations.webSearch ? "active" : "désactivée"}</li>
        </ul>
        <p className="small muted">Toute action d&apos;un agent vers ces services attend ta validation dans l&apos;onglet Validations.</p>
      </section>
    </>
  );
}

/** Fiche IA d'un agent : compétences, outils autorisés et derniers échanges réels. */
export function AgentAiCard({ id, nameOf }: { id: string; nameOf: NameOf }) {
  const [data, setData] = useState<{ spec: { skills: string[]; tools: string[]; systemPrompt: string }; history: { role: string; content: unknown; created_at: string }[] } | null>(null);
  useEffect(() => {
    setData(null);
    api<NonNullable<typeof data>>(`/api/agents/${id}`)
      .then(setData)
      .catch(() => setData(null));
  }, [id]);
  if (!data) return null;
  const lastTexts = data.history
    .flatMap((h) =>
      (Array.isArray(h.content) ? h.content : [])
        .filter((b: { type?: string }) => b.type === "text" || b.type === "tool_use")
        .map((b: { type: string; text?: string; name?: string }) => `${h.role === "assistant" ? nameOf(id) : "→"} ${b.type === "text" ? b.text : `[outil ${b.name}]`}`),
    )
    .slice(0, 6);
  return (
    <details>
      <summary>Fiche IA et historique</summary>
      <p className="small">
        <strong>Compétences :</strong> {data.spec.skills.join(", ") || "—"}
        <br />
        <strong>Outils autorisés :</strong> {data.spec.tools.join(", ")}
      </p>
      <details>
        <summary>Instructions système</summary>
        <div className="md small">{data.spec.systemPrompt}</div>
      </details>
      {lastTexts.length > 0 ? (
        <ul className="plain small lines">
          {lastTexts.map((t, i) => (
            <li key={i}>{t.slice(0, 300)}</li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Pas encore d&apos;historique de mission.</p>
      )}
    </details>
  );
}
