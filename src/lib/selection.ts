// Selecting observations by dragging a rectangle on the map.

/** Indices of the points inside the rectangle [x0, x1] × [y0, y1] (in the points' own coordinates; corners in any order). */
export function pointsInRect(pts: ArrayLike<readonly [number, number]>, x0: number, y0: number, x1: number, y1: number): number[] {
  const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [c, d] = y0 <= y1 ? [y0, y1] : [y1, y0];
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x >= a && x <= b && y >= c && y <= d) out.push(i);
  }
  return out;
}
