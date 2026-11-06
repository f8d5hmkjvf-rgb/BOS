/**
 * Barrière entre la simulation visuelle et le monde réel.
 *
 * La simulation peut seulement PROPOSER des intentions (signaler un blocage, demander une
 * validation…). Rien n'est exécuté tant qu'un humain n'a pas explicitement autorisé
 * l'intention, et l'exécuteur n'est fourni qu'au moment de l'autorisation : le moteur
 * n'en détient jamais aucun, il lui est donc structurellement impossible d'agir à l'extérieur.
 */
export type IntentKind = "escalate_blocker" | "request_approval";
export type IntentStatus = "pending" | "authorized" | "rejected" | "executed" | "failed";

export interface SimIntent {
  id: string;
  agentId: string;
  kind: IntentKind;
  summary: string;
  payload: Record<string, unknown>;
  tick: number;
  status: IntentStatus;
  error?: string;
}

export type IntentExecutor = (intent: SimIntent) => Promise<void>;

export class ActionGate {
  private intents: SimIntent[] = [];
  private seq = 0;

  propose(i: Omit<SimIntent, "id" | "status">): SimIntent {
    const intent: SimIntent = { ...i, id: `intent-${++this.seq}`, status: "pending" };
    this.intents.push(intent);
    if (this.intents.length > 200) this.intents.shift();
    return intent;
  }

  pending(): SimIntent[] {
    return this.intents.filter((i) => i.status === "pending");
  }

  all(): SimIntent[] {
    return [...this.intents];
  }

  reject(id: string): void {
    const i = this.intents.find((x) => x.id === id);
    if (i && i.status === "pending") i.status = "rejected";
  }

  /** Seul point d'exécution : appelé par l'interface après un clic humain explicite. */
  async authorize(id: string, executor: IntentExecutor): Promise<SimIntent> {
    const i = this.intents.find((x) => x.id === id);
    if (!i) throw new Error(`Intention inconnue : ${id}`);
    if (i.status !== "pending") throw new Error(`Intention ${id} déjà traitée (${i.status})`);
    i.status = "authorized";
    try {
      await executor(i);
      i.status = "executed";
    } catch (e) {
      i.status = "failed";
      i.error = e instanceof Error ? e.message : String(e);
    }
    return i;
  }
}
