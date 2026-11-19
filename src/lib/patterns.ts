// Joint patterns inside a row: how each contributor's original memberships in the row's sets combine (all high, one
// high and the other low, all low, about equal), the pattern rows that partition a row, and the binned ribbons between
// neighbouring set axes. Pure and tested; the rows come from fuzzyDecomposition.ts.

import { binOf, N_BINS, tauOf, TAU_EPS, thresholded, type Combo, type Memberships, type Mode, type RowValues, type Threshold } from "./fuzzyDecomposition.ts";

/** A membership at or above the cut is "high". */
export const PATTERN_CUT = 0.5;
/** Memberships within this range of each other (max − min) are "about equal". */
export const PATTERN_EPS = 0.15;
/** Equal rows: high if the mean is ≥ cut + EQUAL_MID, low if < cut − EQUAL_MID, middle otherwise. */
export const EQUAL_MID = 0.1;
/** At most this many pattern rows per row; the smallest mixed patterns merge into "Other mixed". */
export const MAX_PATTERN_ROWS = 12;
/** "Open all" opens at most this many rows. */
export const PATTERN_OPEN_ALL_MAX = 300;

export type PatternKind = "allHigh" | "mixed" | "allLow" | "equal" | "other";
export type Pattern = {
  id: string;
  kind: PatternKind;
  label: string;
  /** Dataset set indices of the row's sets at or above the cut (mixed and all-high patterns). */
  high: number[];
  level: "high" | "middle" | "low" | null;
  /** CSS colour (a theme token). */
  color: string;
};
/** A pattern row: a Combo over the parent's sets with a subset of its contributors. */
export type PatternRow = Combo & { parent: string; parentCount: number; pattern: Pattern };

export const isPatternRow = (c: Combo): c is PatternRow => "pattern" in c;

export type PatternOptions = { cut?: number; eps?: number };

/**
 * Pattern of one contributor from its original memberships `v` in the row's sets (positions 0 … |T| − 1): "E:high",
 * "E:middle", "E:low" when max − min ≤ eps; otherwise "H:" + the positions at or above the cut ("H:" = all low).
 */
export function classify(v: ArrayLike<number>, { cut = PATTERN_CUT, eps = PATTERN_EPS }: PatternOptions = {}): string {
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (let p = 0; p < v.length; p++) {
    if (v[p] < lo) lo = v[p];
    if (v[p] > hi) hi = v[p];
    sum += v[p];
  }
  if (hi - lo <= eps + TAU_EPS) {
    const mean = sum / v.length;
    return mean >= cut + EQUAL_MID - TAU_EPS ? "E:high" : mean < cut - EQUAL_MID - TAU_EPS ? "E:low" : "E:middle";
  }
  const h: number[] = [];
  for (let p = 0; p < v.length; p++) if (v[p] >= cut - TAU_EPS) h.push(p);
  return "H:" + h.join(",");
}

const EQUAL_ORDER = ["E:high", "E:middle", "E:low"];
const MIXED_COLORS = ["var(--pat-mixed-1)", "var(--pat-mixed-2)", "var(--pat-mixed-3)"];

/** Mixed high-sets in canonical order (more high sets first, then by column position): the colour follows the pattern. */
function canonicalMixed(k: number): string[] {
  if (k > 6) return [];
  const out: number[][] = [];
  for (let mask = 1; mask < (1 << k) - 1; mask++) out.push(Array.from({ length: k }, (_, p) => p).filter((p) => mask & (1 << p)));
  out.sort((a, b) => b.length - a.length || a.join(",").localeCompare(b.join(","), "en", { numeric: true }));
  return out.map((h) => "H:" + h.join(","));
}

/**
 * The pattern rows of a row: its contributors grouped by pattern (original memberships in the row's sets). They
 * partition the row: each contributor is in exactly one, and each pattern row's mass is the sum of its contributors'
 * values in the row (inclusive: min over T of m'; additive: the component), so the masses add up to the row's mass.
 * Order: all high, mixed (more high sets first, then column order), all low, equal high, middle, low; empty patterns
 * are left out; beyond MAX_PATTERN_ROWS the smallest mixed patterns merge into "Other mixed".
 * `cols` (the column order) orders the sets in the labels; `names` names them.
 */
