// Fuzzy UpSet: inclusive intersections and additive membership contributions.
// Pure and framework-independent; every number the plot shows comes from here (display logic: lib/upsetView.ts).
//
// Elements x have a membership m(x, i) in [0, 1] in every set i. K = the selected sets. Both modes are the crisp
// UpSet integrated over all membership levels α in (0, 1], where at level α, x belongs crisply to {i : m(x, i) ≥ α}:
//
//   inclusive:  inclusiveMembership(x, T) = min_{i∈T} m(x, i)
//               = length of the α range in which x is in every set of T          (crisp inclusive intersection)
//   additive:   component(x, S) = max(0, min_{i∈S} m(x, i) − max_{j∈K\S} m(x, j))   (max over ∅ = 0)
//               = length of the α range in which x's crisp pattern is exactly S    (crisp exclusive intersection)
//
// Identities: inclusiveMembership(x, T) = Σ_{S ⊇ T} component(x, S), and Σ_S component(x, S) = max_{i∈K} m(x, i).
// Threshold mode replaces every membership below τ_i by 0 (m'(x, i) = m(x, i) if m(x, i) ≥ τ_i, else 0; τ_i = τ unless
// per-set thresholds are on) and then applies the same definitions to m'.
//
// Neither mode builds the 2^|K| combinations: additive rows come from per-element chains (additiveCombos), inclusive
// rows from a level-wise enumeration with anti-monotone pruning (inclusiveCombos). The brute-force definitions are
// kept in bruteForce.ts as test oracles.

/** Tolerance when comparing a membership with τ (τ comes from a 0.05-step slider: 0.15000000000000002). */
export const TAU_EPS = 1e-12;
/** Tolerance when comparing a mass with the minimum-mass filter (masses are sums of many values). */
export const MASS_EPS = 1e-9;
/** At most this many sets can be selected. */
export const MAX_SETS = 20;
/** Sets selected by default: the largest by sigma-count. */
export const DEFAULT_SETS = 4;
/** "Show empty rows" is available up to this many selected sets (2^10 − 1 = 1023 rows). */
export const MAX_SETS_EMPTY_ROWS = 10;
/** The inclusive enumeration stops before a degree whose candidates would bring the rows above this number, */
export const ROW_BUDGET = 10_000;
/** or the stored contributor indices (summed over rows) above this number (memory: dense data, many elements). */
export const CELL_BUDGET = 10_000_000;

// ---- input validation --------------------------------------------------------------------------------------------

export type Issue = { index: number; id: string; reason: "invalid membership" | "duplicate identifier"; detail: string };

/** The valid elements as a dense float64 matrix (row-major: P[x * L + i]); `src` maps back to the input rows. */
export type Memberships = { N: number; L: number; P: Float64Array; ids: string[]; src: number[] };

/**
 * The shortest decimal that rounds to the same float32 (float32 0.7 = 0.699999988… → 0.7). Memberships are stored as
 * float32 (fz-1); without this, a stored 0.7 would fall below τ = 0.7 by more than TAU_EPS.
 */
export function float32ToDecimal(v: number): number {
  if (!Number.isFinite(v)) return v;
  const f = Math.fround(v);
  if (f !== v) return v; // not a float32 value: keep it
  for (let p = 1; p <= 9; p++) {
    const d = parseFloat(v.toPrecision(p));
    if (Math.fround(d) === f) return d;
  }
  return v;
}

/**
 * Checks every element before any calculation: a missing, non-numeric, NaN or out-of-range membership (in any set),
 * or an identifier used more than once, is an error. Invalid elements are excluded (never set to 0); every element
 * sharing a duplicated identifier is excluded, since none of them can be told apart.
 */
