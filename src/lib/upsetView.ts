// Display logic of the fuzzy UpSet: filters, sorting, groups, queries, level of detail, horizon bars, lattice
// neighbourhoods, row layout (fish-eye, stubs) and snapshot rank comparison. Pure and tested; the numbers it
// aggregates come from fuzzyDecomposition.ts.

import { keepMass, lexCompare, type Combo } from "./fuzzyDecomposition";

// ---- filters (UpSet degree range, plus mass and contributors) -------------------------------------------------------

export type Filters = { minDegree: number; maxDegree: number; minMass: number; minContributors: number };

/**
 * Rows passing the filters. Empty rows (mass 0) are kept only with `showEmpty` and only the degree range applies to
 * them; for the other rows: degree in range, mass ≥ minMass (0: > 0) and at least minContributors contributors.
 */
export function applyFilters(rows: readonly Combo[], f: Filters, showEmpty = false): Combo[] {
  return rows.filter((c) => {
    const deg = c.sets.length;
    if (deg < f.minDegree || deg > f.maxDegree) return false;
    if (c.mass <= 0) return showEmpty;
    return keepMass(c.mass, f.minMass) && c.contributors.length >= f.minContributors;
  });
}

// ---- sorting -------------------------------------------------------------------------------------------------------

export type SortBy = "degree" | "mass" | "contributors" | "mean";

/** Positions of the row's sets in the column order, ascending (for "ties by set order"). */
const positions = (sets: readonly number[], rank: Map<number, number>) => sets.map((s) => rank.get(s) ?? 1e9).sort((a, b) => a - b);

/**
 * Rows sorted by degree (ascending; ties lexicographic by column position) or, descending, by membership mass,
 * contributors or mean contribution (mass / contributors, 0 without contributors); their ties by degree order.
 */
export function sortRows(rows: readonly Combo[], by: SortBy, order: readonly number[]): Combo[] {
  const rank = new Map(order.map((s, i) => [s, i]));
  const dec = rows.map((c) => ({ c, pos: positions(c.sets, rank), v: value(c, by) }));
  dec.sort((a, b) => (by === "degree" ? 0 : b.v - a.v) || a.pos.length - b.pos.length || lexCompare(a.pos, b.pos));
  return dec.map((d) => d.c);
}

export function value(c: Combo, by: SortBy): number {
  const n = c.contributors.length;
  return by === "mass" ? c.mass : by === "contributors" ? n : by === "mean" ? (n ? c.mass / n : 0) : c.sets.length;
}

// ---- aggregation (UpSet groups) ------------------------------------------------------------------------------------

export type GroupBy = "none" | "degree" | "set" | "pairs" | "setPairs";

export type Group = {
  id: string;
  label: string;
  /** The grouping sets (dark circles in the header); the other selected sets are drawn as "may". Null: no glyph. */
  sets: number[] | null;
  /** The group's rows (each once), in the sorted order. */
  rows: Combo[];
  /** Nested groups (set → pairs); their rows repeat the parent's. */
  children: Group[] | null;
};

const has = (c: Combo, s: number) => c.sets.includes(s);

/**
 * Groups of the sorted rows, in a fixed order: degree ascending; sets in column order; pairs in column order. Group by
 * set and by pairs repeat a row in every group it belongs to (as in UpSet). By pairs, rows of one set go to a last
 * group "One set". Set → pairs nests, under "Contains A", the groups "A, B", … and "A only". Empty groups are omitted.
 */
export function groupRows(rows: readonly Combo[], by: GroupBy, order: readonly number[], names: readonly string[]): Group[] | null {
  if (by === "none") return null;
  const g = (id: string, label: string, sets: number[] | null, rs: Combo[], children: Group[] | null = null): Group => ({ id, label, sets, rows: rs, children });
  const nonEmpty = (gs: Group[]) => gs.filter((x) => x.rows.length);
  if (by === "degree") {
    const degs = [...new Set(rows.map((c) => c.sets.length))].sort((a, b) => a - b);
    return degs.map((k) => g(`d${k}`, `Degree ${k}`, null, rows.filter((c) => c.sets.length === k)));
  }
  const pairs = (pre: string, within: readonly Combo[], first: number | null) => {
    const out: Group[] = [];
    for (let a = 0; a < order.length; a++)
      for (let b = a + 1; b < order.length; b++) {
        const A = order[a], B = order[b];
        if (first !== null && A !== first && B !== first) continue;
        out.push(g(`${pre}p${A},${B}`, `${names[A]}, ${names[B]}`, [A, B], within.filter((c) => has(c, A) && has(c, B))));
      }
    return nonEmpty(out);
  };
  if (by === "set") return nonEmpty(order.map((s) => g(`s${s}`, `Contains ${names[s]}`, [s], rows.filter((c) => has(c, s)))));
  if (by === "pairs") return [...pairs("", rows, null), ...nonEmpty([g("p1", "One set", null, rows.filter((c) => c.sets.length === 1))])];
  return nonEmpty(order.map((s) => {
    const rs = rows.filter((c) => has(c, s));
    const kids = [...pairs(`s${s}/`, rs, s), ...nonEmpty([g(`s${s}/only`, `${names[s]} only`, [s], rs.filter((c) => c.sets.length === 1))])];
    return g(`s${s}`, `Contains ${names[s]}`, [s], rs, kids);
  }));
}

