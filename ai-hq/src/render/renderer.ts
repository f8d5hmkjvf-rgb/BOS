import { Application, Container, Graphics, Text } from "pixi.js";
import type { Agent } from "../sim/agent";
import type { World } from "../sim/engine";
import { Cell } from "../sim/grid";
import type { FurnitureKind, RoomKind } from "../sim/map";
import { depth, diamond, TILE_H, TILE_W, toGrid, toScreen } from "./iso";

const FLOOR: Record<RoomKind, [number, number]> = {
  openspace: [0xe9e4da, 0xe2dccf],
  corridor: [0xd6d3cd, 0xcfcbc4],
  meeting: [0xdfe7ee, 0xd6e0e9],
  ceo: [0xe8dcc8, 0xdfd1ba],
  toilets: [0xe3eef0, 0xd8e6e9],
  lounge: [0xe6e0ef, 0xddd5e8],
  cafeteria: [0xeee3d3, 0xe6d8c4],
  ops: [0xe5e9de, 0xdce2d3],
};

interface BoxStyle {
  h: number;
  top: number;
  left: number;
  right: number;
  inset?: number;
}

const FURNITURE: Record<FurnitureKind, BoxStyle> = {
  desk: { h: 12, top: 0xb08d63, left: 0x8a6c49, right: 0x9c7a54, inset: 3 },
  meeting_table: { h: 11, top: 0x8f9aa6, left: 0x6b7480, right: 0x7c8692 },
  counter: { h: 14, top: 0xcfc6b8, left: 0x9a8f80, right: 0xb0a596 },
  coffee_machine: { h: 22, top: 0x3a3a3a, left: 0x1f1f1f, right: 0x2b2b2b, inset: 6 },
  sink: { h: 12, top: 0xf4f7f8, left: 0xc5ced2, right: 0xd8e0e3, inset: 5 },
  toilet: { h: 8, top: 0xffffff, left: 0xd5dbde, right: 0xe7ecee, inset: 9 },
  stall_wall: { h: 26, top: 0x9fb4bb, left: 0x7f959c, right: 0x8fa5ac },
  sofa: { h: 9, top: 0x7c6aa8, left: 0x5b4c82, right: 0x6a5994, inset: 2 },
  plant: { h: 20, top: 0x4f9d55, left: 0x3a7a3f, right: 0x448a49, inset: 8 },
  water_cooler: { h: 22, top: 0x9fd3ec, left: 0x6aa9c7, right: 0x83bfdb, inset: 9 },
  cafe_table: { h: 10, top: 0xc9a77c, left: 0x9c7e58, right: 0xb08f66, inset: 2 },
  high_table: { h: 16, top: 0x6d5a45, left: 0x4e3f30, right: 0x5d4c3a, inset: 8 },
  whiteboard: { h: 24, top: 0xffffff, left: 0xdadada, right: 0xeeeeee, inset: 10 },
};

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (c & 255) * f));
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

/** Prisme isométrique posé sur la case (x, y). */
function drawBox(g: Graphics, x: number, y: number, s: BoxStyle): void {
  const c = toScreen(x, y);
  const k = 1 - (s.inset ?? 0) / (TILE_W / 2);
  const hw = (TILE_W / 2) * k;
  const hh = (TILE_H / 2) * k;
  const top = [c.sx, c.sy - hh - s.h, c.sx + hw, c.sy - s.h, c.sx, c.sy + hh - s.h, c.sx - hw, c.sy - s.h];
  g.poly([c.sx - hw, c.sy - s.h, c.sx, c.sy + hh - s.h, c.sx, c.sy + hh, c.sx - hw, c.sy]).fill(s.left);
  g.poly([c.sx + hw, c.sy - s.h, c.sx, c.sy + hh - s.h, c.sx, c.sy + hh, c.sx + hw, c.sy]).fill(s.right);
  g.poly(top).fill(s.top);
}

export interface RenderOptions {
  debug: boolean;
  reducedMotion: boolean;
  selected: string | null;
}

interface AgentView {
  root: Container;
  body: Graphics;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  label: Text;
}

/**
 * Rendu PixiJS du monde. Lecture seule : ne modifie jamais l'état de la simulation.
 * Interpole les positions entre deux pas fixes pour un mouvement fluide.
 */