export function validateMemberships(
  ids: ArrayLike<unknown>, values: ArrayLike<unknown>, L: number, opts: { float32?: boolean } = {},
): { data: Memberships; issues: Issue[] } {
  const n = ids.length;
  const issues: Issue[] = [];
  const bad = new Uint8Array(n);
  const seen = new Map<string, number[]>();
  for (let x = 0; x < n; x++) {
    const id = ids[x];
    const key = typeof id === "string" || typeof id === "number" ? String(id) : "";
    if (key === "") {
      bad[x] = 1;
      issues.push({ index: x, id: `#${x}`, reason: "duplicate identifier", detail: "missing identifier" });
      continue;
    }
    const at = seen.get(key);
    if (at) at.push(x);
    else seen.set(key, [x]);
  }
  for (const [id, rows] of seen)
    if (rows.length > 1)
      for (const x of rows) {
        bad[x] = 1;
        issues.push({ index: x, id, reason: "duplicate identifier", detail: `identifier ${id} is used ${rows.length} times` });
      }
  for (let x = 0; x < n; x++)
    for (let i = 0; i < L; i++) {
      const k = x * L + i;
      const v = k < values.length ? values[k] : undefined;
      let why = "";
      if (v === undefined || v === null) why = "missing";
      else if (typeof v !== "number") why = `not a number (${JSON.stringify(v)})`;
      else if (Number.isNaN(v)) why = "NaN";
      else if (v < 0 || v > 1) why = `${v} is outside [0, 1]`;
      if (why) {
        bad[x] = 1;
        issues.push({ index: x, id: String(ids[x] ?? `#${x}`), reason: "invalid membership", detail: `set ${i}: ${why}` });
        break;
      }
    }
  const src: number[] = [];
  for (let x = 0; x < n; x++) if (!bad[x]) src.push(x);
  const P = new Float64Array(src.length * L);
  src.forEach((x, r) => {
    for (let i = 0; i < L; i++) {
      const v = values[x * L + i] as number;
      P[r * L + i] = opts.float32 ? float32ToDecimal(v) : v;
    }
  });
  return { data: { N: src.length, L, P, ids: src.map((x) => String(ids[x])), src }, issues };
}

/** "3 elements excluded: invalid memberships" (null when nothing was excluded). */
export function issueSummary(issues: Issue[], word = "elements"): string | null {
  if (!issues.length) return null;
  const n = new Set(issues.map((s) => s.index)).size;
  const kinds = [...new Set(issues.map((s) => (s.reason === "invalid membership" ? "invalid memberships" : "duplicate identifiers")))];
  return `${n} ${n === 1 ? word.replace(/s$/, "") : word} excluded: ${kinds.join(", ")}`;
}

// ---- thresholds ----------------------------------------------------------------------------------------------------

export type Threshold = {
  tau: number;
  /** Ring level: memberships from β·τ_i up to τ_i are "below τ but near". */
  beta: number;
  /** A set outside the row gets a ring when at least this share of the row's contributors are near it. */
  share: number;
  /** Per-set thresholds τ_i, indexed by dataset set; null or missing: τ for every set. */
  perSet?: readonly number[] | null;
};

/** τ_i of set i: null without threshold mode; a number is one τ for every set. */
export function tauOf(th: Threshold | number | null, i: number): number | null {
  if (th === null) return null;
  if (typeof th === "number") return th;
  return th.perSet?.[i] ?? th.tau;
}

/** m'(x, i): the membership, or 0 when it is below τ (null τ: unchanged). A membership equal to τ reaches it. */
export const thresholded = (v: number, tau: number | null) => (tau === null || v >= tau - TAU_EPS ? v : 0);

/** m' over the sets K as a dense N × |K| matrix: V[x * |K| + p] = m'(x, K[p]). */
export function truncatedMatrix(d: Memberships, K: readonly number[], th: Threshold | number | null): Float64Array {
  const k = K.length;
  const V = new Float64Array(d.N * k);
  const taus = K.map((i) => tauOf(th, i));
  for (let x = 0; x < d.N; x++) for (let p = 0; p < k; p++) V[x * k + p] = thresholded(d.P[x * d.L + K[p]], taus[p]);
  return V;
}

// ---- per element ---------------------------------------------------------------------------------------------------

/** min over T of the values (values indexed by set). */
export function inclusiveMembership(values: ArrayLike<number>, T: readonly number[]): number {
  let m = Infinity;
  for (const i of T) if (values[i] < m) m = values[i];
  return T.length ? m : 0;
}

