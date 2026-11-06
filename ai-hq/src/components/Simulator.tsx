"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import { ACTIVITIES } from "@/sim/activities";
import { formatClock, World, type SimEvent, type Speed } from "@/sim/engine";
import { DEPARTMENTS } from "@/sim/roster";
import type { OfficeRenderer } from "@/render/renderer";
import { FallbackSaveAdapter, HttpSaveAdapter, LocalStorageSaveAdapter } from "@/persistence/adapters";
import type { RealWorkStatus } from "@/sim/types";
import { OrchestratorSync } from "./sync";
import { AgentAiCard, ApprovalsPanel, ConfigBanner, CostsPanel, GaspardPanel, useStatus } from "./Orchestrator";

const NEED_LABELS: [keyof World["agents"][number]["needs"], string, boolean][] = [
  ["energy", "Énergie", false],
  ["fatigue", "Fatigue", true],
  ["hunger", "Faim", true],
  ["thirst", "Soif", true],
  ["bladder", "Vessie", true],
  ["stress", "Stress", true],
  ["social", "Besoin social", true],
];

const MODE_LABEL: Record<string, string> = {
  off_duty: "Hors du bureau",
  arriving: "Arrive",
  deciding: "Réfléchit",
  task: "Activité",
  conversation: "En discussion",
  leaving: "Rentre chez soi",
};
const PHASE_LABEL: Record<string, string> = { navigating: "en route", queueing: "fait la queue", performing: "en cours" };
const STATUS_LABEL: Record<RealWorkStatus, string> = {
  idle: "disponible",
  busy: "mission en cours",
  blocked: "bloqué",
  awaiting_approval: "attend une validation",
  offline: "hors ligne",
};

interface UiState {
  clock: string;
  day: number;
  events: SimEvent[];
  occupancy: { toilets: number; coffee: number; meeting: string | null };
}

