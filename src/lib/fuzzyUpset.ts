// Fuzzy UpSet: which combinations of sets the observations belong to, and how strongly.
//
// Every observation i has a membership P[i, l] in 0–1 in each set l (given by the dataset; crisp sets are the
// limiting case 0 or 1). Memberships are stored flat, row-major: P[i * L + l].
//   signature of i  = the sets with membership >= tau (none -> NONE)
//   strength of i   = the smallest membership among those sets
//   fuzzy size of an intersection = sum of its observations' strengths (never more than their number)
//   near pattern of i = the sets with nearLevel <= membership < tau ("almost belongs"; default nearLevel = tau / 2)
//   i is borderline when its near pattern is not empty, pure otherwise

export const NONE = -1;

export type Signatures = {
  sig: Int32Array; // per observation: index into keys, or NONE
  strength: Float32Array;
  /** 1 when the observation is near (nearLevel <= membership < tau) at least one set. */
  border: Uint8Array;
  keys: string[]; // sorted set indices joined by ","
  nNone: number;
};

export type Intersection = {
  key: string;
  labels: number[];
  fuzzy: number;
  n: number;
  /** Observations near at least one set outside the intersection (the others are pure). */
  nBorder: number;
};

/** Signatures at threshold tau: an observation belongs to every set with membership >= tau, and is near every set
 *  with nearLevel <= membership < tau. */
export function membershipSignatures(P: ArrayLike<number>, L: number, tau: number, nearLevel = tau / 2): Signatures {
  const N = Math.floor(P.length / L);
  const sig = new Int32Array(N);
  const strength = new Float32Array(N);
  const border = new Uint8Array(N);
  const keys: string[] = [];
  const keyId = new Map<string, number>();
  const labs: number[] = [];
  let nNone = 0;
  for (let i = 0; i < N; i++) {
    labs.length = 0;
    let smin = Infinity;
    for (let l = 0; l < L; l++) {
      const v = P[i * L + l];
      if (v >= tau - 1e-12) {
        labs.push(l);
        if (v < smin) smin = v;
      } else if (v >= nearLevel - 1e-12) border[i] = 1;
    }
    if (!labs.length) {
      sig[i] = NONE;
      nNone++;
      continue;
    }
    strength[i] = smin;
    const key = labs.join(",");
    let id = keyId.get(key);
    if (id === undefined) {
      id = keys.length;
      keyId.set(key, id);
      keys.push(key);
    }
    sig[i] = id;
  }
  return { sig, strength, border, keys, nNone };
}

/** Per set: how many observations reach τ in it (its α-cut, inclusive of every column holding the set), and the sum
 *  of their memberships in it (between τ · n and n). */
export function setSizes(P: ArrayLike<number>, L: number, tau: number): { n: number[]; fuzzy: number[] } {
  const N = Math.floor(P.length / L);
  const n = new Array(L).fill(0), fuzzy = new Array(L).fill(0);
  for (let i = 0; i < N; i++)
    for (let l = 0; l < L; l++) {
      const v = P[i * L + l];
      if (v >= tau - 1e-12) (n[l]++, (fuzzy[l] += v));
    }
  return { n, fuzzy };
}

/** One intersection per signature: its sets, fuzzy size and number of observations. */
export function intersections(s: Signatures): Intersection[] {
  const rows = s.keys.map((key) => ({ key, labels: key === "" ? [] : key.split(",").map(Number), fuzzy: 0, n: 0, nBorder: 0 }));
  for (let i = 0; i < s.sig.length; i++) {
    const id = s.sig[i];
    if (id < 0) continue;
    rows[id].fuzzy += s.strength[i];
    rows[id].n++;
    rows[id].nBorder += s.border[i];
  }
  return rows;
}

/** Observations whose signature is `key`. */
export function cellsFor(s: Signatures, key: string): number[] {
  const id = s.keys.indexOf(key);
  if (id === -1) return [];
  const out: number[] = [];
  for (let i = 0; i < s.sig.length; i++) if (s.sig[i] === id) out.push(i);
  return out;
}

/** Observations whose signature is any of `keys`, in index order. */
export function cellsForKeys(s: Signatures, keys: string[]): number[] {
  const ids = new Set<number>();
  for (const k of keys) {
    const id = s.keys.indexOf(k);
    if (id !== -1) ids.add(id);
  }
  const out: number[] = [];
  if (!ids.size) return out;
  for (let i = 0; i < s.sig.length; i++) if (ids.has(s.sig[i])) out.push(i);
  return out;
}

/** Composition of each intersection by a crisp category (codes < 0 = unknown, not counted), as fractions. */
export function composition(s: Signatures, codes: ArrayLike<number>, L2: number): Map<string, number[]> {
  const K = s.keys.length;
  const cnt = Array.from({ length: K }, () => new Array(L2).fill(0));
  const tot = new Array(K).fill(0);
  for (let i = 0; i < s.sig.length; i++) {
    const id = s.sig[i];
    if (id < 0) continue;
    tot[id]++;
    if (codes[i] >= 0) cnt[id][codes[i]]++;
  }
  const out = new Map<string, number[]>();
  s.keys.forEach((key, id) => out.set(key, cnt[id].map((c) => c / (tot[id] || 1))));
  return out;
}

/** Share of the observations idx in each category of a crisp variable (codes < 0 = unknown, not counted). */
export function fractionsOf(idx: ArrayLike<number>, codes: ArrayLike<number>, L2: number): number[] {
  const cnt = new Array(L2).fill(0);
  for (let c = 0; c < idx.length; c++) if (codes[idx[c]] >= 0) cnt[codes[idx[c]]]++;
  return cnt.map((v) => v / (idx.length || 1));
}

