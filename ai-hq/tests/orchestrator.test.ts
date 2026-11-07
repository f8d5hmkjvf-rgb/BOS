import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "@/orchestrator/config";
import { closeAll } from "@/orchestrator/db";
import { Worker } from "@/orchestrator/worker";
import { applyDecision } from "@/orchestrator/actions";
import { validatePlan, type PlanInput } from "@/orchestrator/ceo";
import { agentSpecs } from "@/orchestrator/agents";
import { freshStore, TEST_DB } from "./helpers/db";
import { lastUser, ScriptedLlm, text, tool, toolNames, type Script } from "./helpers/fakeLlm";
import type { Store } from "@/orchestrator/store";

const cfg = (over: Record<string, string> = {}) => loadConfig({ DATABASE_URL: TEST_DB, ANTHROPIC_API_KEY: "test", AIHQ_WORKER_CONCURRENCY: "2", ...over } as unknown as NodeJS.ProcessEnv);

async function runUntilIdle(w: Worker, store: Store, missionId: string, maxTicks = 60) {
  for (let i = 0; i < maxTicks; i++) {
    const n = await w.tick();
    await w.drain();
    const m = await store.getMission(missionId);
    if (n === 0 && m && ["done", "failed", "paused", "awaiting_approval"].includes(m.status)) return m;
  }
  return store.getMission(missionId);
}

const PLAN = (meeting: boolean): PlanInput => ({
  analysis: "Objectif clair : produire une page de vente et un plan d'acquisition.",
  meeting: { needed: meeting, participants: meeting ? ["mary", "frances"] : [], agenda: "Aligner positionnement et message." },
  tasks: [
    { key: "positionnement", title: "Positionnement", description: "Définir la cible", deliverable: "1 page", assignee: "mary", depends_on: [], complexity: "complex" },
    { key: "page-vente", title: "Page de vente", description: "Rédiger la page", deliverable: "Texte complet", assignee: "rosalind", depends_on: ["positionnement"], complexity: "standard" },
  ],
});

/** Script complet : plan → réunion → exécution (avec consultation) → revue (1 révision) → revue 2 → rapport. */
function happyScript(opts: { meeting: boolean; revise: boolean }): Script {
  let reviews = 0;
  return (req) => {
    const tools = toolNames(req);
    const lu = lastUser(req);
    if (tools.includes("submit_plan")) return { content: [text("Je planifie."), tool("submit_plan", PLAN(opts.meeting))] };
    if (tools.includes("submit_review")) {
      reviews++;
      const revise = opts.revise && reviews === 1;
      return {
        content: [
          tool("submit_review", {
            verdicts: [
              { key: "positionnement", decision: "accept", feedback: "" },
              { key: "page-vente", decision: revise ? "revise" : "accept", feedback: revise ? "Ajoute une garantie." : "" },
            ],
            summary: "ok",
          }),
        ],
      };
    }
    if (req.system.includes("réunion d'équipe")) return { content: [text("Intervention utile en réunion.")] };
    if (lu.includes("te consulte")) return { content: [text("Cible : indépendants pressés.")] };
    if (tools.includes("submit_deliverable")) {
      if (req.system.includes("Mary") && !lu.includes("Réponse de")) return { content: [tool("consult_colleague", { colleague: "radia", question: "Qui est la cible ?" })] };
      const v = lu.includes("révision") ? "Page v2 avec garantie" : "Livrable v1";
      return { content: [tool("submit_deliverable", { summary: v, content: v, open_questions: [] })] };
    }
    if (tools.length === 0) return { content: [text("# Rapport final\nTout est livré.")] };
    return { content: [text("?")] };
  };
}

