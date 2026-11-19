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
/** At most this many pattern rows per row (or per count group); the smallest mixed patterns merge into "Other". */
export const MAX_PATTERN_ROWS = 12;
/** Rows of at least this many sets first split by the NUMBER of high sets (count groups), each opening into its patterns. */
export const PATTERN_COUNT_MIN = 4;
/** "Open all" opens at most this many rows. */
export const PATTERN_OPEN_ALL_MAX = 300;

export type PatternKind = "allHigh" | "mixed" | "allLow" | "equal" | "count" | "other";
export type Pattern = {
  id: string;
  kind: PatternKind;
  label: string;
  /** Dataset set indices of the row's sets at or above the cut (mixed and all-high patterns). */
  high: number[];
  level: "high" | "middle" | "low" | null;
  /** Count groups: the number of high sets. */
  count: number | null;
  /** 1: under the row; 2: under a count group. */
  depth: 1 | 2;
  /** A count group that opens into its patterns. */
  openable: boolean;
  /** CSS colour (a theme token or a mix of one). */
  color: string;
};
/** A pattern row: a Combo over the row's sets with a subset of its contributors; `parent` is the row's key. */
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
  const out: number[][] = [];
  for (let mask = 1; mask < (1 << k) - 1; mask++) out.push(Array.from({ length: k }, (_, p) => p).filter((p) => mask & (1 << p)));
  out.sort((a, b) => b.length - a.length || a.join(",").localeCompare(b.join(","), "en", { numeric: true }));
  return out.map((h) => "H:" + h.join(","));
}

/** Colour of a count group: one hue from light (no high set) to dark (all high), so it follows the count, not the rank. */
export const countColor = (count: number, k: number) => `color-mix(in oklab, var(--pat-count) ${Math.round(35 + (65 * count) / k)}%, var(--panel))`;

type Opts = PatternOptions & { names: readonly string[]; cols: readonly number[] };
type Groups = Map<string, { idx: number[]; mass: number }>;

/**
 * Contributors grouped by pattern id, with the sum of their values in the row (inclusive: min over T of m'; additive:
 * the component). `pos` lists T's positions in column order: classify() sees the values in column order, so the "H:"
 * positions are column positions.
 */