// ---- queries (UpSet's must / may / not) ----------------------------------------------------------------------------

export type QState = "must" | "may" | "not";
/** One clause: a state per set (missing = may). */
export type Clause = Readonly<Record<number, QState>>;

export const clauseMatches = (sets: readonly number[], cl: Clause) =>
  Object.entries(cl).every(([s, q]) => q === "may" || (q === "must") === sets.includes(+s));

/** A row matches when it matches any clause (OR between clauses). No clauses: nothing matches. */
export const queryMatches = (sets: readonly number[], clauses: readonly Clause[]) => clauses.some((cl) => clauseMatches(sets, cl));

const list = (xs: string[], and: string) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);

/** The clause in plain words: "in A and B, not in C"; "in neither C nor D"; "any combination". */
export function describeClause(cl: Clause, names: readonly string[], order: readonly number[]): string {
  const must = order.filter((s) => cl[s] === "must").map((s) => names[s]);
  const not = order.filter((s) => cl[s] === "not").map((s) => names[s]);
  const parts: string[] = [];
  if (must.length) parts.push(`in ${list(must, "and")}`);
  if (not.length === 1) parts.push(`not in ${not[0]}`);
  else if (not.length === 2) parts.push(`in neither ${not[0]} nor ${not[1]}`);
  else if (not.length > 2) parts.push(`in none of ${list(not, "and")}`);
  return parts.join(", ") || "any combination";
}

export const describeQuery = (clauses: readonly Clause[], names: readonly string[], order: readonly number[]) =>
  clauses.map((cl) => describeClause(cl, names, order)).join(" OR ");

// ---- level of detail (LineUp's collapsed columns) -----------------------------------------------------------------

export type Lod = "full" | "compact" | "minimal";
export type LodSetting = "auto" | Lod;

/** Row heights: Full ≥ 80 px, Compact 12–79 px, Minimal < 12 px (never below ROW_MIN). */
export const FULL_MIN = 80, COMPACT_MIN = 12;
export const ROW_FULL = 86, ROW_COMPACT = 24, ROW_MINIMAL = 9, ROW_MIN = 6;

export const lodOf = (h: number): Lod => (h >= FULL_MIN ? "full" : h >= COMPACT_MIN ? "compact" : "minimal");

/**
 * Row height for a setting. Auto: `nFull` of the `n` rows are always Full (the selected row, the fish-eye focus rows);
 * the others get the largest height (at most Full) at which they fit in the rest of `avail` px, so their level is the
 * largest one at which all rows fit; never below ROW_MIN (Minimal), in which case the rows overflow.
 */
export function rowHeight(setting: LodSetting, n: number, avail: number, nFull = 0): number {
  if (setting === "full") return ROW_FULL;
  if (setting === "compact") return ROW_COMPACT;
  if (setting === "minimal") return ROW_MINIMAL;
  const others = n - nFull;
  if (others <= 0) return ROW_FULL;
  return Math.max(ROW_MIN, Math.min(ROW_FULL, Math.floor((avail - nFull * ROW_FULL) / others)));
}

/** A shown row opened into its pattern rows, or one of those pattern rows. */
const isOpenRow = (e: Extract<Entry, { kind: "row" }>, open: ReadonlySet<string>) => e.parent !== undefined || open.has(e.combo.key);

/**
 * Ids of the shown rows that Auto keeps at Full height: every entry of the selected row (rows repeat across groups)
 * and its pattern rows; every row opened into pattern rows and its pattern rows (so their distributions stay visible);
 * and, with a fish-eye focus, the focus and `radius` shown rows on each side.
 */