/** min over S, max over K \ S (0 when S = K), and the component max(0, inside − outside). */
export function componentParts(values: ArrayLike<number>, S: readonly number[], K: readonly number[]) {
  const inside = inclusiveMembership(values, S);
  let outside = 0;
  for (const j of K) if (!S.includes(j) && values[j] > outside) outside = values[j];
  return { inside, outside, component: Math.max(0, inside - outside) };
}

export const component = (values: ArrayLike<number>, S: readonly number[], K: readonly number[]) => componentParts(values, S, K).component;

// ---- combinations --------------------------------------------------------------------------------------------------

/**
 * Every nonempty combination of K (2^|K| − 1), each as set indices in K's order: by number of sets ascending, then
 * lexicographic by position in K. Used only for "Show empty rows" (|K| ≤ 10) and by the test oracles.
 */
export function combinations(K: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << K.length; mask++) {
    const c: number[] = [];
    for (let p = 0; p < K.length; p++) if (mask & (1 << p)) c.push(p);
    out.push(c);
  }
  out.sort((a, b) => a.length - b.length || lexCompare(a, b));
  return out.map((c) => c.map((p) => K[p]));
}

export function lexCompare(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export const comboKey = (T: readonly number[]) => [...T].sort((a, b) => a - b).join(",");

/** Sigma-count per set: the sum of its memberships. */
export function sigmaCounts(d: Memberships): number[] {
  const s = new Array(d.L).fill(0);
  for (let x = 0; x < d.N; x++) for (let i = 0; i < d.L; i++) s[i] += d.P[x * d.L + i];
  return s;
}

/** The `k` sets with the largest sigma-count (ties: dataset order), in dataset order. */
export function defaultSets(d: Memberships, k = DEFAULT_SETS): number[] {
  const s = sigmaCounts(d);
  return s.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, Math.min(k, d.L)).map(([, i]) => i).sort((a, b) => a - b);
}

/** True when every membership is 0 or 1 (τ then changes nothing). */
export function isCrisp(d: Memberships): boolean {
  for (let k = 0; k < d.P.length; k++) if (d.P[k] !== 0 && d.P[k] !== 1) return false;
  return true;
}

// ---- display binning -----------------------------------------------------------------------------------------------

/** Lower bin edges: [0, 0.2), [0.2, 0.4), [0.4, 0.6), [0.6, 0.8), [0.8, 1.0] (the last bin holds 1.0). */
export const BIN_EDGES = [0, 0.2, 0.4, 0.6, 0.8] as const;
export const N_BINS = BIN_EDGES.length;

/** Bin of a value in [0, 1], by explicit edges (floor(v / 0.2) puts 0.6 in bin 2 and 1.0 in a sixth bin). */
export function binOf(v: number): number {
  for (let b = N_BINS - 1; b > 0; b--) if (v >= BIN_EDGES[b]) return b;
  return 0;
}

export function histogram(values: Iterable<number>): number[] {
  const h = new Array(N_BINS).fill(0);
  for (const v of values) h[binOf(v)]++;
  return h;
}

export const binLabel = (b: number) => `[${BIN_EDGES[b].toFixed(1)}, ${(BIN_EDGES[b] + 0.2).toFixed(1)}${b === N_BINS - 1 ? "]" : ")"}`;

/** Histogram of every membership > 0 of the given sets over all elements (original values). */
export function positiveHistogram(d: Memberships, sets: readonly number[]): number[] {
  const h = new Array(N_BINS).fill(0);
  for (let x = 0; x < d.N; x++)
    for (const i of sets) {
      const v = d.P[x * d.L + i];
      if (v > 0) h[binOf(v)]++;
    }
  return h;
}

// ---- rows without enumerating all combinations ---------------------------------------------------------------------

export type Mode = "inclusive" | "additive";

/** One row: a combination of selected sets with its membership mass and contributors in one mode. */
export type Combo = {
  /** Dataset set indices, ascending. */
  sets: number[];
  key: string;
  mass: number;
  /** Indices (into Memberships) of the elements with a value > 0 in this row, ascending. */
  contributors: number[];
};

/** The minimum-mass rule: minMass = 0 means mass > 0. Anti-monotone, so it can prune the inclusive enumeration. */
export const keepMass = (mass: number, minMass: number) => mass > 0 && mass >= minMass - MASS_EPS;

