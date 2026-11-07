import { agentById } from "./agents";
import { FatalError, textOf } from "./llm";
import type { LoopDeps } from "./loop";
import type { Mission, Task } from "./store";

/**
 * Réunion réelle : chaque participant prend la parole à tour de rôle (un appel API chacun,
 * avec sa personnalité et la transcription complète), puis Gaspard conclut par un compte rendu.
 * Les répliques sont publiées en direct et jouées dans la salle Atlas du QG.
 */
export async function runMeeting(d: LoopDeps, mission: Mission, task: Task, onProgress?: () => Promise<void>): Promise<"done"> {
  const participants = task.participants.map((id) => agentById(id)).filter((a): a is NonNullable<typeof a> => !!a);
  if (participants.length < 2) throw new FatalError("Réunion sans participants valides.");
  const [host, ...others] = participants;
  const convId = await d.store.openConversation({ missionId: mission.id, taskId: task.id, kind: "meeting", title: task.title, participants: participants.map((p) => p.id) });
  const lines: { name: string; role: string; text: string }[] = [];

  const speak = async (who: (typeof participants)[number], instruction: string) => {
    await onProgress?.();
    const transcript = lines.map((l) => `${l.name} (${l.role}) : ${l.text}`).join("\n\n") || "(la réunion commence)";
    const res = await d.llm.call(
      {
        model: d.cfg.models.economy,
        effort: d.cfg.effort.dialogue,
        maxTokens: 8000,
        system: `${who.systemPrompt}\n\nTu participes à une réunion d'équipe en salle Atlas. Parle à l'oral, en ton nom, sans titre ni liste à puces, 120 mots maximum. Apporte une contribution utile et concrète liée à ton expertise ; ne répète pas ce qui a déjà été dit.`,
        messages: [
          {
            role: "user",
            content: `Mission : """${mission.goal}"""\nOrdre du jour : ${task.description}\nParticipants : ${participants.map((p) => `${p.name} (${p.role})`).join(", ")}\n\nTranscription :\n${transcript}\n\n${instruction}`,
          },
        ],
      },
      { missionId: mission.id, taskId: task.id, agentId: who.id, purpose: "meeting" },
    );
    const text = textOf(res);
    if (!text) throw new FatalError(`${who.name} n'a rien dit.`);
    lines.push({ name: who.name, role: who.role, text });
    await d.store.addLine(convId, "meeting", who.id, text);
    return text;
  };

  try {
    await speak(host, "Ouvre la réunion : rappelle l'objectif, ce que tu attends de chacun et les décisions à prendre.");
    for (const p of others) await speak(p, `C'est à toi, ${p.name}. Donne ton analyse, les risques que tu vois et ta proposition pour ta partie.`);
    const summary = await speak(
      host,
      "Conclus la réunion : liste les décisions prises, qui fait quoi, et les points de vigilance. Sois précis : ce compte rendu sera transmis aux spécialistes.",
    );
    await d.store.closeConversation(convId, "meeting", "closed", summary);
    const minutes = lines.map((l) => `**${l.name}** — ${l.text}`).join("\n\n");
    await d.store.completeTask(task.id, `${minutes}\n\n**Décisions (Gaspard) :** ${summary}`);
    return "done";
  } catch (e) {
    await d.store.closeConversation(convId, "meeting", "failed", null);
    throw e;
  }
}