function groupContributors(d: Memberships, T: readonly number[], contributors: readonly number[], K: readonly number[], th: Threshold | null, mode: Mode, pos: number[], opts: PatternOptions): Groups {
  const k = T.length, L = d.L;
  const tauT = T.map((i) => tauOf(th, i));
  const outside = K.filter((j) => !T.includes(j));
  const tauO = outside.map((j) => tauOf(th, j));
  const groups: Groups = new Map();
  const v = new Float64Array(k);
  for (const x of contributors) {
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
  return groups;
}

const highOf = (id: string) => (/^H:\d/.test(id) ? id.slice(2).split(",").map(Number) : []);
/** Display order of mixed patterns: more high sets first, then by column positions. */
const byOrder = (a: string, b: string) => {
  const ha = highOf(a), hb = highOf(b);
  if (ha.length !== hb.length) return hb.length - ha.length;
  for (let q = 0; q < ha.length; q++) if (ha[q] !== hb[q]) return ha[q] - hb[q];
  return 0;
};

/** Context shared by the builders of one row. */
function context(c: Combo, opts: Opts) {
  const T = c.sets, k = T.length;
  const pos = opts.cols.filter((s) => T.includes(s)).map((s) => T.indexOf(s));
  const setAt = (p: number) => T[pos[p]];
  const nm = (p: number) => opts.names[setAt(p)];
  return { T, k, pos, setAt, nm, all: Array.from({ length: k }, (_, p) => p).join(",") };
}

/**
 * Mixed patterns of `ids` as rows: in display order; beyond `room` rows the smallest merge into one "Other" row
 * (numeric sort first: with many sets almost every contributor can have its own pattern).
 */
function mixedRows(ids: string[], groups: Groups, room: number, make: (id: string, g: { idx: number[]; mass: number }, r: number) => PatternRow, other: (ids: string[]) => PatternRow): PatternRow[] {
  let keep = ids, rest: string[] = [];
  if (ids.length > room) {
    const size = (id: string) => groups.get(id)!.idx.length;
    const bySize = ids.slice().sort((a, b) => size(b) - size(a) || (a < b ? -1 : a > b ? 1 : 0));
    keep = bySize.slice(0, room - 1);
    rest = bySize.slice(room - 1);
  }
  const out = keep.slice().sort(byOrder).map((id, r) => make(id, groups.get(id)!, r));
  if (rest.length) out.push(other(rest));
  return out;
}

function mergeOther(ids: string[], groups: Groups) {
  const idx = Array.from(Int32Array.from(ids.flatMap((id) => groups.get(id)!.idx)).sort());
  return { idx, mass: ids.reduce((s, id) => s + groups.get(id)!.mass, 0) };
}

/**
 * The pattern rows of a row: its contributors grouped by the joint pattern of their original memberships in the row's
 * sets. They partition the row: each contributor is in exactly one, and each pattern row's mass is the sum of its
 * contributors' values in the row (inclusive: min over T of m'; additive: the component), so the masses add up to the
 * row's mass. Empty patterns are left out.
 *
 * Rows of 2 or 3 sets: all high, each mixed pattern (more high sets first, then column order), all low, equal high,
 * middle, low; beyond MAX_PATTERN_ROWS the smallest mixed patterns merge into "Other mixed".
 * Rows of PATTERN_COUNT_MIN or more sets: count groups by the number of high sets, from "High in all k" down to "High
 * in none", then the equal rows; a group of 1 … k − 1 high sets opens into its patterns (patternChildren).
 * `cols` (the column order) orders the sets in the labels; `names` names them.
 */
export function patternRows(d: Memberships, c: Combo, K: readonly number[], th: Threshold | null, mode: Mode, opts: Opts): PatternRow[] {
  if (c.sets.length < 2 || !c.contributors.length) return [];
  const { T, k, pos, setAt, nm, all } = context(c, opts);
  const groups = groupContributors(d, T, c.contributors, K, th, mode, pos, opts);
  const make = (id: string, kind: PatternKind, label: string, color: string, idx: number[], mass: number, extra: Partial<Pattern> = {}): PatternRow => ({
    sets: T, key: `${c.key}|${id}`, mass, contributors: idx, parent: c.key, parentCount: c.contributors.length,
    pattern: { id, kind, label, high: highOf(id).map(setAt), level: null, count: null, depth: 1, openable: false, color, ...extra },
  });
  const out: PatternRow[] = [];
  const equalRows = () => {
    for (const id of EQUAL_ORDER) {
      const g = groups.get(id);
      const level = id.slice(2) as "high" | "middle" | "low";
      if (g) out.push(make(id, "equal", `Equal, ${level}`, `var(--pat-eq-${level === "middle" ? "mid" : level})`, g.idx, g.mass, { level }));
    }
  };

  if (k >= PATTERN_COUNT_MIN) {
    // count groups: contributors by the number of sets at or above the cut
    const byCount = new Map<number, { idx: number[]; mass: number; ids: number }>();
    for (const [id, g] of groups) {
      if (!id.startsWith("H:")) continue;
      const n = highOf(id).length;
      let e = byCount.get(n);
      if (!e) byCount.set(n, (e = { idx: [], mass: 0, ids: 0 }));
      for (const x of g.idx) e.idx.push(x);
      e.mass += g.mass;
      e.ids++;
    }
    for (let n = k; n >= 0; n--) {
      const e = byCount.get(n);
      if (!e) continue;
      e.idx.sort((a, b) => a - b);
      const color = countColor(n, k);
      if (n === k) out.push(make(`H:${all}`, "allHigh", `High in all ${k}`, color, e.idx, e.mass, { count: n }));
      else if (n === 0) out.push(make("H:", "allLow", "High in none (all low)", color, e.idx, e.mass, { count: 0 }));
      else out.push(make(`N:${n}`, "count", `High in ${n} of ${k} (${e.ids} ${e.ids === 1 ? "pattern" : "patterns"})`, color, e.idx, e.mass, { count: n, openable: e.ids > 1 }));
    }
    equalRows();
    return out;
  }

  const mixed = [...groups.keys()].filter((id) => id.startsWith("H:") && id !== "H:" && id !== `H:${all}`);
  const fixed = [`H:${all}`, "H:", ...EQUAL_ORDER].filter((id) => groups.has(id));
  const canon = canonicalMixed(k);
  const mixedLabel = (h: number[]) => Array.from({ length: k }, (_, p) => `${nm(p)} ${h.includes(p) ? "high" : "low"}`).join(" · ");
  const allHigh = groups.get(`H:${all}`);
  if (allHigh) out.push(make(`H:${all}`, "allHigh", k === 2 ? "Both high" : "All high", "var(--pat-high)", allHigh.idx, allHigh.mass));
  out.push(...mixedRows(
    mixed, groups, Math.max(1, MAX_PATTERN_ROWS - fixed.length),
    (id, g) => make(id, "mixed", mixedLabel(highOf(id)), MIXED_COLORS[canon.indexOf(id)] ?? "var(--pat-other)", g.idx, g.mass),
    (ids) => {
      const m = mergeOther(ids, groups);
      return make("H:other", "other", `Other mixed (${ids.length} patterns)`, "var(--pat-other)", m.idx, m.mass);
    },
  ));
  const allLow = groups.get("H:");
  if (allLow) out.push(make("H:", "allLow", k === 2 ? "Both low" : "All low", "var(--pat-low)", allLow.idx, allLow.mass));
  equalRows();
  return out;
}

/**
 * The patterns inside a count group ("High in 3 of 10"): one row per set of high sets ("High in Drama, Comedy, Crime"),
 * in display order, in the group's colour; beyond MAX_PATTERN_ROWS the smallest merge into "Other". They partition the
 * group. Other pattern rows have no children.
 */
export function patternChildren(d: Memberships, g: PatternRow, K: readonly number[], th: Threshold | null, mode: Mode, opts: Opts): PatternRow[] {
  if (g.pattern.kind !== "count" || !g.pattern.openable) return [];
  const { T, pos, setAt, nm } = context(g, opts);
  const groups = groupContributors(d, T, g.contributors, K, th, mode, pos, opts);
  const make = (id: string, kind: PatternKind, label: string, idx: number[], mass: number): PatternRow => ({
    sets: T, key: `${g.key}|${id}`, mass, contributors: idx, parent: g.parent, parentCount: g.contributors.length,
    pattern: { id, kind, label, high: highOf(id).map(setAt), level: null, count: g.pattern.count, depth: 2, openable: false, color: g.pattern.color },
  });
  return mixedRows(
    [...groups.keys()], groups, MAX_PATTERN_ROWS,
    (id, e) => make(id, "mixed", `High in ${highOf(id).map(nm).join(", ")}`, e.idx, e.mass),
    (ids) => {
      const m = mergeOther(ids, groups);
      return make("H:other", "other", `Other (${ids.length} patterns)`, m.idx, m.mass);
    },
  );
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