const ascending = (K: readonly number[]) => [...K].sort((a, b) => a - b);
const setsOfMask = (mask: number, Ks: readonly number[]) => Ks.filter((_, p) => mask & (1 << p));

function sortCombos(out: Combo[]): Combo[] {
  return out.sort((a, b) => a.sets.length - b.sets.length || lexCompare(a.sets, b.sets));
}

/** Largest number of selected sets in which one element has m' > 0: the maximum degree of a nonzero row (both modes). */
export function maxNonzeroDegree(d: Memberships, K: readonly number[], th: Threshold | number | null): number {
  const k = K.length;
  const V = truncatedMatrix(d, K, th);
  let best = 0;
  for (let x = 0; x < d.N; x++) {
    let c = 0;
    for (let p = 0; p < k; p++) if (V[x * k + p] > 0) c++;
    if (c > best) best = c;
  }
  return best;
}

/**
 * Additive rows from per-element chains. For each element, its distinct positive values over K in descending order
 * v1 > v2 > … > vm (v(m+1) = 0) give the nested combinations S_j = {i : m'(x, i) ≥ v_j} with component v_j − v(j+1);
 * every other combination has component 0 (tied sets enter the same S_j). O(|K| log |K|) per element.
 */
export function additiveCombos(d: Memberships, K: readonly number[], th: Threshold | number | null = null): Combo[] {
  const Ks = ascending(K);
  const k = Ks.length;
  const V = truncatedMatrix(d, Ks, th);
  const acc = new Map<number, { mass: number; idx: number[] }>();
  const ord: number[] = [];
  for (let x = 0; x < d.N; x++) {
    const base = x * k;
    ord.length = 0;
    for (let p = 0; p < k; p++) if (V[base + p] > 0) ord.push(p);
    if (!ord.length) continue;
    ord.sort((a, b) => V[base + b] - V[base + a]);
    let mask = 0;
    for (let t = 0; t < ord.length; t++) {
      mask |= 1 << ord[t];
      const v = V[base + ord[t]];
      const next = t + 1 < ord.length ? V[base + ord[t + 1]] : 0;
      if (next < v) {
        let e = acc.get(mask);
        if (!e) acc.set(mask, (e = { mass: 0, idx: [] }));
        e.mass += Math.max(0, v - next); // the same expression as component(): min over S_j minus max outside
        e.idx.push(x);
      }
    }
  }
  const out: Combo[] = [];
  for (const [mask, e] of acc) {
    const sets = setsOfMask(mask, Ks);
    out.push({ sets, key: sets.join(","), mass: e.mass, contributors: e.idx });
  }
  return sortCombos(out);
}

export type EnumOptions = {
  /** Keep rows with mass ≥ minMass (0: mass > 0). Prunes every superset of a dropped row. */
  minMass?: number;
  /** Highest degree to enumerate. */
  maxDegree?: number;
  /** Stop before a degree whose candidates would bring the rows above this number (ROW_BUDGET in the app). */
  budget?: number;
  /** Stop before a degree whose candidates could bring the stored contributors above this number (CELL_BUDGET). */
  cellBudget?: number;
};

export type InclusiveResult = {
  combos: Combo[];
  /** Combinations evaluated with mass > 0, including those dropped by minMass. */
  nonzero: number;
  /** The degree that was not enumerated because of the budget (null: not stopped by the budget). */
  stoppedAt: number | null;
  /** Number of candidates of that degree. */
  stoppedCandidates: number;
  /** The highest degree enumerated (≤ the maximum nonzero degree). */
  maxDegree: number;
};

/**
 * Inclusive rows by level-wise (Apriori) enumeration. inclusiveMass and inclusiveCount are anti-monotone (T ⊆ T' ⇒
 * value(T') ≤ value(T)), so a combination is a candidate only if every subset one set smaller was kept. Level k joins
 * two kept (k−1)-combinations sharing their first k−2 sets; its contributors are the intersection of the parents'
 * contributors and each contributor's value is the smaller of its two parent values (min over the union).
 */
