// Fuzzy UpSet: inclusive intersections and additive membership contributions.
// Pure and framework-independent; every number the plot shows comes from here.
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
// Threshold mode replaces every membership below τ by 0 (m'(x, i) = m(x, i) if m(x, i) ≥ τ, else 0) and then applies
// the same definitions to m'.

/** Tolerance when comparing a membership with τ (τ comes from a 0.05-step slider: 0.15000000000000002). */
export const TAU_EPS = 1e-12;
/** At most this many sets can be selected (2^6 − 1 = 63 rows). */
export const MAX_SETS = 6;
/** Sets selected by default: the largest by sigma-count. */
export const DEFAULT_SETS = 4;

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

// ---- per element ---------------------------------------------------------------------------------------------------

/** m'(x, i): the membership, or 0 when it is below τ (null τ: unchanged). A membership equal to τ reaches it. */
export const thresholded = (v: number, tau: number | null) => (tau === null || v >= tau - TAU_EPS ? v : 0);

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
 * lexicographic by position in K. The order depends only on K, so rows never move with the mode or τ.
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

function lexCompare(a: number[], b: number[]) {
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

// ---- the plot's rows -----------------------------------------------------------------------------------------------

export type Mode = "inclusive" | "additive";

export type Threshold = {
  tau: number;
  /** Ring level: memberships from β·τ up to τ are "below τ but near". */
  beta: number;
  /** A set outside the row gets a ring when at least this share of the row's contributors are near it. */
  share: number;
};

export type Ring = {
  set: number;
  /** Contributors with β·τ ≤ m < τ in the set (original values). */
  values: number[];
  contributors: number;
  mean: number;
  hist: number[];
};

export type RowAgg = {
  mass: number;
  /** Indices (into Memberships) of the elements with a value > 0 in this row, ascending. */
  contributors: number[];
  /** Per set of the row (same order): histogram of the contributors' ORIGINAL memberships. */
  hists: number[][];
  /** Sets outside the row with a ring (threshold mode only). */
  rings: Ring[];
};

export type Row = { sets: number[]; key: string; inclusive: RowAgg; additive: RowAgg };

/**
 * All 2^|K| − 1 rows for the selected sets K, both modes. With `threshold`, memberships below τ are replaced by 0
 * before every calculation (contributors, masses); histograms still show original values.
 */
export function upsetRows(d: Memberships, K: readonly number[], threshold: Threshold | null = null): Row[] {
  const { N, L, P } = d;
  const tau = threshold?.tau ?? null;
  const combos = combinations(K);
  const C = combos.length;
  const incMass = new Float64Array(C), addMass = new Float64Array(C);
  const incIdx: number[][] = combos.map(() => []), addIdx: number[][] = combos.map(() => []);
  const v = new Float64Array(L);
  for (let x = 0; x < N; x++) {
    for (const i of K) v[i] = thresholded(P[x * L + i], tau);
    for (let c = 0; c < C; c++) {
      const T = combos[c];
      const { inside, component: comp } = componentParts(v, T, K);
      if (inside > 0) (incMass[c] += inside), incIdx[c].push(x);
      if (comp > 0) (addMass[c] += comp), addIdx[c].push(x);
    }
  }
  const agg = (T: number[], mass: number, idx: number[]): RowAgg => ({
    mass,
    contributors: idx,
    hists: T.map((i) => histogram(idx.map((x) => P[x * L + i]))),
    rings: threshold ? ringsFor(d, T, K, idx, threshold) : [],
  });
  return combos.map((T, c) => ({ sets: T, key: comboKey(T), inclusive: agg(T, incMass[c], incIdx[c]), additive: agg(T, addMass[c], addIdx[c]) }));
}

/** The sets of K outside T where at least `share` of the contributors have β·τ ≤ m < τ (original memberships). */
export function ringsFor(d: Memberships, T: readonly number[], K: readonly number[], contributors: readonly number[], th: Threshold): Ring[] {
  if (!contributors.length) return [];
  const out: Ring[] = [];
  const lo = th.beta * th.tau;
  for (const j of K) {
    if (T.includes(j)) continue;
    const vals: number[] = [];
    for (const x of contributors) {
      const m = d.P[x * d.L + j];
      if (m >= lo - TAU_EPS && m < th.tau - TAU_EPS) vals.push(m);
    }
    if (vals.length && vals.length / contributors.length >= th.share - 1e-9)
      out.push({ set: j, values: vals, contributors: contributors.length, mean: vals.reduce((s, m) => s + m, 0) / vals.length, hist: histogram(vals) });
  }
  return out;
}

/** The selected element's reference in row T: its inclusive minimum (original values), and, for the additive band,
 *  the inside minimum and outside maximum of the values used for the components (thresholded when τ is on). */
export function reference(d: Memberships, x: number, T: readonly number[], K: readonly number[], tau: number | null) {
  const orig = (i: number) => d.P[x * d.L + i];
  const v = new Float64Array(d.L);
  for (const i of K) v[i] = thresholded(orig(i), tau);
  const parts = componentParts(v, T, K);
  return { value: Math.min(...T.map(orig)), inside: parts.inside, outside: parts.outside, component: parts.component };
}

/** Largest bin count over every histogram (and ring histogram) of the given rows in one mode: the shared count scale. */
export function maxBinCount(rows: Row[], mode: Mode): number {
  let m = 0;
  for (const r of rows) {
    const a = r[mode];
    for (const h of a.hists) for (const c of h) if (c > m) m = c;
    for (const g of a.rings) for (const c of g.hist) if (c > m) m = c;
  }
  return m;
}
