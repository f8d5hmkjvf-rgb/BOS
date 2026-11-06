import type { Rng } from "./rng";
import type { RoomKind } from "./map";
import type { Preferences, RealWork } from "./types";

export interface DialogueContext {
  speakerName: string;
  listenerName: string;
  sameDepartment: boolean;
  room: RoomKind | null;
  hour: number;
  affinity: number;
  familiarity: number;
  speakerStress: number;
  speakerWork: RealWork;
  drink: Preferences["drink"];
  meetingSoon: boolean;
}

/**
 * Fournisseur de répliques. L'implémentation par défaut est déterministe (gabarits),
 * aucun appel réseau. Un fournisseur IA peut être branché côté application pour les
 * interactions « utiles » uniquement (voir bridge/dialogueBudget.ts).
 */
export interface DialogueProvider {
  line(ctx: DialogueContext, rng: Rng): string;
  /** Réponse de l'interlocuteur à `heard`. */
  reply(ctx: DialogueContext, rng: Rng, heard: string): string;
}

export class TemplateDialogueProvider implements DialogueProvider {
  line(c: DialogueContext, rng: Rng): string {
    const pool: string[] = [];
    const task = c.speakerWork.taskTitle;
    if (c.familiarity < 0.15) pool.push(`Enchanté ${c.listenerName}, on ne s'est pas encore vraiment parlé !`, "Tu es arrivé quand déjà ?");
    if (c.room === "cafeteria" && c.hour >= 11.5 && c.hour <= 14) pool.push("C'est quoi le plat du jour ?", "Bon appétit !", "Tu as goûté le dessert ?");
    if (c.room === "cafeteria" && (c.hour < 11.5 || c.hour > 14)) pool.push(`Un petit ${c.drink} ?`, "Cette machine fait le meilleur espresso de la boîte.", "Deuxième café de la matinée…");
    if (c.room === "lounge") pool.push("Enfin une pause.", "Ce canapé est bien trop confortable.");
    if (c.room === "corridor") pool.push(`Salut ${c.listenerName} !`, "Ça avance de ton côté ?", "On se capte plus tard ?");
    if (c.sameDepartment && task) pool.push(`Je bosse sur « ${task} ».`, `Tu peux relire « ${task} » quand tu as 5 min ?`);
    if (c.speakerWork.status === "blocked" && task) pool.push(`Je suis bloqué sur « ${task} »…`, "J'attends un retour pour avancer.");
    if (c.speakerWork.status === "awaiting_approval") pool.push("J'attends une validation humaine avant d'aller plus loin.");
    if (c.meetingSoon) pool.push("Tu viens à la réunion de Gaspard ?", "On a un point tout à l'heure, non ?");
    if (c.speakerStress > 0.65) pool.push("Grosse journée…", "Je suis sous l'eau aujourd'hui.");
    if (c.affinity > 0.5) pool.push("On déjeune ensemble demain ?", "Haha, toujours aussi drôle !");
    if (c.affinity < -0.3) pool.push("Hmm. D'accord.", "On en reparle plus tard.");
    if (c.hour >= 17) pool.push("Bientôt le week-end dans la tête…", "Tu pars à quelle heure ?");
    if (pool.length === 0) pool.push("Ça va ?", "Quoi de neuf ?", "Belle journée, non ?");
    return rng.pick(pool);
  }

  reply(c: DialogueContext, rng: Rng, heard: string): string {
    const pool: string[] = [];
    if (heard.endsWith("?")) pool.push("Bonne question !", "Oui, carrément.", "Pas encore, et toi ?", "Je te dis ça tout de suite.");
    else pool.push("Haha, tellement.", "Je vois ce que tu veux dire.", "Courage !", "Pareil de mon côté.");
    if (c.speakerWork.status === "busy" && c.speakerWork.taskTitle) pool.push(`Moi je suis sur « ${c.speakerWork.taskTitle} ».`);
    if (c.affinity > 0.5) pool.push(`Toujours un plaisir, ${c.listenerName} !`);
    if (c.affinity < -0.3) pool.push("Mouais.");
    if (c.speakerStress > 0.65) pool.push("Ne m'en parle pas…");
    let line = rng.pick(pool);
    if (line === heard) line = "Exactement !";
    return line;
  }
}
