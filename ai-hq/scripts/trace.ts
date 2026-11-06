import { World, formatClock } from "../src/sim/engine";
const w = new World({ seed: Number(process.argv[3] ?? 42) });
const until = Number(process.argv[2] ?? 3600 * 3);
const filter = process.argv[4];
for (let i = 0; i < until; i++) {
  w.step();
  for (const e of w.events.splice(0)) if (!filter || e.agents.includes(filter) || e.kind === filter) console.log(formatClock(e.sec), e.kind, e.text);
}
for (const a of w.agents) console.log(a.id, a.mode, a.task?.activity, a.task?.phase, JSON.stringify(a.tile), a.history.slice(-3).join(" | "), Object.entries(a.needs).map(([k,v])=>k[0]+(v*100|0)).join(" "));