/** The sets observation i is near: nearLevel <= membership < tau. */
export function nearPattern(P: ArrayLike<number>, i: number, L: number, tau: number, nearLevel: number): number[] {
  const out: number[] = [];
  for (let l = 0; l < L; l++) {
    const v = P[i * L + l];
    if (v < tau - 1e-12 && v >= nearLevel - 1e-12) out.push(l);
  }
  return out;
}

/** Per set, the share of the observations idx that are near it (0 when idx is empty). */
export function nearShare(P: ArrayLike<number>, idx: ArrayLike<number>, L: number, tau: number, nearLevel: number): number[] {
  const out = new Array(L).fill(0);
  for (let c = 0; c < idx.length; c++) for (const l of nearPattern(P, idx[c], L, tau, nearLevel)) out[l]++;
  return out.map((v) => v / Math.max(idx.length, 1));
}

/** Observations near this many sets or more are pooled as "mixed". */
export const MIXED_AT = 3;
/** Near patterns with fewer observations than this are pooled as "other". */
export const MIN_GROUP = 2;

export type NearGroup = {
  /** "" pure, "l,m" the sets they are near, "*mixed" or "*other". */
  key: string;
  kind: "pure" | "near" | "mixed" | "other";
  /** The sets every observation of the group is near (empty for pure, mixed and other). */
  near: number[];
  idx: number[];
};

/**
 * The observations idx (one column) split by what they are near: the pure ones, one group per near pattern
 * (largest first), "mixed" (near MIXED_AT sets or more) and "other" (patterns with fewer than MIN_GROUP observations).
 */
export function nearGroups(P: ArrayLike<number>, idx: ArrayLike<number>, L: number, tau: number, nearLevel: number): NearGroup[] {
  const byKey = new Map<string, number[]>();
  const mixed: number[] = [], other: number[] = [];
  for (let c = 0; c < idx.length; c++) {
    const pat = nearPattern(P, idx[c], L, tau, nearLevel);
    if (pat.length >= MIXED_AT) mixed.push(idx[c]);
    else {
      const k = pat.join(",");
      let a = byKey.get(k);
      if (!a) byKey.set(k, (a = []));
      a.push(idx[c]);
    }
  }
  const groups: NearGroup[] = [];
  for (const [k, ids] of byKey) {
    if (k !== "" && ids.length < MIN_GROUP) other.push(...ids);
    else groups.push({ key: k, kind: k === "" ? "pure" : "near", near: k === "" ? [] : k.split(",").map(Number), idx: ids });
  }
  groups.sort((a, b) => (a.kind === "pure" ? -1 : b.kind === "pure" ? 1 : b.idx.length - a.idx.length || a.key.localeCompare(b.key)));
  if (mixed.length) groups.push({ key: "*mixed", kind: "mixed", near: [], idx: mixed });
  if (other.length) groups.push({ key: "*other", kind: "other", near: [], idx: other.sort((a, b) => a - b) });
  return groups;
}

/** Mean membership in each set over the observations idx. */
export function meanOver(P: ArrayLike<number>, idx: ArrayLike<number>, L: number): number[] {
  const out = new Array(L).fill(0);
  for (let c = 0; c < idx.length; c++) for (let l = 0; l < L; l++) out[l] += P[idx[c] * L + l];
  return out.map((v) => v / Math.max(idx.length, 1));
}

/** Each observation's strongest set (its colour on the map); -1 when every membership is 0. */
export function strongestSet(P: ArrayLike<number>, L: number): Int32Array {
  const N = Math.floor(P.length / L);
  const out = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    let bv = 0;
    for (let l = 0; l < L; l++) if (P[i * L + l] > bv) (bv = P[i * L + l]), (out[i] = l);
  }
  return out;
}

/**
 * Median and quartiles of `values` over the observations `idx` (on a log10 scale when `log`), and their mean —
 * always the arithmetic mean of the raw values, returned on the same scale as the median; null when idx is empty.
 */
export function summarise(values: ArrayLike<number>, idx: ArrayLike<number>, log = false): { median: number; q1: number; q3: number; mean: number; n: number } | null {
  const v = Float64Array.from({ length: idx.length }, (_, c) => (log ? Math.log10(values[idx[c]]) : values[idx[c]])).sort();
  const n = v.length;
  if (!n) return null;
  let sum = 0;
  for (let c = 0; c < n; c++) sum += values[idx[c]];
  const q = (p: number) => {
    const h = (n - 1) * p, lo = Math.floor(h);
    return v[lo] + (h - lo) * ((v[lo + 1] ?? v[lo]) - v[lo]);
  };
  return { median: q(0.5), q1: q(0.25), q3: q(0.75), mean: log ? Math.log10(sum / n) : sum / n, n };
}

/** A set outside a column is marked (ringed) when at least `minShare` of the column's observations are near it. */
export const nearMarked = (share: number, minShare = 0.2) => share > 0 && share >= minShare - 1e-9;

/** Radius of the white hole in a ring: the column's mean membership in the set, on 0 → τ, shrinks the hole's area
 *  linearly from `max` (mean 0) to `min` (mean τ or more). */
export const holeRadius = (mean: number, tau: number, min = 1.5, max = 5) => {
  const t = Math.min(1, Math.max(0, tau > 0 ? mean / tau : 1));
  return Math.sqrt(min * min + (max * max - min * min) * (1 - t));
};
