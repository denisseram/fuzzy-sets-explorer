// Display geometry of the participating cells: half violins (smoothed counts), the jitter of the points, the element
// profile curve and the points cap. Pure and tested; the values come from fuzzyDecomposition.rowValues.

/** Gaussian kernel bandwidth of the half violins (membership units). */
export const VIOLIN_BANDWIDTH = 0.06;
/** f is evaluated at y = 0, 0.02, …, 1. */
export const VIOLIN_STEPS = 51;
/** f counts elements per this width of membership (the histogram bin width). */
export const VIOLIN_UNIT = 0.2;
/** Above this many contributors a row draws its violins without points (except the reference element's). */
export const MAX_POINTS = 200;

/** Values are binned at 0.01 (101 bins) before smoothing. */
const BINS = 101;
/** K_h(j · 0.01) for j = −200 … 200 (index j + 200): every offset between a bin and an evaluation point, reflections included. */
const KERNEL = (() => {
  const h = VIOLIN_BANDWIDTH, c = 1 / (h * Math.sqrt(2 * Math.PI));
  const t = new Float64Array(401);
  for (let j = -200; j <= 200; j++) t[j + 200] = c * Math.exp(-((j * 0.01) ** 2) / (2 * h * h));
  return t;
})();

const gauss = (u: number) => Math.exp(-(u * u) / (2 * VIOLIN_BANDWIDTH ** 2)) / (VIOLIN_BANDWIDTH * Math.sqrt(2 * Math.PI));
const yAt = (i: number) => i / (VIOLIN_STEPS - 1);

/**
 * f(y) = 0.2 · Σ_k [K_h(y − v_k) + K_h(y + v_k) + K_h(y − (2 − v_k))] at the 51 points, from every value (the
 * definition; the test oracle). The two extra terms reflect the kernel at 0 and 1, so no mass leaves [0, 1]; f is a
 * count per 0.2 of membership, not a probability density (its integral over [0, 1] is 0.2 · n).
 */
export function violinDirect(values: ArrayLike<number>): Float64Array {
  const f = new Float64Array(VIOLIN_STEPS);
  for (let i = 0; i < VIOLIN_STEPS; i++) {
    const y = yAt(i);
    let s = 0;
    for (let k = 0; k < values.length; k++) {
      const v = values[k];
      s += gauss(y - v) + gauss(y + v) + gauss(y - (2 - v));
    }
    f[i] = VIOLIN_UNIT * s;
  }
  return f;
}

/**
 * The same f from the values linearly binned at 0.01 (each value split between its two neighbouring bins), so the cost
 * per cell is O(n + 51 · 101) and the kernel comes from a table. Within 0.4 % of max f of the direct sum.
 */
export function violin(values: ArrayLike<number>): Float64Array {
  const w = new Float64Array(BINS);
  for (let k = 0; k < values.length; k++) {
    const p = Math.min(1, Math.max(0, values[k])) * (BINS - 1);
    const lo = Math.min(BINS - 2, Math.floor(p));
    const fr = p - lo;
    w[lo] += 1 - fr;
    w[lo + 1] += fr;
  }
  const f = new Float64Array(VIOLIN_STEPS);
  if (!values.length) return f;
  for (let b = 0; b < BINS; b++) {
    const c = w[b];
    if (!c) continue;
    for (let i = 0; i < VIOLIN_STEPS; i++) {
      const j = 2 * i; // y in units of 0.01
      // offsets y − v, y + v and y − (2 − v), in 0.01 units, shifted by 200 into the table
      f[i] += c * (KERNEL[j - b + 200] + KERNEL[j + b + 200] + KERNEL[j + b]);
    }
  }
  for (let i = 0; i < VIOLIN_STEPS; i++) f[i] *= VIOLIN_UNIT;
  return f;
}

/** Trapezoid integral of f over [0, 1]. */
export function integrate(f: ArrayLike<number>): number {
  const dy = 1 / (f.length - 1);
  let s = 0;
  for (let i = 1; i < f.length; i++) s += ((f[i - 1] + f[i]) / 2) * dy;
  return s;
}

/** One violin per value array, computed once (values arrays are cached per row by the caller). */
const cache = new WeakMap<object, { f: Float64Array; max: number }>();
export function violinOf(values: ArrayLike<number> & object): { f: Float64Array; max: number } {
  let v = cache.get(values);
  if (!v) {
    const f = violin(values);
    let max = 0;
    for (const x of f) if (x > max) max = x;
    cache.set(values, (v = { f, max }));
  }
  return v;
}

// ---- points ----------------------------------------------------------------------------------------------------------

/** Deterministic offset in [0, 1) of an element (by its index): the same in every cell, mode, τ and render. */
export function jitter(x: number): number {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Position of `x` in an ascending array (−1 if absent). */
export function indexOfSorted(a: readonly number[], x: number): number {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a[m] === x) return m;
    if (a[m] < x) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

/**
 * Positions (into the row's ascending contributors) of the points to draw: all of them up to `cap`; above it only the
 * reference element's (if it contributes).
 */
export function pointsToDraw(contributors: readonly number[], ref: number | null, cap = MAX_POINTS): number[] {
  if (contributors.length <= cap) return contributors.map((_, j) => j);
  const j = ref === null ? -1 : indexOfSorted(contributors, ref);
  return j >= 0 ? [j] : [];
}

// ---- the element profile -----------------------------------------------------------------------------------------------

export type Pt = readonly [number, number];
export type Segment = { p0: Pt; c1: Pt; c2: Pt; p1: Pt };

/**
 * Cubic Bézier segments through the points, left to right: control points (xm, y0) and (xm, y1) with xm the midpoint,
 * so the curve leaves and enters each point horizontally and stays between the y of the two points it connects.
 */
export function profileSegments(pts: readonly Pt[]): Segment[] {
  const out: Segment[] = [];
  for (let s = 1; s < pts.length; s++) {
    const [x0, y0] = pts[s - 1], [x1, y1] = pts[s];
    const xm = (x0 + x1) / 2;
    out.push({ p0: pts[s - 1], c1: [xm, y0], c2: [xm, y1], p1: pts[s] });
  }
  return out;
}

export function profilePath(pts: readonly Pt[]): string {
  if (pts.length < 2) return "";
  const f = (v: number) => +v.toFixed(2);
  return `M${f(pts[0][0])},${f(pts[0][1])}` + profileSegments(pts).map((g) => `C${f(g.c1[0])},${f(g.c1[1])} ${f(g.c2[0])},${f(g.c2[1])} ${f(g.p1[0])},${f(g.p1[1])}`).join("");
}

/** Point at t ∈ [0, 1] of a segment. */
export function bezierAt(g: Segment, t: number): Pt {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * g.p0[0] + b * g.c1[0] + c * g.c2[0] + d * g.p1[0], a * g.p0[1] + b * g.c1[1] + c * g.c2[1] + d * g.p1[1]];
}
