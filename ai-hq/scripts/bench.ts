/**
 * Banc d'essai headless : simule N jours avec 29 agents, mesure le coût par pas
 * et vérifie les invariants (pas de murs traversés, pas de chevauchement durable).
 * Usage : npm run bench -- [jours] [graine]
 */
import { World, formatClock } from "../src/sim/engine";

const days = Number(process.argv[2] ?? 1);
const seed = Number(process.argv[3] ?? 42);
const w = new World({ seed });
const counts: Record<string, number> = {};
let overlapTicks = 0;
let wallViolations = 0;
const t0 = performance.now();
const startDay = w.day;
let ticks = 0;
while (w.day < startDay + days && ticks < 200000) {
  w.step();
  ticks++;
  const seen = new Map<string, string>();
  for (const a of w.agents) {
    if (a.mode === "off_duty") continue;
    const tx = Math.round(a.pos.x);
    const ty = Math.round(a.pos.y);
    if (!w.grid.isStaticWalkable(tx, ty) && !w.grid.isStaticWalkable(a.tile.x, a.tile.y)) wallViolations++;
    if (a.squeezing) continue;
    const k = `${a.tile.x},${a.tile.y}`;
    if (seen.has(k)) overlapTicks++;
    seen.set(k, a.id);
  }
  for (const e of w.events.splice(0)) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  if (ticks % 3600 === 0) {
    const modes: Record<string, number> = {};
    for (const a of w.agents) modes[a.task?.activity ?? a.mode] = (modes[a.task?.activity ?? a.mode] ?? 0) + 1;
    console.log(`J${w.day + 1} ${formatClock(w.sec)}`, JSON.stringify(modes));
  }
}
const ms = performance.now() - t0;
console.log({ ticks, msPerTick: +(ms / ticks).toFixed(4), maxStepMs: +w.stats.maxStepMs.toFixed(2), overlapTicks, wallViolations, events: counts, stats: w.stats });
