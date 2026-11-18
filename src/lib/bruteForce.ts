// TEST ORACLE ONLY (imported by *.test.ts, never by the app): the iteration-1 definitions evaluated for every one of
// the 2^|K| − 1 combinations and every element. The app uses additiveCombos / inclusiveCombos instead.

import { combinations, comboKey, componentParts, tauOf, thresholded, type Memberships, type Threshold } from "./fuzzyDecomposition";

export type BruteRow = { sets: number[]; key: string; inclusive: { mass: number; contributors: number[] }; additive: { mass: number; contributors: number[] } };

/** Both modes for every combination of K by direct evaluation of the definitions (O(N · 2^|K| · |K|)). */
export function bruteForceRows(d: Memberships, K: readonly number[], th: Threshold | number | null = null): BruteRow[] {
  const combos = combinations(K);
  const rows: BruteRow[] = combos.map((T) => ({
    sets: [...T].sort((a, b) => a - b), key: comboKey(T), inclusive: { mass: 0, contributors: [] }, additive: { mass: 0, contributors: [] },
  }));
  const v = new Float64Array(d.L);
  for (let x = 0; x < d.N; x++) {
    for (const i of K) v[i] = thresholded(d.P[x * d.L + i], tauOf(th, i));
    combos.forEach((T, c) => {
      const { inside, component } = componentParts(v, T, K);
      if (inside > 0) (rows[c].inclusive.mass += inside), rows[c].inclusive.contributors.push(x);
      if (component > 0) (rows[c].additive.mass += component), rows[c].additive.contributors.push(x);
    });
  }
  return rows;
}
