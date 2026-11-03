// The fuzzy UpSet's columns at one τ, and which of them are drawn. Definitions in lib/fuzzyUpset.ts.
//
// A column key is its sets ("0,3"). An expanded column's sub-columns have compound keys "<column>|<group>", where the
// group is the near pattern of its observations ("" pure, "5" near set 5, "*mixed", "*other"; see nearGroups).

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

/** Columns to draw: filters (single-set columns, min number of observations), sorted, top `max`; `total` passes the
 *  filters. */
export function visibleColumns(
  rows: Intersection[], o: { showSingle: boolean; minSize: number; sortKey: SortKey; max: number },
): { shown: Intersection[]; total: number } {
  const keep = rows.filter((it) => (o.showSingle || it.labels.length !== 1) && it.n >= o.minSize);
  const score = (it: Intersection) => (o.sortKey === "fuzzy" ? it.fuzzy : it.n);
  return { shown: [...keep].sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key)).slice(0, o.max), total: keep.length };
}