export function autoFullRows(
  entries: readonly Entry[], selected: string | null, focus: string | null, open: ReadonlySet<string> = new Set(), radius = FISHEYE_RADIUS,
): Set<string> {
  const out = new Set<string>();
  const shown = entries.filter((e): e is Extract<Entry, { kind: "row" }> => e.kind === "row" && !e.hidden);
  for (const e of shown) if ((selected !== null && (e.combo.key === selected || e.parent === selected)) || isOpenRow(e, open)) out.add(e.id);
  const f = focus === null ? -1 : shown.findIndex((e) => e.id === focus);
  if (f >= 0) for (const e of shown.slice(Math.max(0, f - radius), f + radius + 1)) out.add(e.id);
  return out;
}

/**
 * Height of the rows that are not Full under Auto, computed as if no row were open: pattern rows are left out and
 * `baseFull` holds the Full rows without the open ones (`autoFullRows` without `open`). Opening a row then adds Full
 * rows (the plot scrolls) and leaves the other rows' height unchanged.
 */
export function autoRowHeight(setting: LodSetting, entries: readonly Entry[], avail: number, baseFull: ReadonlySet<string>): number {
  let n = 0, nFull = 0;
  for (const e of entries) {
    if (e.kind !== "row" || e.hidden || e.parent !== undefined) continue;
    n++;
    if (baseFull.has(e.id)) nFull++;
  }
  return rowHeight(setting, n, avail, nFull);
}

// ---- reference element ---------------------------------------------------------------------------------------------

/** "E1: min(A, B) = 0.70": the reference element's label (set names in column order). */
export const referenceLabel = (who: string, setNames: readonly string[], value: number) => `${who}: min(${setNames.join(", ")}) = ${value.toFixed(2)}`;

/**
 * A click on element x's point in row `key`: x becomes the reference element and the row is selected; a click on the
 * reference element's point in the selected row clears the reference (the row stays selected).
 */
export function pickReference(cur: { selected: string | null; refX: number | null }, key: string, x: number): { selected: string; refX: number | null } {
  return cur.refX === x && cur.selected === key ? { selected: key, refX: null } : { selected: key, refX: x };
}

// ---- horizon bars (UpSet's adjustable scale) -----------------------------------------------------------------------

export const MAX_WRAPS = 3;

/**
 * Default range of the bars: the largest single-set count (the largest inclusive row; fixed across modes), widened to
 * the largest group (distinct contributors) and the query, so no bar wraps by default. Null: no groups / no query.
 */
export const defaultBarRange = (maxSingle: number, groupMax: number | null, queryCount: number | null) =>
  Math.max(1, maxSingle, groupMax ?? 0, queryCount ?? 0);

/**
 * A bar of length `v` on an axis of length `range`: if it exceeds the range it wraps around; each wrap is drawn over
 * the previous one (narrower, darker). `wraps` full-range layers lie under the last one, whose length is `remainder`.
 * Beyond MAX_WRAPS wraps, the bar is `broken` (break symbol) and the last layer is drawn full.
 */
export function horizon(v: number, range: number): { wraps: number; remainder: number; broken: boolean } {
  if (!(range > 0) || v <= range) return { wraps: 0, remainder: Math.max(0, v), broken: false };
  const wraps = Math.ceil(v / range - 1e-12) - 1;
  if (wraps > MAX_WRAPS) return { wraps: MAX_WRAPS, remainder: range, broken: true };
  return { wraps, remainder: v - wraps * range, broken: false };
}

// ---- lattice neighbourhood (Furby) ---------------------------------------------------------------------------------

/** |T Δ S|: the number of sets added or removed to go from one combination to the other. */
export function latticeDistance(a: readonly number[], b: readonly number[]): number {
  let n = 0;
  for (const s of a) if (!b.includes(s)) n++;
  for (const s of b) if (!a.includes(s)) n++;
  return n;
}

export const isSuperset = (S: readonly number[], T: readonly number[]) => T.every((s) => S.includes(s));

/** Keys of the rows within `dist` of T (with `supersetsOnly`: only S ⊇ T). */
export function neighbourhood(rows: readonly Combo[], T: readonly number[], dist: number, supersetsOnly: boolean): Set<string> {
  return new Set(rows.filter((c) => latticeDistance(c.sets, T) <= dist && (!supersetsOnly || isSuperset(c.sets, T))).map((c) => c.key));
}

// ---- layout: headers, rows, stubs, fish-eye -------------------------------------------------------------------------

export type HideReason = "collapsed" | "neighbourhood" | "fisheye";

export type Entry =
  | { kind: "header"; id: string; group: Group; depth: number; collapsed: boolean }
  | { kind: "row"; id: string; combo: Combo; hidden: HideReason | null; parent?: string }
  | { kind: "stub"; id: string; count: number; reason: HideReason };

