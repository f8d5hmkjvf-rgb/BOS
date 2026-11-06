import type { DepartmentId } from "./types";

export type MeetingStatus = "scheduled" | "gathering" | "in_progress" | "done" | "cancelled";

export interface Meeting {
  id: string;
  title: string;
  organizer: string;
  participants: string[];
  /** Heure de début planifiée (secondes depuis minuit). */
  startSec: number;
  durationSec: number;
  status: MeetingStatus;
  /** Siège attribué par participant. */
  seats: Record<string, string>;
  startedAtSec: number | null;
  /** Participant qui parle (rotation). */
  speaker: string | null;
  /** Réunion réelle convoquée par l'orchestrateur (discussion IA). */
  external?: boolean;
  /** Répliques IA en attente d'être jouées dans la salle. */
  queue?: { speaker: string; text: string }[];
  playingUntil?: number;
  /** L'orchestrateur a clos la discussion ; la réunion finit quand tout a été joué. */
  ended?: boolean;
}

export const GATHER_LEAD_SEC = 6 * 60;
export const START_GRACE_SEC = 6 * 60;

const ROTATION: DepartmentId[] = ["tech", "produit", "marketing", "ventes", "data", "ops"];
const LABELS: Record<DepartmentId, string> = {
  direction: "Direction",
  tech: "Tech",
  data: "Data",
  produit: "Produit",
  marketing: "Marketing",
  ventes: "Ventes",
  ops: "Ops",
};

export interface MeetingAgentInfo {
  id: string;
  department: DepartmentId;
  isLead: boolean;
  isCEO: boolean;
}

/** Planning quotidien des réunions organisées par le CEO (déterministe selon le jour). */
export function planDay(day: number, agents: MeetingAgentInfo[]): Meeting[] {
  const ceo = agents.find((a) => a.isCEO);
  if (!ceo) return [];
  const leads = agents.filter((a) => a.isLead && !a.isCEO).map((a) => a.id);
  const deptA = ROTATION[day % ROTATION.length];
  const deptB = ROTATION[(day + 3) % ROTATION.length];
  const mk = (id: string, title: string, participants: string[], h: number, min: number): Meeting => ({
    id: `d${day}:${id}`,
    title,
    organizer: ceo.id,
    participants: [ceo.id, ...participants.filter((p) => p !== ceo.id)],
    startSec: h * 3600,
    durationSec: min * 60,
    status: "scheduled",
    seats: {},
    startedAtSec: null,
    speaker: null,
  });
  const dept = (d: DepartmentId) => agents.filter((a) => a.department === d).map((a) => a.id);
  return [
    mk("leads", "Point direction", leads, 9.5, 20),
    mk(`dept-${deptA}`, `Revue ${LABELS[deptA]}`, dept(deptA), 11, 30),
    mk(`dept-${deptB}`, `Revue ${LABELS[deptB]}`, dept(deptB), 15.5, 30),
  ];
}

/** Réunion ad hoc créée par le CEO quand une équipe est sous tension. */
export function adHocMeeting(day: number, nowSec: number, dept: DepartmentId, ceoId: string, members: string[]): Meeting {
  return {
    id: `d${day}:adhoc-${dept}-${nowSec | 0}`,
    title: `Point d'équipe ${LABELS[dept]} (stress élevé)`,
    organizer: ceoId,
    participants: [ceoId, ...members.filter((m) => m !== ceoId)],
    startSec: nowSec + 15 * 60,
    durationSec: 20 * 60,
    status: "scheduled",
    seats: {},
    startedAtSec: null,
    speaker: null,
  };
}