export function inclusiveCombos(d: Memberships, K: readonly number[], th: Threshold | number | null = null, opts: EnumOptions = {}): InclusiveResult {
  const { minMass = 0, budget = Infinity, cellBudget = Infinity } = opts;
  const Ks = ascending(K);
  const k = Ks.length;
  const V = truncatedMatrix(d, Ks, th);
  // no element has m' > 0 in more sets than this, so no higher degree is nonzero
  const maxDegree = Math.min(opts.maxDegree ?? Infinity, maxNonzeroDegree(d, Ks, th));
  let cells = 0;
  type Item = { pos: number[]; mask: number; idx: number[]; vals: number[] };
  const out: Combo[] = [];
  let nonzero = 0;
  const emit = (it: Item, mass: number) => {
    const sets = it.pos.map((p) => Ks[p]);
    out.push({ sets, key: sets.join(","), mass, contributors: it.idx });
    cells += it.idx.length;
  };
  let level: Item[] = [];
  if (maxDegree >= 1)
    for (let p = 0; p < k; p++) {
      const idx: number[] = [], vals: number[] = [];
      let mass = 0;
      for (let x = 0; x < d.N; x++) {
        const v = V[x * k + p];
        if (v > 0) (idx.push(x), vals.push(v), (mass += v));
      }
      if (mass > 0) nonzero++;
      if (keepMass(mass, minMass)) {
        const it = { pos: [p], mask: 1 << p, idx, vals };
        level.push(it);
        emit(it, mass);
      }
    }
  let deg = 1;
  let stoppedAt: number | null = null, stoppedCandidates = 0;
  while (level.length > 1 && deg < maxDegree) {
    const kept = new Set(level.map((it) => it.mask));
    const cands: [Item, Item, number[], number][] = [];
    for (let a = 0; a < level.length; a++)
      for (let b = a + 1; b < level.length; b++) {
        const A = level[a].pos, B = level[b].pos;
        let same = true;
        for (let r = 0; r < deg - 1; r++) if (A[r] !== B[r]) { same = false; break; }
        if (!same) break; // the level is in lexicographic order: the shared prefixes are contiguous
        const last = B[deg - 1];
        const mask = level[a].mask | (1 << last);
        const pos = [...A, last];
        let ok = true;
        for (let r = 0; r < deg - 1 && ok; r++) ok = kept.has(mask & ~(1 << pos[r]));
        if (ok) cands.push([level[a], level[b], pos, mask]);
      }
    if (!cands.length) break;
    let cellsUpTo = cells;
    for (const [P1, P2] of cands) cellsUpTo += Math.min(P1.idx.length, P2.idx.length);
    if (out.length + cands.length > budget || cellsUpTo > cellBudget) {
      stoppedAt = deg + 1;
      stoppedCandidates = cands.length;
      break;
    }
    const next: Item[] = [];
    for (const [P1, P2, pos, mask] of cands) {
      const idx: number[] = [], vals: number[] = [];
      let mass = 0;
      const i1 = P1.idx, i2 = P2.idx;
      for (let u = 0, w = 0; u < i1.length && w < i2.length;) {
        if (i1[u] < i2[w]) u++;
        else if (i1[u] > i2[w]) w++;
        else {
          const v = P1.vals[u] < P2.vals[w] ? P1.vals[u] : P2.vals[w];
          idx.push(i1[u]), vals.push(v), (mass += v);
          u++, w++;
        }
      }
      if (mass > 0) nonzero++;
      if (keepMass(mass, minMass)) {
        const it = { pos, mask, idx, vals };
        next.push(it);
        emit(it, mass);
      }
    }
    level = next;
    deg++;
  }
  return { combos: sortCombos(out), nonzero, stoppedAt, stoppedCandidates, maxDegree: stoppedAt === null ? Math.min(deg, maxDegree) : deg };
}

/** Rows of one mode: chains (additive) or the pruned enumeration (inclusive). */
export function modeCombos(d: Memberships, K: readonly number[], mode: Mode, th: Threshold | null, opts: EnumOptions = {}): InclusiveResult {
  if (mode === "inclusive") return inclusiveCombos(d, K, th, opts);
  const combos = additiveCombos(d, K, th);
  return { combos, nonzero: combos.length, stoppedAt: null, stoppedCandidates: 0, maxDegree: combos.reduce((m, c) => Math.max(m, c.sets.length), 0) };
}