export default function Simulator() {
  const host = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const opts = useRef({ debug: false, reducedMotion: false, selected: null as string | null });
  const saver = useRef(new FallbackSaveAdapter(new HttpSaveAdapter(), new LocalStorageSaveAdapter()));
  const [speed, setSpeedState] = useState<Speed>(1);
  const [debug, setDebug] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [ui, setUi] = useState<UiState>({ clock: "--:--", day: 1, events: [], occupancy: { toilets: 0, coffee: 0, meeting: null } });
  const [, force] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<"qg" | "gaspard" | "validations" | "couts">("gaspard");
  const [orchTick, setOrchTick] = useState(0);
  const status = useStatus(orchTick);
  const sync = useRef(new OrchestratorSync(() => worldRef.current));

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const setSpeed = useCallback((s: Speed) => {
    worldRef.current?.setSpeed(s);
    setSpeedState(s);
  }, []);

  // Initialisation Pixi + boucle de simulation.
  useEffect(() => {
    let disposed = false;
    let app: Application | null = null;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    opts.current.reducedMotion = mq.matches;
    const onMq = () => (opts.current.reducedMotion = mq.matches);
    mq.addEventListener("change", onMq);

    (async () => {
      const PIXI = await import("pixi.js");
      const { OfficeRenderer } = await import("@/render/renderer");
      if (disposed || !host.current) return;
      app = new PIXI.Application();
      await app.init({ resizeTo: host.current, background: 0x1e2430, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.current.appendChild(app.canvas);
      let world = new World({ seed: 42, startSec: 8.9 * 3600 });
      // Reprise de la dernière sauvegarde automatique (PostgreSQL, sinon navigateur).
      try {
        const snap = await saver.current.load("autosave");
        if (snap && snap.seed === 42) world = World.restore(snap);
      } catch {
        /* pas de sauvegarde exploitable : nouvelle journée */
      }
      if (disposed) return;
      world.proposeIntents = false; // les actions réelles passent par l'orchestrateur et ses validations
      world.setSpeed(1);
      worldRef.current = world;
      // Accès lecture pour les tests end-to-end et le débogage depuis la console.
      (window as unknown as { __AIHQ__?: unknown }).__AIHQ__ = { get world() { return worldRef.current; } };
      const r = new OfficeRenderer(app);
      r.buildStatic(world);
      r.fit(world);
      rendererRef.current = r;

      // Le ticker lit toujours le monde courant (il peut être remplacé par un chargement).
      app.ticker.add((tk) => {
        const cur = worldRef.current;
        if (!cur) return;
        cur.advance(tk.deltaMS);
        r.draw(cur, cur.alpha, tk.deltaMS, opts.current);
      });

      // Interaction caméra : glisser pour déplacer, molette pour zoomer, clic pour sélectionner.
      const canvas = app.canvas;
      const pickWorld = () => worldRef.current ?? world;
      let drag: { x: number; y: number; moved: boolean } | null = null;
      canvas.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY, moved: false }));
      window.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        r.camera.position.x += dx;
        r.camera.position.y += dy;
        drag.x = e.clientX;
        drag.y = e.clientY;
      });
      window.addEventListener("pointerup", (e) => {
        if (drag && !drag.moved) {
          const rect = canvas.getBoundingClientRect();
          const a = r.pick(pickWorld(), e.clientX - rect.left, e.clientY - rect.top);
          opts.current.selected = a?.id ?? null;
          setSelected(a?.id ?? null);
          if (a) setTab("qg");
        }
        drag = null;
      });
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          r.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
        },
        { passive: false },
      );
    })();

    return () => {
      disposed = true;
      mq.removeEventListener("change", onMq);
      rendererRef.current = null;
      worldRef.current = null;
      app?.destroy(true, { children: true });
    };
  }, []);

  // Rafraîchissement throttlé de l'interface React (4 Hz) : pas de re-rendu à chaque frame.
  useEffect(() => {
    const id = setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      const stalls = w.rm.ofType("toilet_stall").filter((r) => r.occupant).length;
      const coffeeQ = w.rm.ofType("coffee_machine").reduce((s, r) => s + r.queue.length + (r.occupant ? 1 : 0), 0);
      const meeting = w.meetings.find((m) => m.status === "in_progress" || m.status === "gathering");
      setUi({
        clock: formatClock(w.sec),
        day: w.day + 1,
        events: w.events.slice(-14).reverse(),
        occupancy: { toilets: stalls, coffee: coffeeQ, meeting: meeting ? `${meeting.title} (${meeting.status === "gathering" ? "on s'installe" : "en cours"})` : null },
      });
      force((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Flux temps réel de l'orchestrateur → animations du QG (lecture seule pour la simulation).
  useEffect(() => {
    const es = new EventSource("/api/events");
    let bump: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(bump);
      bump = setTimeout(() => setOrchTick((n) => n + 1), 400);
    };
    const kinds = ["snapshot", "task.updated", "mission.created", "mission.updated", "meeting.started", "meeting.line", "meeting.ended", "consult.started", "consult.line", "consult.ended", "approval.created", "approval.decided", "usage"];
    for (const k of kinds)
      es.addEventListener(k, (e) => {
        setLive(true);
        sync.current.handle(k, JSON.parse((e as MessageEvent).data));
        if (k !== "meeting.line" && k !== "consult.line") refresh();
      });
    es.addEventListener("config", () => {
      setLive(false);
      es.close();
    });
    es.onerror = () => setLive(false);
    return () => {
      clearTimeout(bump);
      es.close();
    };
  }, []);

  // Sauvegarde automatique complète du QG toutes les 60 s.
  useEffect(() => {
    const id = setInterval(() => {
      const w = worldRef.current;
      if (w) void saver.current.save("autosave", w.snapshot()).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Raccourcis clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpeed(worldRef.current?.speed === 0 ? 1 : 0);
      } else if (e.key === "1") setSpeed(1);
      else if (e.key === "2") setSpeed(2);
      else if (e.key === "5") setSpeed(5);
      else if (e.key.toLowerCase() === "d") {
        opts.current.debug = !opts.current.debug;
        setDebug(opts.current.debug);
      } else if (e.key === "Escape") {
        opts.current.selected = null;
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSpeed]);

  const save = async () => {
    const w = worldRef.current;
    if (!w) return;
    try {
      await saver.current.save("default", w.snapshot());
      notify(`Sauvegardé (${saver.current.name})`);
    } catch (e) {
      notify(`Échec de la sauvegarde : ${e instanceof Error ? e.message : e}`);
    }
  };

  const load = async () => {
    const r = rendererRef.current;
    if (!r) return;
    const snap = await saver.current.load("default");
    if (!snap) return notify("Aucune sauvegarde trouvée");
    const w = World.restore(snap);
    w.proposeIntents = false;
    w.setSpeed(speed);
    worldRef.current = w;
    sync.current.reapply();
    notify(`Chargé (${saver.current.name})`);
  };

  const w = worldRef.current;
  const agent = w && selected ? w.byId.get(selected) : null;
  const nameOf = (id: string) => w?.byId.get(id)?.name ?? id;

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">
          AI HQ <span className="muted">· siège vivant · 29 agents</span>
        </div>
        <div className="clock" aria-live="off">
          Jour {ui.day} · <strong>{ui.clock}</strong>
        </div>
        <div className="controls" role="group" aria-label="Vitesse de simulation">
          {([0, 1, 2, 5] as Speed[]).map((s) => (
            <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
              {s === 0 ? "⏸ Pause" : `x${s}`}
            </button>
          ))}
          <button
            className={debug ? "on" : ""}
            aria-pressed={debug}
            onClick={() => {
              opts.current.debug = !debug;
              setDebug(!debug);
            }}
          >
            Debug
          </button>
          <button onClick={save}>Sauvegarder</button>
          <button onClick={load}>Charger</button>
          <span className={`live ${live ? "ok" : ""}`} title="Flux temps réel des missions">
            {live ? "● orchestrateur en direct" : "○ orchestrateur hors ligne"}
          </span>
        </div>
      </header>

      <main className="main">
        <div className="stage" ref={host} aria-label="Vue isométrique du bureau" />
        <aside className="side">
          <nav className="tabs" role="tablist" aria-label="Panneaux">
            {(
              [
                ["gaspard", "Gaspard"],
                ["validations", "Validations"],
                ["qg", "QG"],
                ["couts", "Coûts"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <ConfigBanner status={status} />
          {tab === "gaspard" && <GaspardPanel status={status} refreshKey={orchTick} nameOf={nameOf} onError={notify} />}
          {tab === "validations" && <ApprovalsPanel refreshKey={orchTick} nameOf={nameOf} onError={notify} />}
          {tab === "couts" && <CostsPanel status={status} refreshKey={orchTick} nameOf={nameOf} onError={notify} />}
          {tab === "qg" && (
            <>
          {agent ? (
            <section className="card">
              <div className="row between">
                <h2>
                  <span className="dot" style={{ background: `#${DEPARTMENTS[agent.profile.department].color.toString(16).padStart(6, "0")}` }} />
                  {agent.name}
                </h2>
                <button className="link" onClick={() => (setSelected(null), (opts.current.selected = null))}>
                  ✕
                </button>
              </div>
              <p className="muted">
                {agent.profile.role} · {DEPARTMENTS[agent.profile.department].label}
              </p>
              <p>
                <strong>{MODE_LABEL[agent.mode]}</strong>
                {agent.task ? ` — ${ACTIVITIES[agent.task.activity].label} (${PHASE_LABEL[agent.task.phase]})` : ""}
              </p>
              <p className="muted">
                Mission réelle : {STATUS_LABEL[agent.realWork.status]}
                {agent.realWork.taskTitle ? ` — « ${agent.realWork.taskTitle} »` : ""}
              </p>
              <div className="needs">
                {NEED_LABELS.map(([k, label, inverse]) => {
                  const v = agent.needs[k];
                  const bad = inverse ? v : 1 - v;
                  return (
                    <div key={k} className="need">
                      <span>{label}</span>
                      <div className="meter" role="meter" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                        <div style={{ width: `${v * 100}%`, background: bad > 0.75 ? "var(--bad)" : bad > 0.5 ? "var(--warn)" : "var(--ok)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {debug && agent.decision && (
                <details open>
                  <summary>Décision (Utility AI) au tick {agent.decision.tick}</summary>
                  <table className="scores">
                    <tbody>
                      {agent.decision.scores.slice(0, 8).map((s) => (
                        <tr key={s.activity} className={s.activity === agent.decision!.chosen ? "chosen" : ""}>
                          <td>{ACTIVITIES[s.activity as keyof typeof ACTIVITIES]?.label ?? s.activity}</td>
                          <td className="num">{Number.isFinite(s.score) ? s.score.toFixed(2) : "—"}</td>
                          <td className="muted">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted mono">{agent.history.slice(-4).join("  ")}</p>
                </details>
              )}
              <AgentAiCard id={agent.id} nameOf={nameOf} />
              <details>
                <summary>Relations les plus proches</summary>
                <ul className="plain">
                  {w!.rel.friendsOf(agent.index, 5).map((j) => {
                    const r = w!.rel.get(agent.index, j);
                    return (
                      <li key={j}>
                        {w!.agents[j].name} — affinité {(r.affinity * 100).toFixed(0)} · familiarité {(r.familiarity * 100).toFixed(0)}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </section>
          ) : (
            <section className="card">
              <h2>Le siège</h2>
              <p className="muted">Cliquez sur un agent pour l&apos;inspecter. Glisser pour déplacer, molette pour zoomer.</p>
              <ul className="plain">
                <li>Cabines occupées : {ui.occupancy.toilets}/4</li>
                <li>Machines à café (dont file) : {ui.occupancy.coffee}</li>
                <li>Réunion : {ui.occupancy.meeting ?? "aucune"}</li>
              </ul>
              <p className="muted small">Raccourcis : Espace pause · 1/2/5 vitesse · D debug · Échap désélection</p>
            </section>
          )}

          <section className="card grow">
            <h3>Journal</h3>
            <ul className="plain feed" aria-live="polite">
              {ui.events.map((e, k) => (
                <li key={`${e.tick}-${k}`} className={`ev ${e.kind}`}>
                  <span className="mono muted">{formatClock(e.sec)}</span> {e.text}
                </li>
              ))}
            </ul>
          </section>
            </>
          )}
        </aside>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
