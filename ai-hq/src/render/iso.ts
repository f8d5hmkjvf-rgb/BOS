/** Projection isométrique 2:1. Une case de grille = un losange TILE_W × TILE_H. */
export const TILE_W = 40;
export const TILE_H = 20;

export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) };
}

export function toGrid(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Sommets du losange d'une case (centre en x,y). */
export function diamond(x: number, y: number): number[] {
  const c = toScreen(x, y);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  return [c.sx, c.sy - hh, c.sx + hw, c.sy, c.sx, c.sy + hh, c.sx - hw, c.sy];
}

/** Profondeur de tri : plus x+y est grand, plus l'objet est proche de la caméra. */
export function depth(x: number, y: number, bias = 0): number {
  return (x + y) * 10 + bias;
}
