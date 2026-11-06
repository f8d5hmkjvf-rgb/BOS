import { Cell, Grid } from "./grid";
import type { DepartmentId, Direction, ResourceType, Tile } from "./types";

export type RoomKind =
  | "openspace"
  | "corridor"
  | "meeting"
  | "ceo"
  | "toilets"
  | "lounge"
  | "cafeteria"
  | "ops";

export interface Room {
  id: number;
  name: string;
  kind: RoomKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type FurnitureKind =
  | "desk"
  | "meeting_table"
  | "counter"
  | "coffee_machine"
  | "sink"
  | "toilet"
  | "stall_wall"
  | "sofa"
  | "plant"
  | "water_cooler"
  | "cafe_table"
  | "high_table"
  | "whiteboard";

export interface Furniture {
  kind: FurnitureKind;
  tile: Tile;
}

export interface ResourceDef {
  id: string;
  type: ResourceType;
  /** Case d'interaction (franchissable) où l'agent se place. */
  tile: Tile;
  /** Orientation de l'agent pendant l'utilisation. */
  facing: Direction;
  /** Cases de file d'attente (index 0 = en tête). */
  queueTiles: Tile[];
  roomId: number;
  /** Propriétaire attitré (bureaux). */
  owner?: string;
  /** Porte de cabine (toilettes) : devient un obstacle dynamique pendant l'utilisation. */
  doorTile?: Tile;
  /** Groupe logique (ex. table de café partagée, salle de réunion). */
  group?: string;
  /** Clé de file partagée : toutes les ressources de même clé ont une seule file. */
  queueKey?: string;
}

export interface OfficeMap {
  grid: Grid;
  rooms: Room[];
  furniture: Furniture[];
  resources: ResourceDef[];
  exitTile: Tile;
}

export interface DeskRequest {
  agentId: string;
  department: DepartmentId;
}

export const MAP_W = 48;
export const MAP_H = 36;

/**
 * Construit le plan du siège : deux open spaces, un couloir en croix, salle de réunion,
 * bureau du CEO, sanitaires (4 cabines + 3 lavabos), lounge, cafétéria et pôle Ops.
 * Les bureaux sont attribués dans l'ordre des demandes, par zone de département.
 */
export function buildOfficeMap(desks: DeskRequest[]): OfficeMap {
  const grid = new Grid(MAP_W, MAP_H);
  const rooms: Room[] = [];
  const furniture: Furniture[] = [];
  const resources: ResourceDef[] = [];

  // Enveloppe extérieure + sol.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      grid.set(x, y, border ? Cell.Wall : Cell.Floor);
    }

