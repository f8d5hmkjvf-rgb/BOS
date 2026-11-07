"use client";

import type { World } from "@/sim/engine";

const LABELS: Record<string, string> = {
  coffee_machine: "Machine à café",
  toilet_stall: "Cabine de toilettes",
  sink: "Lavabo",
  water_cooler: "Fontaine à eau",
  food_counter: "Comptoir de la cafétéria",
  sofa: "Canapé du lounge",
};

/** Fiche d'un équipement du QG. Respect de la vie privée : l'occupant d'une cabine n'est jamais nommé. */
export function ResourceCard({ world, id, onClose, notify }: { world: World; id: string; onClose: () => void; notify: (m: string) => void }) {
  const r = world.rm.byId.get(id);
  if (!r) return null;
  const type = r.def.type;
  const label = LABELS[type] ?? type;
  const name = (aid: string | null) => (aid ? (world.byId.get(aid)?.name ?? aid) : "");
  const privateUse = type === "toilet_stall";
  const busy = Boolean(r.occupant);
  const occupant = r.occupant ? world.byId.get(r.occupant) : null;
  const state = privateUse
    ? busy
      ? "Occupée 🔴"
      : r.reservedBy
        ? "Réservée 🟠"
        : "Libre 🟢"
    : busy
      ? type === "coffee_machine"
        ? `${name(r.occupant)} prépare un café ☕`
        : `Utilisé par ${name(r.occupant)}`
      : r.reservedBy
        ? `Réservé par ${name(r.reservedBy)}`
        : "Libre";
  const stalls = privateUse ? world.rm.ofType("toilet_stall") : [];
  return (
    <section className="card">
      <div className="row between">
        <h2>{label}</h2>
        <button className="link" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      <p>
        <strong>{state}</strong>
        {occupant && !privateUse && occupant.anim === "coffee_make" && " — préparation en cours"}
      </p>
      {privateUse && (
        <p className="small muted">
          Cabines : {stalls.filter((s) => s.occupant).length}/{stalls.length} occupées · lavabos : {world.rm.ofType("sink").filter((s) => s.occupant).length}/
          {world.rm.ofType("sink").length}
        </p>
      )}
      <p className="small">
        File d&apos;attente : {r.queue.length === 0 ? "personne" : privateUse ? `${r.queue.length} personne(s)` : r.queue.map(name).join(", ")}
      </p>
      {type === "coffee_machine" && (
        <button
          onClick={() => {
            const who = world.invite("coffee", r.def.tile, 3);
            notify(who.length ? `Pause café offerte à ${who.map(name).join(", ")} (simulation, aucun appel IA).` : "Personne de disponible pour une pause en ce moment.");
          }}
        >
          ☕ Offrir une pause café (3 collègues)
        </button>
      )}
    </section>
  );
}
