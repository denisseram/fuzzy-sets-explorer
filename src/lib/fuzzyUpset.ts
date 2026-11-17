// Small helpers shared by the loader and the plot.

/** Each observation's strongest set; -1 when every membership is 0. */
export function strongestSet(P: ArrayLike<number>, L: number): Int32Array {
  const N = Math.floor(P.length / L);
  const out = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    let bv = 0;
    for (let l = 0; l < L; l++) if (P[i * L + l] > bv) (bv = P[i * L + l]), (out[i] = l);
  }
  return out;
}

/** Radius of the white hole in a ring: the mean of the below-τ memberships, on 0 → τ, shrinks the hole's area
 *  linearly from `max` (mean 0) to `min` (mean τ or more). */
export const holeRadius = (mean: number, tau: number, min = 1.5, max = 5) => {
  const t = Math.min(1, Math.max(0, tau > 0 ? mean / tau : 1));
  return Math.sqrt(min * min + (max * max - min * min) * (1 - t));
};
