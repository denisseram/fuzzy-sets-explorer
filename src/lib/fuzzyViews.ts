// τ persistence barcode (after persistence barcodes in topological data analysis, and α-cuts of fuzzy sets): sweep
// τ and record, for every combination of sets, how many observations have exactly that combination at each τ. Long
// bars = combinations that survive any reasonable τ; short bars = combinations that exist only around one τ.

/** For each τ in `taus`, every observation's sets = those with membership >= τ; returns the size of each combination per τ. */
export function tauSweep(P: ArrayLike<number>, L: number, taus: number[]): { keys: string[]; count: number[][] } {
  const N = P.length / L;
  const at = new Map<string, number>();
  const count: number[][] = [];
  const labs: number[] = [];
  taus.forEach((tau, t) => {
    for (let i = 0; i < N; i++) {
      labs.length = 0;
      for (let l = 0; l < L; l++) if (P[i * L + l] >= tau - 1e-12) labs.push(l);
      if (!labs.length) continue;
      const key = labs.join(",");
      let k = at.get(key);
      if (k === undefined) {
        k = count.length;
        at.set(key, k);
        count.push(new Array(taus.length).fill(0));
      }
      count[k][t]++;
    }
  });
  const keys = new Array<string>(at.size);
  for (const [key, k] of at) keys[k] = key;
  return { keys, count };
}

/** Evenly spaced τ values from lo to hi (inclusive). */
export const tauGrid = (lo: number, hi: number, steps: number) =>
  Array.from({ length: steps }, (_, s) => lo + ((hi - lo) * s) / (steps - 1));