export type Placed =
  | { kind: "header"; id: string; y: number; h: number; group: Group; depth: number; collapsed: boolean }
  | { kind: "row"; id: string; y: number; h: number; combo: Combo; parent?: string }
  | { kind: "stub"; id: string; y: number; h: number; count: number; reason: HideReason };

/** A stub: a 3 px line in a 5 px slot. */
export const STUB_H = 5;

/** Open rows and their pattern rows (lib/patterns.ts), shown right under each open row. */
export type OpenPatterns = { open: ReadonlySet<string>; of: (c: Combo) => readonly Combo[] };

/**
 * The display list: group headers and rows (rows repeat across groups), with rows outside `keep` (the neighbourhood)
 * marked hidden in place; a collapsed group becomes its header plus one stub. An open row is followed by its pattern
 * rows (entries with `parent`, hidden with their row).
 */
export function displayEntries(
  rows: readonly Combo[], groups: Group[] | null, collapsed: ReadonlySet<string>, keep: ((c: Combo) => boolean) | null, patterns: OpenPatterns | null = null,
): Entry[] {
  const out: Entry[] = [];
  const addRows = (rs: readonly Combo[], pre: string) => {
    for (const c of rs) {
      const hidden = keep && !keep(c) ? "neighbourhood" : null;
      out.push({ kind: "row", id: `${pre}${c.key}`, combo: c, hidden });
      if (patterns?.open.has(c.key)) addPatterns(c, pre, hidden, c.key);
    }
  };
  // pattern rows, and the patterns of an open count group under it (patterns.of returns [] below that)
  const addPatterns = (c: Combo, pre: string, hidden: HideReason | null, root: string) => {
    for (const p of patterns!.of(c)) {
      out.push({ kind: "row", id: `${pre}${p.key}`, combo: p, hidden, parent: root });
      if (patterns!.open.has(p.key)) addPatterns(p, pre, hidden, root);
    }
  };
  const addGroup = (g: Group, depth: number) => {
    const isCollapsed = collapsed.has(g.id);
    out.push({ kind: "header", id: `h:${g.id}`, group: g, depth, collapsed: isCollapsed });
    if (isCollapsed) out.push({ kind: "stub", id: `c:${g.id}`, count: g.rows.length, reason: "collapsed" });
    else if (g.children) for (const k of g.children) addGroup(k, depth + 1);
    else addRows(g.rows, `${g.id}|`);
  };
  if (!groups) addRows(rows, "");
  else for (const g of groups) addGroup(g, 0);
  return out;
}

/** Number of row entries that are shown (not hidden), headers, and stubs after merging hidden runs. */
export function countEntries(entries: readonly Entry[]) {
  let rows = 0, headers = 0, stubs = 0;
  let prev: HideReason | null = null;
  for (const e of entries) {
    if (e.kind === "header") (headers++, (prev = null));
    else if (e.kind === "stub") (stubs++, (prev = null));
    else if (e.hidden) {
      if (prev !== e.hidden) stubs++;
      prev = e.hidden;
    } else (rows++, (prev = null));
  }
  return { rows, headers, stubs };
}

export type LayoutOptions = {
  rowH: number;
  headerH: number;
  /** Fish-eye: the focused row's id and the height available; null when off. */
  fisheye: { focus: string | null; avail: number } | null;
  /** Rows on each side of the focus that also get Full height. */
  radius?: number;
  /** Ids of rows that always get Full height (Auto: the selected row and the fish-eye focus rows). */
  full?: ReadonlySet<string>;
};

/** Rows on each side of the fish-eye focus that get Full height. */
export const FISHEYE_RADIUS = 3;

/**
 * Positions of the display list. Consecutive hidden rows (same reason) merge into one stub. Rows in `full` are Full.
 * Fish-eye (when on, with a focus, and when the rows overflow): the focus and `radius` neighbours on each side get Full
 * height; the others share the rest of the height (never below ROW_MIN); if even ROW_MIN does not fit, the rows
 * farthest from the focus become stubs ("fisheye").
 */
