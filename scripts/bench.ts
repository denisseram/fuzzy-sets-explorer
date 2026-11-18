// Benchmark of the row computation (npm run bench; not part of npm test).
// Synthetic soft-clustering output: N = 50,000 elements, |K| = 20 sets, each element with 1–4 positive memberships.
// Targets (iteration 2, section 1e): additive < 300 ms, inclusive with minMass = 0 < 1 s.
import { additiveCombos, CELL_BUDGET, inclusiveCombos, ROW_BUDGET, type Memberships } from "../src/lib/fuzzyDecomposition.ts";

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function sparse(N: number, L: number, seed = 7): Memberships {
  const r = rng(seed);
  const P = new Float64Array(N * L);
  for (let x = 0; x < N; x++) {
    const m = 1 + Math.floor(r() * 4);
    const sets = new Set<number>();
    while (sets.size < m) sets.add(Math.floor(r() * L));
    // soft-clustering-like: one dominant set, smaller weights in the others, rounded to 0.01 (ties occur)
    let first = true;
    for (const i of sets) {
      P[x * L + i] = Math.max(0.01, Math.round((first ? 0.5 + r() * 0.5 : r() * 0.5) * 100) / 100);
      first = false;
    }
  }
  return { N, L, P, ids: Array.from({ length: N }, (_, x) => `x${x}`), src: Array.from({ length: N }, (_, x) => x) };
}

function dense(N: number, L: number, seed = 11): Memberships {
  const r = rng(seed);
  const P = new Float64Array(N * L);
  for (let k = 0; k < P.length; k++) P[k] = Math.max(0.001, r());
  return { N, L, P, ids: Array.from({ length: N }, (_, x) => `x${x}`), src: Array.from({ length: N }, (_, x) => x) };
}

function time<T>(label: string, f: () => T, runs = 7): T {
  let out!: T;
  const ms: number[] = [];
  f(); // warm-up
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    out = f();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  console.log(`${label.padEnd(58)} median ${ms[runs >> 1].toFixed(1).padStart(7)} ms   min ${ms[0].toFixed(1).padStart(7)} ms   max ${ms[runs - 1].toFixed(1).padStart(7)} ms`);
  return out;
}

const N = 50_000, L = 20;
const K = Array.from({ length: L }, (_, i) => i);
console.log(`Node ${process.version}, ${N} elements, |K| = ${L}`);

const d = sparse(N, L);
const add = time("sparse (1–4 positive), additive", () => additiveCombos(d, K, null));
console.log(`  ${add.length} nonzero rows`);
const inc = time("sparse (1–4 positive), inclusive, minMass = 0", () => inclusiveCombos(d, K, null, { budget: ROW_BUDGET, cellBudget: CELL_BUDGET }));
console.log(`  ${inc.combos.length} nonzero rows, stopped at degree ${inc.stoppedAt ?? "—"}`);
time("sparse, additive, threshold τ = 0.3", () => additiveCombos(d, K, 0.3));
time("sparse, inclusive, threshold τ = 0.3", () => inclusiveCombos(d, K, 0.3, { budget: ROW_BUDGET, cellBudget: CELL_BUDGET }));

const D = dense(N, L);
const dinc = time("dense (all positive), inclusive, minMass = 0, row budget", () => inclusiveCombos(D, K, null, { budget: ROW_BUDGET, cellBudget: CELL_BUDGET }), 3);
console.log(`  ${dinc.combos.length} rows, stopped at degree ${dinc.stoppedAt ?? "—"} (${dinc.stoppedCandidates} candidates)`);
time("dense (all positive), additive", () => additiveCombos(D, K, null), 3);