/** Every combination of K not among `combos`, as an empty row (mass 0, no contributors). */
export function emptyCombos(K: readonly number[], combos: readonly Combo[]): Combo[] {
  const have = new Set(combos.map((c) => c.key));
  return combinations(ascending(K)).map((T) => ({ sets: T, key: T.join(","), mass: 0, contributors: [] as number[] })).filter((c) => !have.has(c.key));
}

// ---- row details: histograms and rings -----------------------------------------------------------------------------

export type Ring = {
  set: number;
  /** Contributors with β·τ_i ≤ m < τ_i in the set (original values). */
  values: number[];
  contributors: number;
  mean: number;
  hist: number[];
};

export type RowDetail = {
  /** Per set of the row (same order as `sets`): histogram of the contributors' ORIGINAL memberships. */
  hists: number[][];
  /** Sets outside the row with a ring (threshold mode only). */
  rings: Ring[];
};

/** Display bin of every membership, computed once per dataset (histograms of thousands of rows). */
const binCache = new WeakMap<Memberships, Uint8Array>();
function binsOf(d: Memberships): Uint8Array {
  let B = binCache.get(d);
  if (!B) {
    B = new Uint8Array(d.P.length);
    for (let k = 0; k < d.P.length; k++) B[k] = binOf(d.P[k]);
    binCache.set(d, B);
  }
  return B;
}

/** Histograms (of the contributors' original memberships in each set of the row) and rings of one row. */
export function rowDetail(d: Memberships, sets: readonly number[], contributors: readonly number[], K: readonly number[], th: Threshold | null): RowDetail {
  const B = binsOf(d), L = d.L;
  return {
    hists: sets.map((i) => {
      const h = new Int32Array(N_BINS);
      for (let c = 0; c < contributors.length; c++) h[B[contributors[c] * L + i]]++;
      return Array.from(h);
    }),
    rings: th ? ringsFor(d, sets, K, contributors, th) : [],
  };
}

/** The sets of K outside T where at least `share` of the contributors have β·τ_j ≤ m < τ_j (original memberships). */
export function ringsFor(d: Memberships, T: readonly number[], K: readonly number[], contributors: readonly number[], th: Threshold): Ring[] {
  if (!contributors.length) return [];
  const out: Ring[] = [];
  for (const j of K) {
    if (T.includes(j)) continue;
    const tau = tauOf(th, j)!;
    const lo = th.beta * tau;
    const vals: number[] = [];
    for (const x of contributors) {
      const m = d.P[x * d.L + j];
      if (m >= lo - TAU_EPS && m < tau - TAU_EPS) vals.push(m);
    }
    if (vals.length && vals.length / contributors.length >= th.share - 1e-9)
      out.push({ set: j, values: vals, contributors: contributors.length, mean: vals.reduce((s, m) => s + m, 0) / vals.length, hist: histogram(vals) });
  }
  return out;
}

/** Largest bin count over the given row details (histograms and ring histograms): the shared count scale. */
export function maxBinOf(details: Iterable<RowDetail>): number {
  let m = 0;
  for (const a of details) {
    for (const h of a.hists) for (const c of h) if (c > m) m = c;
    for (const g of a.rings) for (const c of g.hist) if (c > m) m = c;
  }
  return m;
}

// ---- both modes for every combination (iteration-1 interface; small K) -----------------------------------------------

export type RowAgg = { mass: number; contributors: number[] } & RowDetail;
export type Row = { sets: number[]; key: string; inclusive: RowAgg; additive: RowAgg };

/**
 * All 2^|K| − 1 rows for the selected sets K, both modes, in combinations(K) order. Built from the chains and the
 * pruned enumeration (not from the brute-force definitions); histograms show original values.
 */