describe.skipIf(!TEST_DB)("Orchestrateur Gaspard (PostgreSQL réel, modèle scripté)", () => {
  afterAll(closeAll);

  it("mission complète : plan, réunion, délégation, consultation, révision, rapport", async () => {
    const store = await freshStore();
    const llm = new ScriptedLlm(happyScript({ meeting: true, revise: true }));
    const w = new Worker(store, llm, cfg(), () => {});
    const m = await store.createMission("Vendre ma formation", 5, "gaspard");
    const done = await runUntilIdle(w, store, m.id);
    expect(done!.status).toBe("done");
    expect(done!.result).toContain("Rapport final");

    const tasks = await store.tasksOf(m.id);
    expect(tasks.map((t) => t.key).sort()).toEqual(["kickoff", "page-vente", "plan", "positionnement", "report", "review-1", "review-2"]);
    const page = tasks.find((t) => t.key === "page-vente")!;
    expect(page.revision).toBe(1);
    expect(page.result).toContain("garantie");

    // La réunion a réellement fait parler chaque participant puis conclu.
    const convs = await store.conversations(m.id);
    const meeting = convs.find((c) => c.kind === "meeting")!;
    expect(meeting.participants).toEqual(["gaspard", "mary", "frances"]);
    expect(meeting.lines.map((l) => l.speaker)).toEqual(["gaspard", "mary", "frances", "gaspard"]);
    expect(convs.some((c) => c.kind === "consult" && c.participants.join() === "mary,radia")).toBe(true);

    // Dépendances respectées : la page de vente n'a démarré qu'après le positionnement et la réunion.
    const pos = tasks.find((t) => t.key === "positionnement")!;
    const kick = tasks.find((t) => t.key === "kickoff")!;
    expect(new Date(page.started_at!).getTime()).toBeGreaterThanOrEqual(new Date(pos.finished_at!).getTime());
    expect(new Date(pos.started_at!).getTime()).toBeGreaterThanOrEqual(new Date(kick.finished_at!).getTime());

    // Routage des modèles : Gaspard et la tâche complexe sur Opus, le reste sur le modèle économique.
    const model = (pred: (r: (typeof llm.calls)[number]) => boolean) => [...new Set(llm.calls.filter(pred).map((r) => r.model))];
    expect(model((r) => toolNames(r).includes("submit_plan") || toolNames(r).includes("submit_review"))).toEqual(["claude-opus-5-5"]);
    expect(model((r) => r.system.includes("Tu es Mary") && toolNames(r).includes("submit_deliverable"))).toEqual(["claude-opus-5-5"]);
    expect(model((r) => r.system.includes("Tu es Rosalind") && toolNames(r).includes("submit_deliverable"))).toEqual(["claude-sonnet-5-5"]);
    expect(model((r) => r.system.includes("réunion d'équipe"))).toEqual(["claude-sonnet-5-5"]);

    // Chaque appel est tracé et coûte.
    expect((await store.getMission(m.id))!.spent_usd).toBeGreaterThan(0);
    const kinds = new Set((await store.eventsSince(0, 1000)).map((e) => e.kind));
    for (const k of ["mission.created", "task.updated", "meeting.started", "meeting.line", "meeting.ended", "consult.started", "consult.line", "usage"]) expect(kinds).toContain(k);
    // Historique de l'agent : la révision prolonge la même conversation.
    const tr = await store.transcript(page.id);
    expect(JSON.stringify(tr)).toContain("Gaspard demande une révision");
  }, 30_000);

  it("plan invalide : Gaspard reçoit l'erreur et corrige", async () => {
    const store = await freshStore();
    let attempt = 0;
    const llm = new ScriptedLlm((req) => {
      if (toolNames(req).includes("submit_plan")) {
        attempt++;
        const p = PLAN(false);
        if (attempt === 1) p.tasks[0].assignee = "gaspard"; // le CEO ne s'assigne pas de tâche
        return { content: [tool("submit_plan", p)] };
      }
      return happyScript({ meeting: false, revise: false })(req, 0);
    });
    const w = new Worker(store, llm, cfg(), () => {});
    const m = await store.createMission("x", 5, "gaspard");
    expect((await runUntilIdle(w, store, m.id))!.status).toBe("done");
    expect(attempt).toBe(2);
    expect(JSON.stringify(await store.transcript((await store.tasksOf(m.id)).find((t) => t.kind === "plan")!.id))).toContain("Plan refusé");
  }, 30_000);

  it("action sensible : rien n'est envoyé sans validation, puis reprise de la tâche", async () => {
    const store = await freshStore();
    const sent: unknown[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const c = cfg({ AIHQ_WEBHOOK_URL: "https://hooks.example.test/x" });
    const base = happyScript({ meeting: false, revise: false });
    const llm = new ScriptedLlm((req, n) => {
      if (req.system.includes("Mary") && toolNames(req).includes("send_webhook")) {
        const lu = lastUser(req);
        if (!lu.includes("send_webhook") && !lu.includes("Action exécutée")) return { content: [tool("send_webhook", { title: "Annonce", message: "Lancement !" })] };
        return { content: [tool("submit_deliverable", { summary: "Annonce envoyée", content: lu.includes("Action exécutée") ? "envoyée" : "?", open_questions: [] })] };
      }
      return base(req, n);
    });
    const w = new Worker(store, llm, c, () => {});
    const m = await store.createMission("x", 5, "gaspard");
    let cur = await runUntilIdle(w, store, m.id);
    expect(cur!.status).toBe("awaiting_approval");
    expect(sent).toHaveLength(0);
    const [a] = await store.approvals("pending");
    expect(a.summary).toContain("Annonce");
    const r = await applyDecision(store, c, a.id, "approved", fakeFetch);
    expect(r.status).toBe("executed");
    expect(sent).toHaveLength(1);
    await expect(applyDecision(store, c, a.id, "approved", fakeFetch)).rejects.toThrow();
    cur = await runUntilIdle(w, store, m.id);
    expect(cur!.status).toBe("done");
    expect((await store.tasksOf(m.id)).find((t) => t.key === "positionnement")!.result).toContain("envoyée");
    expect(sent).toHaveLength(1);
  }, 30_000);

  it("budget : la mission est mise en pause avant de dépasser, sans appel supplémentaire", async () => {
    const store = await freshStore();
    const llm = new ScriptedLlm(happyScript({ meeting: false, revise: false }));
    const w = new Worker(store, llm, cfg(), () => {});
    const m = await store.createMission("x", 0.05, "gaspard"); // budget minuscule
    const cur = await runUntilIdle(w, store, m.id);
    expect(cur!.status).toBe("paused");
    expect(cur!.error).toMatch(/Budget de mission/);
    expect(llm.calls).toHaveLength(0);
    // Relever le budget permet de reprendre.
    await store.updateMission(m.id, { budget_usd: 5, status: "planning", error: null });
    expect((await runUntilIdle(w, store, m.id))!.status).toBe("done");
  }, 30_000);

  it("erreur API transitoire : nouvelle tentative et reprise de la conversation", async () => {
    const store = await freshStore();
    let fail = true;
    const base = happyScript({ meeting: false, revise: false });
    const llm = new ScriptedLlm((req, n) => {
      if (fail && toolNames(req).includes("submit_deliverable")) {
        fail = false;
        throw Object.assign(new Error("connexion perdue"), {});
      }
      return base(req, n);
    });
    const w = new Worker(store, llm, cfg(), () => {});
    const m = await store.createMission("x", 5, "gaspard");
    await runUntilIdle(w, store, m.id, 5);
    const t = (await store.tasksOf(m.id)).find((x) => x.key === "positionnement")!;
    expect(t.attempts).toBe(1);
    expect(t.status).toBe("pending");
    await store.db.query("UPDATE tasks SET run_after = now() WHERE id=$1", [t.id]); // ignorer le backoff dans le test
    expect((await runUntilIdle(w, store, m.id))!.status).toBe("done");
  }, 30_000);

  it("refus du modèle : échec non relancé avec un message clair", async () => {
    const store = await freshStore();
    const llm = new ScriptedLlm(() => ({ content: [], stop_reason: "refusal" }));
    const w = new Worker(store, llm, cfg(), () => {});
    const m = await store.createMission("x", 5, "gaspard");
    const cur = await runUntilIdle(w, store, m.id);
    expect(cur!.status).toBe("failed");
    expect(cur!.error).toMatch(/décliné/);
    expect(llm.calls).toHaveLength(1);
  });

  it("outils non autorisés : refusés à l'agent", async () => {
    const store = await freshStore();
    const base = happyScript({ meeting: false, revise: false });
    let refused = "";
    const llm = new ScriptedLlm((req, n) => {
      if (req.system.includes("Rosalind") && toolNames(req).includes("submit_deliverable")) {
        const lu = lastUser(req);
        if (lu.includes("non autorisé")) refused = lu;
        if (!refused) return { content: [tool("send_webhook", { title: "x", message: "y" })] };
      }
      return base(req, n);
    });
    const w = new Worker(store, llm, cfg(), () => {}); // pas de webhook configuré → outil absent
    const m = await store.createMission("x", 5, "gaspard");
    expect((await runUntilIdle(w, store, m.id))!.status).toBe("done");
    expect(refused).toContain("non autorisé");
    expect(await store.approvals()).toHaveLength(0);
  }, 30_000);
});

describe("Validation du plan", () => {
  const ok = PLAN(false);
  it("accepte un plan valide", () => expect(validatePlan(ok, 8)).toEqual([]));
  it("détecte cycles, doublons, dépendances inconnues et CEO assigné", () => {
    const p: PlanInput = structuredClone(ok);
    p.tasks[0].depends_on = ["page-vente"];
    expect(validatePlan(p, 8).join()).toMatch(/cycle/);
    p.tasks[0].depends_on = ["fantome"];
    expect(validatePlan(p, 8).join()).toMatch(/inconnue/);
    p.tasks[1].key = p.tasks[0].key;
    expect(validatePlan(p, 8).join()).toMatch(/double/);
    p.tasks[0].assignee = "gaspard";
    expect(validatePlan(p, 8).join()).toMatch(/Assigné invalide/);
  });
  it("chaque agent a ses compétences, ses outils et ses instructions système", () => {
    const specs = agentSpecs();
    expect(specs).toHaveLength(29);
    expect(specs.find((a) => a.isCEO)!.name).toBe("Gaspard");
    for (const a of specs) {
      expect(a.systemPrompt).toContain(a.name);
      expect(a.tools).toContain("submit_deliverable");
      if (!a.isCEO) expect(a.skills.length).toBeGreaterThan(0);
    }
  });
});
