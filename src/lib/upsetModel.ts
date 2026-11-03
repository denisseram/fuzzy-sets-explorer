// The fuzzy UpSet's columns at one τ, and which of them are drawn. Definitions in lib/fuzzyUpset.ts.
//
// A column key is its sets ("0,3"). An expanded column's sub-columns have compound keys "<column>|<group>", where the
// group is the near pattern of its observations ("" pure, "5" near set 5, "*mixed", "*other"; see nearGroups).
// The columns not drawn individually are pooled by degree (number of sets) into summary columns "*deg:<d>".

import { cellsFor, intersections, membershipSignatures, nearGroups, type Intersection, type NearGroup, type Signatures } from "./fuzzyUpset";

export type SortKey = "fuzzy" | "n";

export type UpsetModel = {
  /** Every column (combination of sets) found, unfiltered. */
  rows: Intersection[];
  /** Each observation's column. */
  sig: Signatures;
  /** Observations of a column, or of a sub-column ("<column>|<group>"). */
  members: (key: string) => number[];
  /** A column's observations split by what they are near (its sub-columns). */
  groups: (key: string) => NearGroup[];
  /** The column observation i is in; null when it reaches τ in no set. */
  keyOf: (i: number) => string | null;
};

/** The column of a column or sub-column key. */
export const parentKey = (key: string) => key.split("|")[0];

/** Summary columns pool the combinations of this many sets or more. */
export const DEG_MAX = 4;
const SUMMARY = "*deg:";
export const summaryKey = (degree: number) => `${SUMMARY}${degree}`;
export const isSummaryKey = (key: string) => key.startsWith(SUMMARY);

/** Columns of memberships P (flat [N * L]) at threshold tau; "near" from nearLevel (default tau / 2) up to tau. */
export function upsetModel(P: ArrayLike<number>, L: number, tau: number, nearLevel = tau / 2): UpsetModel {
  const sig = membershipSignatures(P, L, tau, nearLevel);
  const groups = (key: string) => nearGroups(P, cellsFor(sig, key), L, tau, nearLevel);
  return {
    rows: intersections(sig),
    sig,
    members: (key) => {
      const bar = key.indexOf("|");
      if (bar < 0) return cellsFor(sig, key);
      const g = key.slice(bar + 1);
      return groups(key.slice(0, bar)).find((x) => x.key === g)?.idx ?? [];
    },
    groups,
    keyOf: (i) => (sig.sig[i] >= 0 ? sig.keys[sig.sig[i]] : null),
  };
}

const scoreOf = (sortKey: SortKey) => (it: Intersection) => (sortKey === "fuzzy" ? it.fuzzy : it.n);
const sorted = (rows: Intersection[], sortKey: SortKey) => {
  const score = scoreOf(sortKey);
  return [...rows].sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
};

/**
 * Columns to draw individually: filters (single-set columns, min number of observations), sorted, the largest until
 * they hold `coverage` (0–1, default all) of the observations of the columns passing the single-set filter, at least
 * one and at most `max`. `total` passes both filters; `rest` holds every other column passing the single-set filter
 * (sorted), to be summarised; `covered` is the share of those observations the drawn columns hold.
 */
export function visibleColumns(
  rows: Intersection[], o: { showSingle: boolean; minSize: number; sortKey: SortKey; max: number; coverage?: number },
): { shown: Intersection[]; rest: Intersection[]; total: number; covered: number } {
  const pool = sorted(rows.filter((it) => o.showSingle || it.labels.length !== 1), o.sortKey);
  const nAll = pool.reduce((a, it) => a + it.n, 0);
  const goal = (o.coverage ?? 1) * nAll - 1e-9;
  const shown: Intersection[] = [], rest: Intersection[] = [];
  let total = 0, cum = 0;
  for (const it of pool) {
    const candidate = it.n >= o.minSize;
    if (candidate) total++;
    if (candidate && shown.length < o.max && (shown.length === 0 || cum < goal)) {
      shown.push(it);
      cum += it.n;
    } else rest.push(it);
  }
  return { shown, rest, total, covered: nAll ? cum / nAll : 0 };
}

/** A summary column: the columns of one degree (number of sets; DEG_MAX = that many or more) not drawn individually. */
export type DegreeSummary = {
  key: string;
  degree: number;
  /** Its columns, largest first. */
  combos: Intersection[];
  n: number;
  fuzzy: number;
  nBorder: number;
  /** Per set, the share of the summary's observations whose column contains the set. */
  share: number[];
};

/** The columns `rest` pooled by degree (1, 2, …, DEG_MAX or more sets), lowest degree first; empty degrees omitted. */
export function degreeSummaries(rest: Intersection[], L: number, sortKey: SortKey = "fuzzy"): DegreeSummary[] {
  const byDeg = new Map<number, Intersection[]>();
  for (const it of rest) {
    const d = Math.min(it.labels.length, DEG_MAX);
    if (d === 0) continue;
    let a = byDeg.get(d);
    if (!a) byDeg.set(d, (a = []));
    a.push(it);
  }
  return [...byDeg.keys()].sort((a, b) => a - b).map((degree) => {
    const combos = sorted(byDeg.get(degree)!, sortKey);
    const cnt = new Array(L).fill(0);
    let n = 0, fuzzy = 0, nBorder = 0;
    for (const it of combos) {
      n += it.n;
      fuzzy += it.fuzzy;
      nBorder += it.nBorder;
      for (const l of it.labels) cnt[l] += it.n;
    }
    return { key: summaryKey(degree), degree, combos, n, fuzzy, nBorder, share: cnt.map((c) => c / (n || 1)) };
  });
}