export function patternRows(
  d: Memberships, c: Combo, K: readonly number[], th: Threshold | null, mode: Mode,
  { names, cols, ...opts }: PatternOptions & { names: readonly string[]; cols: readonly number[] },
): PatternRow[] {
  const T = c.sets, k = T.length, L = d.L;
  if (k < 2 || !c.contributors.length) return [];
  // positions of T in column order (labels and ordering of mixed patterns)
  const pos = cols.filter((s) => T.includes(s)).map((s) => T.indexOf(s));
  const tauT = T.map((i) => tauOf(th, i));
  const outside = K.filter((j) => !T.includes(j));
  const tauO = outside.map((j) => tauOf(th, j));
  const groups = new Map<string, { idx: number[]; mass: number }>();
  const v = new Float64Array(k);
  for (const x of c.contributors) {
    let inside = Infinity;
    for (let p = 0; p < k; p++) {
      v[p] = d.P[x * L + T[pos[p]]];
      const t = thresholded(d.P[x * L + T[p]], tauT[p]);
      if (t < inside) inside = t;
    }
    let value = inside;
    if (mode === "additive") {
      let out = 0;
      for (let q = 0; q < outside.length; q++) {
        const t = thresholded(d.P[x * L + outside[q]], tauO[q]);
        if (t > out) out = t;
      }
      value = Math.max(0, inside - out);
    }
    const id = classify(v, opts);
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { idx: [], mass: 0 }));
    g.idx.push(x);
    g.mass += value;
  }
  // classify() saw the values in column order, so the "H:" positions are column positions
  const setAt = (p: number) => T[pos[p]];
  const highOf = (id: string) => (/^H:\d/.test(id) ? id.slice(2).split(",").map(Number) : []);
  const all = Array.from({ length: k }, (_, p) => p).join(",");
  // display order of mixed patterns: more high sets first, then by column positions (numerically)
  const byOrder = (a: string, b: string) => {
    const ha = highOf(a), hb = highOf(b);
    if (ha.length !== hb.length) return hb.length - ha.length;
    for (let q = 0; q < ha.length; q++) if (ha[q] !== hb[q]) return ha[q] - hb[q];
    return 0;
  };
  const mixed = [...groups.keys()].filter((id) => id.startsWith("H:") && id !== "H:" && id !== `H:${all}`);
  const fixed = [`H:${all}`, "H:", ...EQUAL_ORDER].filter((id) => groups.has(id));
  let keep = mixed;
  let other: string[] = [];
  if (fixed.length + mixed.length > MAX_PATTERN_ROWS) {
    // keep the largest (numeric sort first: with many sets almost every contributor can have its own pattern)
    const room = Math.max(0, MAX_PATTERN_ROWS - fixed.length - 1);
    const size = (id: string) => groups.get(id)!.idx.length;
    const bySize = mixed.slice().sort((a, b) => size(b) - size(a) || (a < b ? -1 : a > b ? 1 : 0));
    keep = bySize.slice(0, room);
    other = bySize.slice(room);
  }
  keep.sort(byOrder);
  const canon = canonicalMixed(k);
  const nm = (p: number) => names[setAt(p)];
  const mixedLabel = (h: number[]) =>
    k <= 3 ? Array.from({ length: k }, (_, p) => `${nm(p)} ${h.includes(p) ? "high" : "low"}`).join(" · ")
      : `high in ${h.map(nm).join(", ")}; low in the others`;
  const make = (id: string, kind: PatternKind, label: string, color: string, idx: number[], mass: number, level: Pattern["level"] = null): PatternRow => ({
    sets: T, key: `${c.key}|${id}`, mass, contributors: idx, parent: c.key, parentCount: c.contributors.length,
    pattern: { id, kind, label, high: highOf(id).map(setAt), level, color },
  });
  const out: PatternRow[] = [];
  const allHigh = groups.get(`H:${all}`);
  if (allHigh) out.push(make(`H:${all}`, "allHigh", k === 2 ? "Both high" : "All high", "var(--pat-high)", allHigh.idx, allHigh.mass));
  keep.forEach((id, r) => {
    const g = groups.get(id)!;
    const slot = canon.length ? canon.indexOf(id) : r;
    out.push(make(id, "mixed", mixedLabel(highOf(id)), MIXED_COLORS[slot] ?? "var(--pat-other)", g.idx, g.mass));
  });
  if (other.length) {
    const idx = Int32Array.from(other.flatMap((id) => groups.get(id)!.idx)).sort();
    out.push(make("H:other", "other", `Other mixed (${other.length} patterns)`, "var(--pat-other)", Array.from(idx), other.reduce((s, id) => s + groups.get(id)!.mass, 0)));
  }
  const allLow = groups.get("H:");
  if (allLow) out.push(make("H:", "allLow", k === 2 ? "Both low" : "All low", "var(--pat-low)", allLow.idx, allLow.mass));
  for (const id of EQUAL_ORDER) {
    const g = groups.get(id);
    const level = id.slice(2) as "high" | "middle" | "low";
    if (g) out.push(make(id, "equal", `Equal, ${level}`, `var(--pat-eq-${level === "middle" ? "mid" : level})`, g.idx, g.mass, level));
  }
  return out;
}