export function layout(entries: readonly Entry[], o: LayoutOptions): { items: Placed[]; height: number } {
  const radius = o.radius ?? FISHEYE_RADIUS;
  const full = o.full ?? new Set<string>();
  let list = entries.slice();
  const heights = new Map<string, number>();
  for (const id of full) heights.set(id, ROW_FULL);
  if (o.fisheye && o.fisheye.focus) {
    const c = countEntries(list);
    const shown = list.flatMap((e, i) => (e.kind === "row" && !e.hidden ? [i] : []));
    const nFull = shown.filter((i) => full.has(list[i].id)).length;
    const total = (c.rows - nFull) * o.rowH + nFull * ROW_FULL + c.headers * o.headerH + c.stubs * STUB_H;
    const f = shown.findIndex((i) => list[i].id === o.fisheye!.focus);
    if (f >= 0 && total > o.fisheye.avail) {
      const near = new Set(shown.slice(Math.max(0, f - radius), f + radius + 1));
      for (const i of shown) if (full.has(list[i].id)) near.add(i);
      const others = shown.filter((i) => !near.has(i));
      // room for the other rows: headers, existing stubs and up to two fish-eye stubs per header-separated segment
      const fixed = c.headers * o.headerH + (c.stubs + 2 * (c.headers + 1)) * STUB_H + near.size * ROW_FULL;
      const room = o.fisheye.avail - fixed;
      let h = others.length ? Math.floor(room / others.length) : o.rowH;
      h = Math.min(o.rowH, h);
      if (h < ROW_MIN) {
        const cap = Math.max(0, Math.floor(room / ROW_MIN));
        const rk = new Map(shown.map((i, r) => [i, r]));
        const byDistance = others.slice().sort((a, b) => Math.abs(rk.get(a)! - f) - Math.abs(rk.get(b)! - f));
        const drop = new Set(byDistance.slice(cap));
        list = list.map((e, i) => (drop.has(i) && e.kind === "row" ? { ...e, hidden: "fisheye" as const } : e));
        h = ROW_MIN;
      }
      for (const i of others) heights.set(list[i].id, h);
      for (const i of near) heights.set(list[i].id, ROW_FULL);
    }
  }
  const items: Placed[] = [];
  let y = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.kind === "header") {
      items.push({ ...e, y, h: o.headerH });
      y += o.headerH;
    } else if (e.kind === "stub") {
      items.push({ ...e, y, h: STUB_H });
      y += STUB_H;
    } else if (e.hidden) {
      let n = 0;
      const reason = e.hidden;
      const id = `x:${e.id}`;
      while (i < list.length && list[i].kind === "row" && (list[i] as { hidden: HideReason | null }).hidden === reason) (n++, i++);
      i--;
      items.push({ kind: "stub", id, y, h: STUB_H, count: n, reason });
      y += STUB_H;
    } else {
      const h = heights.get(e.id) ?? o.rowH;
      items.push({ kind: "row", id: e.id, y, h, combo: e.combo, ...(e.parent !== undefined ? { parent: e.parent } : {}) });
      y += h;
    }
  }
  return { items, height: y };
}

export const stubText = (count: number, reason: HideReason) =>
  `${count} ${count === 1 ? "row" : "rows"} hidden: ${reason === "collapsed" ? "group collapsed" : reason === "neighbourhood" ? "outside the neighbourhood" : "fish-eye (far from the focused row)"}`;

// ---- snapshots and rank comparison (LineUp) ------------------------------------------------------------------------

/**
 * Rank change per key between two rankings (arrays of keys, best first): previous rank − new rank, so > 0 means the
 * row moved up. Keys missing on either side are left out.
 */
export function rankChanges(prev: readonly string[], next: readonly string[]): Map<string, number> {
  const before = new Map(prev.map((k, i) => [k, i]));
  const out = new Map<string, number>();
  next.forEach((k, i) => {
    const b = before.get(k);
    if (b !== undefined) out.set(k, b - i);
  });
  return out;
}

/** A snapshot compared with the live ranking: moved up / down / unchanged, and rows missing on either side. */
export function snapshotDiff(snapshot: readonly string[], live: readonly string[]) {
  const delta = rankChanges(snapshot, live);
  const inSnap = new Set(snapshot), inLive = new Set(live);
  return {
    delta,
    up: live.filter((k) => (delta.get(k) ?? 0) > 0),
    down: live.filter((k) => (delta.get(k) ?? 0) < 0),
    same: live.filter((k) => delta.get(k) === 0),
    missingInSnapshot: live.filter((k) => !inSnap.has(k)),
    missingInLive: snapshot.filter((k) => !inLive.has(k)),
  };
}

/** Opacity of the rank-change colour: grows with the number of ranks moved (1 rank: 0.25, 10 or more: 0.7). */
export const rankChangeIntensity = (delta: number) => (delta === 0 ? 0 : Math.min(0.7, 0.2 + 0.05 * Math.abs(delta)));
