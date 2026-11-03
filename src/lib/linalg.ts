// Eigendecomposition of a small symmetric matrix (cyclic Jacobi), for the PCA map of datasets that ship no map.

export type EigenDecomp = { values: number[]; vectors: number[][] };

/** Cyclic Jacobi eigenvalue algorithm for a symmetric n×n matrix. */
export function jacobi(Ain: number[][], n: number): EigenDecomp {
  const A = Ain.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return {
    values: idx.map((i) => A[i][i]),
    vectors: idx.map((i) => V.map((r) => r[i])),
  };
}