export class OfficeRenderer {
  readonly app: Application;
  readonly camera = new Container();
  private floor = new Graphics();
  private world = new Container();
  private doors = new Graphics();
  private debugLayer = new Graphics();
  private views = new Map<string, AgentView>();
  private time = 0;
  zoom = 1;

  constructor(app: Application) {
    this.app = app;
    this.world.sortableChildren = true;
    this.camera.addChild(this.floor, this.world, this.debugLayer);
    this.world.addChild(this.doors);
    this.doors.zIndex = 1e6 - 1;
    app.stage.addChild(this.camera);
  }

  /** Construit la géométrie statique (sol, murs, mobilier) une seule fois. */
  buildStatic(w: World): void {
    const g = w.grid;
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const cell = g.get(x, y);
        if (cell === Cell.Void) continue;
        const rid = g.roomIds[g.idx(x, y)];
        const kind = rid >= 0 ? w.map.rooms[rid].kind : "corridor";
        const col = FLOOR[kind][(x + y) & 1];
        this.floor.poly(diamond(x, y)).fill(col);
      }
    const furnitureAt = new Map<string, FurnitureKind>();
    for (const f of w.map.furniture) furnitureAt.set(`${f.tile.x},${f.tile.y}`, f.kind);
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const cell = g.get(x, y);
        const fk = furnitureAt.get(`${x},${y}`);
        if (cell !== Cell.Wall && !fk) continue;
        const gr = new Graphics();
        if (fk) drawBox(gr, x, y, FURNITURE[fk]);
        else {
          const outer = x === 0 || y === 0 || x === g.width - 1 || y === g.height - 1;
          drawBox(gr, x, y, { h: outer ? 30 : 22, top: 0xf2efe9, left: 0xb9b2a6, right: 0xcbc5ba });
        }
        gr.zIndex = depth(x, y);
        this.world.addChild(gr);
      }
    // Pièces : noms au sol.
    for (const r of w.map.rooms) {
      if (r.kind === "corridor") continue;
      const c = toScreen((r.x0 + r.x1) / 2, r.y1 + 0.2);
      const t = new Text({ text: r.name, style: { fontFamily: "system-ui, sans-serif", fontSize: 11, fill: 0x6b6458, fontWeight: "600" } });
      t.anchor.set(0.5);
      t.position.set(c.sx, c.sy);
      t.alpha = 0.75;
      this.floor.addChild(t);
    }
  }

  fit(w: World): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const left = toScreen(0, w.grid.height).sx;
    const right = toScreen(w.grid.width, 0).sx;
    const bottom = toScreen(w.grid.width, w.grid.height).sy;
    this.zoom = Math.min(W / (right - left + 40), H / (bottom + 80));
    this.camera.scale.set(this.zoom);
    this.camera.position.set(W / 2 - ((left + right) / 2) * this.zoom, 40 * this.zoom + 10);
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const z = Math.min(4, Math.max(0.3, this.zoom * factor));
    const k = z / this.zoom;
    this.camera.position.set(sx - (sx - this.camera.position.x) * k, sy - (sy - this.camera.position.y) * k);
    this.zoom = z;
    this.camera.scale.set(z);
  }

  /** Coordonnées écran → grille. */
  pick(w: World, sx: number, sy: number): Agent | null {
    const lx = (sx - this.camera.position.x) / this.zoom;
    const ly = (sy - this.camera.position.y) / this.zoom;
    let best: Agent | null = null;
    let bestD = 18;
    for (const a of w.agents) {
      if (a.hidden) continue;
      const c = toScreen(a.pos.x, a.pos.y);
      const d = Math.hypot(c.sx - lx, c.sy - 14 - ly);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    void toGrid;
    return best;
  }

  /** Équipement le plus proche du clic (machine à café, cabine, lavabo, fontaine, comptoir, canapé). */
  pickResource(w: World, sx: number, sy: number): string | null {
    const lx = (sx - this.camera.position.x) / this.zoom;
    const ly = (sy - this.camera.position.y) / this.zoom;
    const g = toGrid(lx, ly);
    let best: string | null = null;
    let bestD = 1.6;
    for (const r of w.rm.byId.values()) {
      const t = r.def.type;
      if (t === "desk" || t === "meeting_seat" || t === "exit" || t === "coffee_spot" || t === "cafeteria_seat") continue;
      // Le meuble est derrière la case d'interaction : on vise le point médian.
      const d = Math.hypot(r.def.tile.x - 0.4 - g.x, r.def.tile.y - 0.6 - g.y);
      if (d < bestD) {
        best = r.def.id;
        bestD = d;
      }
    }
    return best;
  }

  private view(a: Agent): AgentView {
    let v = this.views.get(a.id);
    if (v) return v;
    const root = new Container();
    const body = new Graphics();
    const bubble = new Container();
    const bubbleBg = new Graphics();
    const bubbleText = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: 10, fill: 0x1f2328, wordWrap: true, wordWrapWidth: 130 } });
    bubbleText.anchor.set(0.5, 1);
    bubble.addChild(bubbleBg, bubbleText);
    const label = new Text({ text: a.name, style: { fontFamily: "system-ui, sans-serif", fontSize: 10, fill: 0x111111, fontWeight: "700" } });
    label.anchor.set(0.5, 1);
    root.addChild(body, label, bubble);
    this.world.addChild(root);
    v = { root, body, bubble, bubbleBg, bubbleText, label };
    this.views.set(a.id, v);
    return v;
  }

  draw(w: World, alpha: number, dtMs: number, o: RenderOptions): void {
    this.time += o.reducedMotion ? 0 : dtMs / 1000;
    this.drawDoors(w);
    for (const a of w.agents) {
      const v = this.view(a);
      if (a.hidden) {
        v.root.visible = false;
        continue;
      }
      v.root.visible = true;
      const x = a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha;
      const y = a.prevPos.y + (a.pos.y - a.prevPos.y) * alpha;
      const c = toScreen(x, y);
      v.root.position.set(c.sx, c.sy);
      v.root.zIndex = depth(x, y, 5);
      this.drawAgent(v.body, a, o, w.tick);
      v.label.visible = o.selected === a.id || o.debug;
      v.label.position.set(0, -36);
      if (a.bubble) {
        v.bubble.visible = true;
        v.bubbleText.text = a.bubble.text;
        const bw = Math.min(140, v.bubbleText.width + 12);
        const bh = v.bubbleText.height + 8;
        v.bubbleBg.clear();
        v.bubbleBg.roundRect(-bw / 2, -bh, bw, bh, 6).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1, color: 0x9aa0a6 });
        v.bubbleBg.poly([-4, 0, 4, 0, 0, 6]).fill(0xffffff);
        v.bubbleText.position.set(0, -4);
        v.bubble.position.set(0, -40);
        v.bubble.zIndex = 1;
      } else v.bubble.visible = false;
    }
    this.drawDebug(w, o, alpha);
  }

  private drawDoors(w: World): void {
    const g = this.doors;
    g.clear();
    // Machines à café : voyant (vert libre, ambre en préparation) et vapeur pendant l'utilisation.
    for (const r of w.rm.ofType("coffee_machine")) {
      const m = toScreen(r.def.tile.x, r.def.tile.y - 1);
      const busy = Boolean(r.occupant);
      g.circle(m.sx + 4, m.sy - 18, 2.2).fill(busy ? 0xf59e0b : 0x22c55e);
      if (busy && this.time > 0) for (let i = 0; i < 3; i++) g.circle(m.sx - 2 + Math.sin(this.time * 3 + i) * 2, m.sy - 26 - ((this.time * 12 + i * 4) % 12), 1.4).fill({ color: 0xe5e7eb, alpha: 0.6 });
      if (r.queue.length) g.circle(m.sx + 9, m.sy - 18, 4).fill(0x1f2937).stroke({ width: 1, color: 0xf59e0b });
    }
    for (const r of w.rm.ofType("toilet_stall")) {
      const d = r.def.doorTile!;
      const closed = w.grid.hasDynamicObstacle(d.x, d.y);
      const c = toScreen(d.x, d.y);
      const hw = TILE_W / 2;
      const hh = TILE_H / 2;
      if (closed) {
        // Porte fermée : panneau plein + voyant « occupé ».
        g.poly([c.sx - hw, c.sy, c.sx, c.sy - hh, c.sx, c.sy - hh - 24, c.sx - hw, c.sy - 24]).fill(0x8fa5ac);
        g.circle(c.sx - hw / 2, c.sy - 16, 2.5).fill(0xdc2626);
      } else {
        g.poly([c.sx - hw, c.sy, c.sx - hw + 6, c.sy - 3, c.sx - hw + 6, c.sy - 27, c.sx - hw, c.sy - 24]).fill(0x9fb4bb);
        g.circle(c.sx - hw / 2, c.sy - 16, 2.5).fill(0x16a34a);
      }
    }
  }

  private drawAgent(g: Graphics, a: Agent, o: RenderOptions, tick: number): void {
    g.clear();
    const p = a.profile.look;
    const t = this.time;
    const anim = a.anim;
    const seated = anim === "work" || anim === "meeting" || anim === "eat" || anim === "rest";
    const walking = anim === "walk";
    const motion = o.reducedMotion ? 0 : 1;
    const phase = t * 9 + a.index;
    const bob = walking ? Math.abs(Math.sin(phase)) * 2 * motion : Math.sin(t * 2 + a.index) * 0.6 * motion;
    const back = a.dir >= 5 && a.dir <= 7; // tourné vers le fond : on voit le dos
    const flip = a.dir === 3 || a.dir === 4 || a.dir === 5 ? -1 : 1;
    const baseY = seated ? -4 : 0;

    if (o.selected === a.id) g.ellipse(0, 0, 13, 6.5).stroke({ width: 2, color: 0xf59e0b });
    g.ellipse(0, 0, 8, 4).fill({ color: 0x000000, alpha: 0.18 });

    if (!seated) {
      const swing = walking ? Math.sin(phase) * 3 * motion : 0;
      g.roundRect(-4 + swing * 0.3, -9 + baseY, 3, 9, 1).fill(0x2f3542);
      g.roundRect(1 - swing * 0.3, -9 + baseY, 3, 9, 1).fill(0x2f3542);
    } else {
      g.roundRect(-5, -6, 10, 4, 2).fill(0x2f3542);
    }
    const torsoY = -22 + baseY - bob + (anim === "rest" ? 3 : 0);
    g.roundRect(-6, torsoY, 12, 14, 4).fill(p.shirt);

    // Bras selon l'animation.
    const arm = (dx: number, dy: number, ex: number, ey: number) =>
      g.moveTo(dx, torsoY + dy).lineTo(ex, torsoY + ey).stroke({ width: 2.5, color: shade(p.shirt, 0.8), cap: "round" });
    const typing = Math.sin(t * 18 + a.index) * 1.2 * motion;
    switch (anim) {
      case "work":
        arm(-5, 4, -4 * flip, 10 + typing);
        arm(5, 4, 6 * flip, 10 - typing);
        break;
      case "coffee_make":
      case "wash_hands":
      case "drink_water":
        arm(5 * flip, 4, 10 * flip, 8);
        arm(-5 * flip, 4, -6 * flip, 12);
        break;
      case "coffee_drink": {
        const sip = (Math.sin(t * 1.3 + a.index) > 0.6 ? -5 : 0) * motion;
        arm(5 * flip, 4, 8 * flip, 3 + sip);
        arm(-5 * flip, 4, -6 * flip, 12);
        break;
      }
      case "talk": {
        const gest = Math.sin(t * 5 + a.index) * 2 * motion;
        arm(5 * flip, 4, 10 * flip, 6 + gest);
        arm(-5 * flip, 4, -7 * flip, 12);
        break;
      }
      case "eat":
        arm(-5, 4, -3, 10 + typing * 0.5);
        arm(5, 4, 4, 9);
        break;
      default:
        arm(-5, 4, -7, 13 + (walking ? Math.sin(phase) * 2 * motion : 0));
        arm(5, 4, 7, 13 - (walking ? Math.sin(phase) * 2 * motion : 0));
    }
    // Objets tenus.
    if (a.holding === "cup") {
      const hx = 8 * flip;
      const hy = torsoY + (anim === "coffee_drink" && Math.sin(t * 1.3 + a.index) > 0.6 && motion ? -2 : 5);
      g.roundRect(hx - 2, hy - 3, 4, 5, 1).fill(0xffffff).stroke({ width: 0.8, color: 0x8b6b4a });
      if (!o.reducedMotion && anim !== "walk") g.moveTo(hx, hy - 5).lineTo(hx + Math.sin(t * 3) * 1.5, hy - 9).stroke({ width: 1, color: 0xcfcfcf, alpha: 0.7 });
    }
    if (a.holding === "plate") g.ellipse(0, torsoY + 12, 7, 2.5).fill(0xffffff).stroke({ width: 0.8, color: 0xb0b0b0 });
    if (anim === "wash_hands" && !o.reducedMotion) {
      for (let i = 0; i < 3; i++) g.circle(10 * flip + Math.sin(t * 8 + i) * 2, torsoY + 10 + ((t * 20 + i * 3) % 6), 0.9).fill(0x60a5fa);
    }

    // Tête.
    const hy = torsoY - 6;
    g.circle(0, hy, 6).fill(p.skin);
    if (back) g.circle(0, hy - 0.5, 6).fill(p.hair);
    else {
      g.arc(0, hy - 1, 6.2, Math.PI, 0).fill(p.hair);
      if (anim !== "rest") {
        g.circle(-2 + flip, hy + 1, 0.9).fill(0x1f2328);
        g.circle(2 + flip, hy + 1, 0.9).fill(0x1f2328);
      } else {
        g.moveTo(-3, hy + 1).lineTo(-1, hy + 1).stroke({ width: 0.8, color: 0x1f2328 });
        g.moveTo(1, hy + 1).lineTo(3, hy + 1).stroke({ width: 0.8, color: 0x1f2328 });
      }
    }
    // Pastille de statut de mission réelle.
    const st = a.realWork.status;
    if (st !== "idle") {
      const col = st === "busy" ? 0x16a34a : st === "blocked" ? 0xdc2626 : st === "awaiting_approval" ? 0xf59e0b : 0x9ca3af;
      g.circle(7, hy - 6, 2.6).fill(col).stroke({ width: 1, color: 0xffffff });
    }
    if (anim === "wait" && !o.reducedMotion && (tick >> 4) % 2 === 0) g.circle(-8, hy - 4, 1.2).fill(0x6b7280);
  }

  private drawDebug(w: World, o: RenderOptions, alpha: number): void {
    const g = this.debugLayer;
    g.clear();
    if (!o.debug) return;
    // Ressources : rouge = occupée, ambre = réservée, contour bleu = file.
    for (const r of w.rm.byId.values()) {
      const col = r.occupant ? 0xdc2626 : r.reservedBy ? 0xf59e0b : null;
      if (col !== null) g.poly(diamond(r.def.tile.x, r.def.tile.y)).fill({ color: col, alpha: 0.25 });
      if (r.queue.length) for (let i = 0; i < r.queue.length && i < r.def.queueTiles.length; i++) {
        const q = r.def.queueTiles[i];
        g.poly(diamond(q.x, q.y)).stroke({ width: 1, color: 0x2563eb, alpha: 0.8 });
      }
    }
    for (const a of w.agents) {
      if (a.hidden) continue;
      const x = a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha;
      const y = a.prevPos.y + (a.pos.y - a.prevPos.y) * alpha;
      const c = toScreen(x, y);
      if (a.path.length) {
        g.moveTo(c.sx, c.sy);
        for (const t of a.path) {
          const s = toScreen(t.x, t.y);
          g.lineTo(s.sx, s.sy);
        }
        g.stroke({ width: o.selected === a.id ? 2 : 1, color: a.profile.look.shirt, alpha: 0.85 });
        const end = a.path[a.path.length - 1];
        const e = toScreen(end.x, end.y);
        g.circle(e.sx, e.sy, 2.5).fill(a.profile.look.shirt);
      }
      // Mini-jauges : vessie, faim, soif, énergie, stress, sociabilité.
      const bars: [number, number][] = [
        [a.needs.bladder, 0x0ea5e9],
        [a.needs.hunger, 0xf97316],
        [a.needs.thirst, 0x22d3ee],
        [1 - a.needs.energy, 0xfacc15],
        [a.needs.stress, 0xef4444],
        [a.needs.social, 0xa855f7],
      ];
      bars.forEach(([v, col], i) => {
        g.rect(c.sx - 12 + i * 4, c.sy + 4, 3, 10).fill({ color: 0x000000, alpha: 0.25 });
        g.rect(c.sx - 12 + i * 4, c.sy + 14 - 10 * v, 3, 10 * v).fill(col);
      });
      if (a.squeezing) g.circle(c.sx, c.sy, 10).stroke({ width: 1.5, color: 0xdc2626 });
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}

export { TILE_H };