  const wallH = (y: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) grid.set(x, y, Cell.Wall);
  };
  const wallV = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) grid.set(x, y, Cell.Wall);
  };
  const door = (x: number, y: number) => grid.set(x, y, Cell.Floor);
  const room = (name: string, kind: RoomKind, x0: number, y0: number, x1: number, y1: number) => {
    const r: Room = { id: rooms.length, name, kind, x0, y0, x1, y1 };
    rooms.push(r);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) grid.roomIds[grid.idx(x, y)] = r.id;
    return r;
  };
  const place = (kind: FurnitureKind, x: number, y: number) => {
    grid.set(x, y, Cell.Furniture);
    furniture.push({ kind, tile: { x, y } });
  };
  const res = (def: Omit<ResourceDef, "queueTiles"> & { queueTiles?: Tile[] }) => {
    resources.push({ queueTiles: [], ...def });
  };

  // Murs intérieurs : couloir horizontal y=16..18, couloir vertical x=22..24.
  wallH(15, 1, 21);
  wallH(15, 25, 46);
  wallH(19, 1, 21);
  wallH(19, 25, 46);
  wallV(21, 1, 15);
  wallV(25, 1, 15);
  wallV(21, 19, 34);
  wallV(25, 19, 34);
  // Bas-gauche.
  wallV(12, 20, 34);
  wallH(28, 1, 11);
  wallH(27, 13, 20);
  wallH(34, 1, 9); // fond des cabines
  // Bas-droite.
  wallV(39, 20, 34);

  // Portes.
  [10, 11].forEach((x) => door(x, 15));
  [7, 8].forEach((y) => door(21, y));
  [35, 36].forEach((x) => door(x, 15));
  [7, 8].forEach((y) => door(25, y));
  [5, 6].forEach((x) => door(x, 19));
  door(21, 23);
  [32, 33].forEach((y) => door(21, y));
  [30, 31].forEach((y) => door(12, y));
  [32, 33].forEach((x) => door(x, 19));
  [24, 25].forEach((y) => door(25, y));
  [26, 27].forEach((y) => door(39, y));
  [43, 44].forEach((x) => door(x, 19));
  door(0, 17); // entrée principale

  const openA = room("Open space Tech & Data", "openspace", 1, 1, 20, 14);
  const openB = room("Open space Produit · Marketing · Ventes", "openspace", 26, 1, 46, 14);
  const corridorH = room("Couloir principal", "corridor", 1, 16, 46, 18);
  room("Couloir nord", "corridor", 22, 1, 24, 15);
  room("Couloir sud", "corridor", 22, 19, 24, 34);
  const meeting = room("Salle de réunion Atlas", "meeting", 1, 20, 11, 27);
  const ceo = room("Bureau du CEO", "ceo", 13, 20, 20, 26);
  const toilets = room("Sanitaires", "toilets", 1, 29, 11, 34);
  const lounge = room("Lounge", "lounge", 13, 28, 20, 34);
  const cafe = room("Cafétéria", "cafeteria", 26, 20, 38, 34);
  const ops = room("Pôle Ops", "ops", 40, 20, 46, 34);
  void corridorH;

  // --- Bureaux --------------------------------------------------------------
  const deskSlots: Record<"A" | "B" | "OPS" | "CEO", Tile[]> = { A: [], B: [], OPS: [], CEO: [] };
  for (const y of [3, 9]) for (const x of [3, 6, 9, 12, 15, 18]) deskSlots.A.push({ x, y });
  for (const y of [3, 9]) for (const x of [28, 31, 34, 37, 40, 43]) deskSlots.B.push({ x, y });
  for (const y of [22, 26, 30]) for (const x of [41, 44]) deskSlots.OPS.push({ x, y });
  deskSlots.CEO.push({ x: 16, y: 22 });

  const zoneOf = (d: DepartmentId): keyof typeof deskSlots => {
    switch (d) {
      case "direction":
        return "CEO";
      case "tech":
      case "data":
        return "A";
      case "ops":
        return "OPS";
      default:
        return "B";
    }
  };
  const roomOfZone = { A: openA, B: openB, OPS: ops, CEO: ceo } as const;
  for (const req of desks) {
    let zone = zoneOf(req.department);
    if (deskSlots[zone].length === 0) zone = deskSlots.B.length ? "B" : "A";
    const slot = deskSlots[zone].shift();
    if (!slot) throw new Error(`Plus de bureau disponible pour ${req.agentId}`);
    place("desk", slot.x, slot.y);
    res({
      id: `desk:${req.agentId}`,
      type: "desk",
      tile: { x: slot.x, y: slot.y + 1 },
      facing: 6,
      roomId: roomOfZone[zone].id,
      owner: req.agentId,
    });
  }

  // Décor des open spaces.
  [
    [1, 1],
    [20, 1],
    [1, 14],
    [20, 14],
    [26, 1],
    [46, 1],
    [26, 14],
    [46, 14],
    [46, 34],
    [13, 20],
  ].forEach(([x, y]) => place("plant", x, y));
  place("whiteboard", 10, 1);
  place("whiteboard", 36, 1);

  // --- Salle de réunion -----------------------------------------------------
  for (let y = 22; y <= 25; y++) for (let x = 3; x <= 9; x++) place("meeting_table", x, y);
  let seat = 0;
  for (let x = 3; x <= 9; x++) {
    res({ id: `meet:${seat++}`, type: "meeting_seat", tile: { x, y: 21 }, facing: 2, roomId: meeting.id, group: "atlas" });
    res({ id: `meet:${seat++}`, type: "meeting_seat", tile: { x, y: 26 }, facing: 6, roomId: meeting.id, group: "atlas" });
  }
  res({ id: `meet:${seat++}`, type: "meeting_seat", tile: { x: 2, y: 23 }, facing: 0, roomId: meeting.id, group: "atlas" });
  res({ id: `meet:${seat++}`, type: "meeting_seat", tile: { x: 10, y: 23 }, facing: 4, roomId: meeting.id, group: "atlas" });
  place("whiteboard", 1, 21);

  // --- Sanitaires : 4 cabines (porte + intérieur), 3 lavabos -------------------
  const stallXs = [2, 4, 6, 8];
  for (const sx of [3, 5, 7, 9]) {
    grid.set(sx, 32, Cell.Wall);
    grid.set(sx, 33, Cell.Wall);
    furniture.push({ kind: "stall_wall", tile: { x: sx, y: 32 } });
  }
  const toiletQueue: Tile[] = [
    { x: 10, y: 31 },
    { x: 10, y: 32 },
    { x: 10, y: 33 },
    { x: 11, y: 33 },
    { x: 11, y: 32 },
  ];
  stallXs.forEach((sx, i) => {
    furniture.push({ kind: "toilet", tile: { x: sx, y: 33 } });
    res({
      id: `wc:${i}`,
      type: "toilet_stall",
      tile: { x: sx, y: 33 },
      facing: 6,
      roomId: toilets.id,
      doorTile: { x: sx, y: 32 },
      queueTiles: toiletQueue,
      group: "wc",
      queueKey: "wc",
    });
  });
  [3, 5, 7].forEach((x, i) => {
    place("sink", x, 29);
    res({
      id: `sink:${i}`,
      type: "sink",
      tile: { x, y: 30 },
      facing: 6,
      roomId: toilets.id,
      group: "sinks",
      queueKey: "sinks",
      queueTiles: [
        { x: 8, y: 30 },
        { x: 9, y: 30 },
      ],
    });
  });

  // --- Lounge -----------------------------------------------------------------
  for (const x of [14, 15, 16]) place("sofa", x, 34);
  for (const x of [14, 15, 16]) res({ id: `sofa:${x}`, type: "sofa", tile: { x, y: 33 }, facing: 2, roomId: lounge.id, group: "lounge" });
  for (const y of [30, 31]) place("sofa", 20, y);
  for (const y of [30, 31]) res({ id: `sofa:r${y}`, type: "sofa", tile: { x: 19, y }, facing: 0, roomId: lounge.id, group: "lounge" });
  place("water_cooler", 13, 28);
  res({ id: "water:lounge", type: "water_cooler", tile: { x: 14, y: 28 }, facing: 4, roomId: lounge.id, queueTiles: [{ x: 15, y: 28 }, { x: 16, y: 28 }] });
  place("plant", 20, 28);

  // --- Cafétéria --------------------------------------------------------------
  for (let x = 27; x <= 31; x++) place("counter", x, 20);
  [27, 29, 31].forEach((x, i) =>
    res({
      id: `food:${i}`,
      type: "food_counter",
      tile: { x, y: 21 },
      facing: 6,
      roomId: cafe.id,
      queueTiles: [
        { x, y: 22 },
        { x, y: 23 },
        { x, y: 24 },
      ],
    }),
  );
  [34, 37].forEach((x, i) => {
    place("coffee_machine", x, 20);
    res({
      id: `coffee:${i}`,
      type: "coffee_machine",
      tile: { x, y: 21 },
      facing: 6,
      roomId: cafe.id,
      queueTiles: [
        { x, y: 22 },
        { x, y: 23 },
        { x, y: 24 },
        { x: x === 34 ? 33 : 38, y: 24 },
      ],
      group: "coffee",
    });
  });
  // Mange-debout pour boire son café (et discuter).
  for (const hx of [34, 37]) {
    place("high_table", hx, 27);
    for (const [dx, dy, f] of [
      [-1, 0, 0],
      [1, 0, 4],
      [0, 1, 6],
      [0, -1, 2],
    ] as const)
      res({
        id: `cspot:${hx}:${dx}:${dy}`,
        type: "coffee_spot",
        tile: { x: hx + dx, y: 27 + dy },
        facing: f,
        roomId: cafe.id,
        group: `htable:${hx}`,
      });
  }
  place("water_cooler", 38, 30);
  res({ id: "water:cafe", type: "water_cooler", tile: { x: 37, y: 30 }, facing: 0, roomId: cafe.id, queueTiles: [{ x: 36, y: 30 }, { x: 36, y: 31 }] });
  // Tables de cafétéria.
  for (const ty of [29, 32]) {
    for (const tx of [27, 31]) {
      for (const dx of [0, 1]) {
        place("cafe_table", tx + dx, ty);
        res({ id: `cseat:${tx + dx}:${ty - 1}`, type: "cafeteria_seat", tile: { x: tx + dx, y: ty - 1 }, facing: 2, roomId: cafe.id, group: `ctable:${tx}:${ty}` });
        res({ id: `cseat:${tx + dx}:${ty + 1}`, type: "cafeteria_seat", tile: { x: tx + dx, y: ty + 1 }, facing: 6, roomId: cafe.id, group: `ctable:${tx}:${ty}` });
      }
    }
  }

  const exitTile = { x: 1, y: 17 };
  res({ id: "exit", type: "exit", tile: exitTile, facing: 4, roomId: corridorH.id });

  return { grid, rooms, furniture, resources, exitTile };
}