// ---- ribbons between neighbouring set axes ----------------------------------------------------------------------------

/** counts[i][j]: contributors in display bin i of the left set and bin j of the right set. */
export function ribbonCounts(a: ArrayLike<number>, b: ArrayLike<number>): number[][] {
  const t = Array.from({ length: N_BINS }, () => new Array(N_BINS).fill(0));
  for (let x = 0; x < a.length; x++) t[binOf(a[x])][binOf(b[x])]++;
  return t;
}

const ribbonCache = new WeakMap<object, Map<string, number[][]>>();
/** The ribbon table of sets at positions a and b of a row (cached per row values). */
export function ribbonsOf(rv: RowValues, a: number, b: number): number[][] {
  let m = ribbonCache.get(rv);
  if (!m) ribbonCache.set(rv, (m = new Map()));
  let t = m.get(`${a},${b}`);
  if (!t) m.set(`${a},${b}`, (t = ribbonCounts(rv.values[a], rv.values[b])));
  return t;
}

/** One ribbon: bins, count, and its band at each axis as offsets (px) from the top of its bin. */
export type Ribbon = { i: number; j: number; count: number; left: [number, number]; right: [number, number] };

/**
 * Parallel-sets geometry: in every bin the ribbons are stacked without overlap and centred, each as thick as
 * count / scaleMax · (binH − 1). At the left axis a bin's ribbons are ordered by target bin (higher on top), at the
 * right axis by source bin, so ribbons cross only when the memberships do. `scaleMax` ≥ every bin total (the row's
 * largest histogram bin), so a stack never exceeds its bin.
 */
export function ribbonGeometry(counts: number[][], scaleMax: number, binH: number): Ribbon[] {
  const th = (c: number) => (scaleMax > 0 ? (c / scaleMax) * (binH - 1) : 0);
  const left = new Map<string, [number, number]>(), right = new Map<string, [number, number]>();
  for (let i = 0; i < N_BINS; i++) {
    const tot = counts[i].reduce((s, c) => s + th(c), 0);
    let y = (binH - tot) / 2;
    for (let j = N_BINS - 1; j >= 0; j--) if (counts[i][j]) left.set(`${i},${j}`, [y, (y += th(counts[i][j]))]);
  }
  for (let j = 0; j < N_BINS; j++) {
    const tot = counts.reduce((s, r) => s + th(r[j]), 0);
    let y = (binH - tot) / 2;
    for (let i = N_BINS - 1; i >= 0; i--) if (counts[i][j]) right.set(`${i},${j}`, [y, (y += th(counts[i][j]))]);
  }
  const out: Ribbon[] = [];
  for (let i = 0; i < N_BINS; i++)
    for (let j = 0; j < N_BINS; j++) if (counts[i][j]) out.push({ i, j, count: counts[i][j], left: left.get(`${i},${j}`)!, right: right.get(`${i},${j}`)! });
  return out;
}