export function upsetRows(d: Memberships, K: readonly number[], threshold: Threshold | null = null): Row[] {
  const inc = new Map(inclusiveCombos(d, K, threshold).combos.map((c) => [c.key, c]));
  const add = new Map(additiveCombos(d, K, threshold).map((c) => [c.key, c]));
  const agg = (T: number[], c: Combo | undefined): RowAgg => {
    const contributors = c?.contributors ?? [];
    return { mass: c?.mass ?? 0, contributors, ...rowDetail(d, T, contributors, K, threshold) };
  };
  return combinations(K).map((T) => {
    const key = comboKey(T);
    return { sets: T, key, inclusive: agg(T, inc.get(key)), additive: agg(T, add.get(key)) };
  });
}

/** Largest bin count over every histogram (and ring histogram) of the given rows in one mode. */
export function maxBinCount(rows: Row[], mode: Mode): number {
  return maxBinOf(rows.map((r) => r[mode]));
}

/** The selected element's reference in row T: its inclusive minimum (original values), and, for the additive band,
 *  the inside minimum and outside maximum of the values used for the components (thresholded when τ is on). */
export function reference(d: Memberships, x: number, T: readonly number[], K: readonly number[], th: Threshold | number | null) {
  const orig = (i: number) => d.P[x * d.L + i];
  const v = new Float64Array(d.L);
  for (const i of K) v[i] = thresholded(orig(i), tauOf(th, i));
  const parts = componentParts(v, T, K);
  return { value: Math.min(...T.map(orig)), inside: parts.inside, outside: parts.outside, component: parts.component };
}

// ---- aggregates over several rows (group headers, query rows) ------------------------------------------------------

/** Sum of the rows' masses and the number of DISTINCT contributors over the rows (never the sum of their counts). */
export function aggregate(rows: readonly { mass: number; contributors: readonly number[] }[], N: number): { mass: number; contributors: number; rows: number } {
  const seen = new Uint8Array(N);
  let mass = 0, n = 0;
  for (const r of rows) {
    mass += r.mass;
    for (const x of r.contributors) if (!seen[x]) (seen[x] = 1), n++;
  }
  return { mass, contributors: n, rows: rows.length };
}

/** Largest inclusive count of a single set (m' > 0): the largest count of any row in either mode. */
export function maxRowCount(d: Memberships, K: readonly number[], th: Threshold | null): number {
  let best = 0;
  for (const i of K) {
    const t = tauOf(th, i);
    let c = 0;
    for (let x = 0; x < d.N; x++) if (thresholded(d.P[x * d.L + i], t) > 0) c++;
    if (c > best) best = c;
  }
  return best;
}

// ---- set similarity ------------------------------------------------------------------------------------------------

/** Fuzzy Jaccard: Σ min(μA, μB) / Σ max(μA, μB) over all elements (0 when the denominator is 0). */
export function fuzzyJaccard(d: Memberships, a: number, b: number): number {
  let num = 0, den = 0;
  for (let x = 0; x < d.N; x++) {
    const u = d.P[x * d.L + a], v = d.P[x * d.L + b];
    num += u < v ? u : v;
    den += u > v ? u : v;
  }
  return den > 0 ? num / den : 0;
}

/** All pairwise fuzzy Jaccard values, J[a * L + b]. */
export function jaccardMatrix(d: Memberships): Float64Array {
  const J = new Float64Array(d.L * d.L);
  for (let a = 0; a < d.L; a++)
    for (let b = a; b < d.L; b++) {
      const j = fuzzyJaccard(d, a, b);
      J[a * d.L + b] = J[b * d.L + a] = j;
    }
  return J;
}

/**
 * Column order by similarity: start with the set of largest sigma-count, then repeatedly append the unplaced set with
 * the highest J to the last placed set. Ties: the earlier set in `K`.
 */
export function similarityOrder(K: readonly number[], sigma: readonly number[], J: (a: number, b: number) => number): number[] {
  if (!K.length) return [];
  let first = K[0];
  for (const i of K) if (sigma[i] > sigma[first]) first = i;
  const out = [first];
  const left = K.filter((i) => i !== first);
  while (left.length) {
    const last = out[out.length - 1];
    let best = 0;
    for (let c = 1; c < left.length; c++) if (J(last, left[c]) > J(last, left[best])) best = c;
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}
