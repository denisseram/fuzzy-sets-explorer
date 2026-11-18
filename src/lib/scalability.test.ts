import { describe, expect, it } from "vitest";
import { bruteForceRows } from "./bruteForce";
import {
  additiveCombos, aggregate, combinations, emptyCombos, fuzzyJaccard, inclusiveCombos, jaccardMatrix, maxNonzeroDegree, rowDetail,
  sigmaCounts, similarityOrder, upsetRows, validateMemberships, type Combo, type Memberships, type Threshold,
} from "./fuzzyDecomposition";
import {
  applyFilters, clauseMatches, describeClause, describeQuery, displayEntries, groupRows, horizon, latticeDistance, layout, lodOf,
  neighbourhood, queryMatches, rankChanges, rowHeight, ROW_FULL, ROW_MIN, snapshotDiff, sortRows, STUB_H,
} from "./upsetView";

const A = 0, B = 1, C = 2, D = 3;
const NAMES = ["A", "B", "C", "D", "E", "F"];

function data(rows: readonly (readonly [string, ...number[]])[]): Memberships {
  const L = rows[0].length - 1;
  return validateMemberships(rows.map((r) => r[0]), rows.flatMap((r) => r.slice(1) as number[]), L).data;
}
const FIXTURE = [["E1", 0.8, 0.7, 0.5], ["E2", 0.2, 0.9, 0.4], ["E3", 0.0, 0.0, 0.0], ["E4", 0.6, 0.6, 0.0]] as const;
const fx = data(FIXTURE);
const K3 = [A, B, C];

let seed = 20261118;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
/** Values from {0, 0.5, 1, random}: many zeros, ones and ties. */
const value = () => {
  const r = rnd();
  return r < 0.3 ? 0 : r < 0.45 ? 0.5 : r < 0.6 ? 1 : Math.round(rnd() * 20) / 20;
};
function randomData(n: number, L: number): Memberships {
  return data(Array.from({ length: n }, (_, x) => [`x${x}`, ...Array.from({ length: L }, value)] as [string, ...number[]]));
}
const randomTau = () => Math.round((0.05 + rnd() * 0.9) / 0.05) * 0.05;

/** Compares a fast result with the oracle: same nonzero keys, masses within 1e-9, identical contributor ID sets. */
function expectSame(fast: readonly Combo[], oracle: Map<string, { mass: number; contributors: number[] }>, d: Memberships, what: string) {
  const want = [...oracle].filter(([, r]) => r.mass > 0);
  expect(fast.map((c) => c.key).sort(), what).toEqual(want.map(([k]) => k).sort());
  for (const c of fast) {
    const r = oracle.get(c.key)!;
    expect(Math.abs(c.mass - r.mass), `${what} ${c.key}`).toBeLessThan(1e-9);
    expect(c.contributors.map((x) => d.ids[x]), `${what} ${c.key}`).toEqual(r.contributors.map((x) => d.ids[x]));
  }
}

describe("per-element chains and Apriori vs brute force (1,000 random datasets, |K| ≤ 6)", () => {
  it("additive and inclusive rows match the definitions, with and without τ, with per-set τ", () => {
    for (let t = 0; t < 1000; t++) {
      const L = 1 + (t % 6);
      const d = randomData(1 + Math.floor(rnd() * 25), L);
      const K = Array.from({ length: L }, (_, i) => i).filter(() => rnd() < 0.85);
      if (!K.length) K.push(0);
      const kind = t % 3;
      const th: Threshold | null = kind === 0 ? null : { tau: randomTau(), beta: 0.5, share: 0.2, perSet: kind === 2 ? Array.from({ length: L }, randomTau) : null };
      const brute = bruteForceRows(d, K, th);
      expectSame(additiveCombos(d, K, th), new Map(brute.map((r) => [r.key, r.additive])), d, `additive #${t}`);
      expectSame(inclusiveCombos(d, K, th).combos, new Map(brute.map((r) => [r.key, r.inclusive])), d, `inclusive #${t}`);
    }
  });
  it("binary data: crisp exclusive (additive) and inclusive intersections", () => {
    const d = data([["a", 1, 0, 1], ["b", 1, 1, 1], ["c", 0, 1, 0], ["d", 0, 0, 0], ["e", 1, 0, 1]]);
    const add = new Map(additiveCombos(d, K3).map((c) => [c.key, c]));
    expect([...add.keys()].sort()).toEqual(["0,1,2", "0,2", "1"]);
    expect(add.get("0,2")!.mass).toBe(2);
    const inc = new Map(inclusiveCombos(d, K3).combos.map((c) => [c.key, c]));
    expect(inc.get("0")!.mass).toBe(3);
    expect(inc.get("0,2")!.contributors.map((x) => d.ids[x])).toEqual(["a", "b", "e"]);
  });
  it("ties enter the same chain level; zeros and ones", () => {
    const d = data([["t", 0.6, 0.6, 0], ["o", 1, 1, 1], ["z", 0, 0, 0], ["s", 1, 0.5, 0.5]]);
    const add = new Map(additiveCombos(d, K3).map((c) => [c.key, c]));
    expect(add.get("0,1")!.contributors.map((x) => d.ids[x])).toEqual(["t"]);
    expect(add.has("0")).toBe(true); // s: {A} with 1 − 0.5
    expect(add.get("0")!.contributors.map((x) => d.ids[x])).toEqual(["s"]);
    expect(add.get("0,1,2")!.mass).toBeCloseTo(1 + 0.5, 12); // o: 1; s: 0.5
    expect(add.has("1")).toBe(false);
  });
  it("the fixture: C and AC are absent in additive mode (empty rows hidden)", () => {
    const keys = additiveCombos(fx, K3).map((c) => c.key);
    expect(keys).not.toContain("2");
    expect(keys).not.toContain("0,2");
    expect(keys).toEqual(["0", "1", "0,1", "1,2", "0,1,2"]);
    expect(emptyCombos(K3, additiveCombos(fx, K3)).map((c) => c.key)).toEqual(["2", "0,2"]);
  });
});

describe("Apriori pruning", () => {
  const d = randomData(60, 6);
  const K = [0, 1, 2, 3, 4, 5];
  const brute = bruteForceRows(d, K);
  it("minMass keeps exactly the rows with mass ≥ minMass (anti-monotone, so pruning loses nothing)", () => {
    for (const minMass of [0, 0.5, 2, 5, 10, 20]) {
      const got = inclusiveCombos(d, K, null, { minMass }).combos;
      const want = brute.filter((r) => r.inclusive.mass > 0 && r.inclusive.mass >= minMass - 1e-9).map((r) => r.key).sort();
      expect(got.map((c) => c.key).sort(), `minMass ${minMass}`).toEqual(want);
    }
  });
  it("maximum degree stops the enumeration", () => {
    for (const maxDegree of [1, 2, 3]) {
      const got = inclusiveCombos(d, K, null, { maxDegree }).combos;
      expect(Math.max(...got.map((c) => c.sets.length))).toBeLessThanOrEqual(maxDegree);
      const want = brute.filter((r) => r.inclusive.mass > 0 && r.sets.length <= maxDegree).map((r) => r.key).sort();
      expect(got.map((c) => c.key).sort()).toEqual(want);
    }
  });
  it("the row budget stops before a whole degree and says where", () => {
    const r = inclusiveCombos(d, K, null, { budget: 10 });
    expect(r.stoppedAt).toBe(2);
    expect(r.combos.every((c) => c.sets.length === 1)).toBe(true);
    expect(r.stoppedCandidates).toBeGreaterThan(4);
    const full = inclusiveCombos(d, K, null);
    expect(full.stoppedAt).toBeNull();
    expect(full.maxDegree).toBe(maxNonzeroDegree(d, K, null));
  });
  it("the maximum nonzero degree is the largest number of positive memberships of one element", () => {
    expect(maxNonzeroDegree(fx, K3, null)).toBe(3);
    expect(maxNonzeroDegree(fx, K3, 0.6)).toBe(2);
    expect(Math.max(...additiveCombos(fx, K3, 0.6).map((c) => c.sets.length))).toBe(2);
  });
});

describe("groups", () => {
  const add = additiveCombos(fx, K3);
  const inc = inclusiveCombos(fx, K3).combos;
  const order = [A, B, C];
  it("group masses are sums; contributors are distinct elements", () => {
    const g = groupRows(sortRows(inc, "degree", order), "set", order, NAMES)!;
    const a = g.find((x) => x.id === "s0")!;
    expect(a.rows.map((c) => c.key)).toEqual(["0", "0,1", "0,2", "0,1,2"]);
    const s = aggregate(a.rows, fx.N);
    expect(s.mass).toBeCloseTo(1.6 + 1.5 + 0.7 + 0.7, 9);
    expect(s.contributors).toBe(3); // E1, E2, E4 (not 3 + 3 + 2 + 2)
    expect(s.rows).toBe(4);
  });
  it("by degree, by pairs (with 'One set'), set → pairs (nested); fixed group order", () => {
    expect(groupRows(add, "degree", order, NAMES)!.map((g) => g.label)).toEqual(["Degree 1", "Degree 2", "Degree 3"]);
    expect(groupRows(add, "pairs", order, NAMES)!.map((g) => g.label)).toEqual(["A, B", "A, C", "B, C", "One set"]);
    const nested = groupRows(add, "setPairs", [C, B, A], NAMES)!;
    expect(nested.map((g) => g.label)).toEqual(["Contains C", "Contains B", "Contains A"]);
    expect(nested[1].children!.map((g) => g.label)).toEqual(["C, B", "B, A", "B only"]);
    expect(groupRows(add, "none", order, NAMES)).toBeNull();
  });
  it("additive pair group {A, B} has mass inclusiveMass(A ∩ B): the reconstruction identity", () => {
    const pairsAB = groupRows(add, "pairs", order, NAMES)!.find((g) => g.label === "A, B")!;
    expect(aggregate(pairsAB.rows, fx.N).mass).toBeCloseTo(1.5, 9);
    for (let t = 0; t < 50; t++) {
      const d = randomData(30, 5);
      const K = [0, 1, 2, 3, 4];
      const th = t % 2 ? { tau: randomTau(), beta: 0.5, share: 0.2, perSet: Array.from({ length: 5 }, randomTau) } : null;
      const a = additiveCombos(d, K, th);
      const incMass = new Map(inclusiveCombos(d, K, th).combos.map((c) => [c.key, c.mass]));
      for (const g of groupRows(a, "pairs", K, NAMES)!)
        if (g.sets) expect(Math.abs(aggregate(g.rows, d.N).mass - (incMass.get(g.sets.slice().sort().join(",")) ?? 0))).toBeLessThan(1e-9);
    }
  });
});

describe("filters and sorting", () => {
  const rows: Combo[] = [
    { sets: [0], key: "0", mass: 2, contributors: [0, 1, 2, 3] },
    { sets: [1], key: "1", mass: 0.5, contributors: [1] },
    { sets: [0, 1], key: "0,1", mass: 1.5, contributors: [0, 1] },
    { sets: [0, 2], key: "0,2", mass: 0, contributors: [] },
    { sets: [1, 2], key: "1,2", mass: 1.5, contributors: [0, 2, 3] },
  ];
  it("degree range, minimum mass, minimum contributors; empty rows only on request", () => {
    const f = { minDegree: 1, maxDegree: 9, minMass: 0, minContributors: 1 };
    expect(applyFilters(rows, f).map((c) => c.key)).toEqual(["0", "1", "0,1", "1,2"]);
    expect(applyFilters(rows, f, true).map((c) => c.key)).toEqual(["0", "1", "0,1", "0,2", "1,2"]);
    expect(applyFilters(rows, { ...f, minDegree: 2 }).map((c) => c.key)).toEqual(["0,1", "1,2"]);
    expect(applyFilters(rows, { ...f, minMass: 1.5 }).map((c) => c.key)).toEqual(["0", "0,1", "1,2"]);
    expect(applyFilters(rows, { ...f, minContributors: 3 }).map((c) => c.key)).toEqual(["0", "1,2"]);
  });
  it("degree (ties by column order), mass, contributors, mean", () => {
    expect(sortRows(rows, "degree", [0, 1, 2]).map((c) => c.key)).toEqual(["0", "1", "0,1", "0,2", "1,2"]);
    expect(sortRows(rows, "degree", [2, 1, 0]).map((c) => c.key)).toEqual(["1", "0", "1,2", "0,2", "0,1"]);
    expect(sortRows(rows, "mass", [0, 1, 2]).map((c) => c.key)).toEqual(["0", "0,1", "1,2", "1", "0,2"]);
    expect(sortRows(rows, "contributors", [0, 1, 2]).map((c) => c.key)).toEqual(["0", "1,2", "0,1", "1", "0,2"]);
    expect(sortRows(rows, "mean", [0, 1, 2]).map((c) => c.key)).toEqual(["0,1", "0", "1", "1,2", "0,2"]);
  });
});

describe("queries", () => {
  it("must / may / not with OR between clauses", () => {
    const cl = { [A]: "must", [B]: "must", [C]: "not" } as const;
    expect(clauseMatches([A, B], cl)).toBe(true);
    expect(clauseMatches([A, B, D], cl)).toBe(true); // D: may
    expect(clauseMatches([A, B, C], cl)).toBe(false);
    expect(clauseMatches([A], cl)).toBe(false);
    expect(queryMatches([C], [cl, { [C]: "must", [A]: "not" }])).toBe(true);
    expect(queryMatches([A, C], [cl, { [C]: "must", [A]: "not" }])).toBe(false);
    expect(queryMatches([A], [])).toBe(false);
    expect(queryMatches([A], [{}])).toBe(true);
  });
  it("plain words", () => {
    expect(describeClause({ [A]: "must", [B]: "must", [C]: "not" }, NAMES, [A, B, C])).toBe("in A and B, not in C");
    expect(describeClause({ [C]: "not", [D]: "not" }, NAMES, [A, B, C, D])).toBe("in neither C nor D");
    expect(describeClause({ [A]: "may" }, NAMES, [A, B])).toBe("any combination");
    expect(describeQuery([{ [A]: "must" }, { [B]: "must", [C]: "must", [D]: "must" }], NAMES, [A, B, C, D])).toBe("in A OR in B, C and D");
  });
});

describe("level of detail", () => {
  it("from row height: Full ≥ 28, Compact 12–27, Minimal < 12", () => {
    expect([30, 28, 27, 12, 11, 6].map(lodOf)).toEqual(["full", "full", "compact", "compact", "minimal", "minimal"]);
  });
  it("Auto: the largest height at which every row fits, at most Full, never below Minimal", () => {
    expect(rowHeight("auto", 10, 600)).toBe(ROW_FULL);
    expect(lodOf(rowHeight("auto", 21, 600))).toBe("full"); // 28 px
    expect(lodOf(rowHeight("auto", 22, 600))).toBe("compact"); // 27 px
    expect(lodOf(rowHeight("auto", 60, 600))).toBe("minimal"); // 10 px
    expect(rowHeight("auto", 1000, 600)).toBe(ROW_MIN);
    expect(lodOf(rowHeight("compact", 1, 600))).toBe("compact");
    expect(lodOf(rowHeight("minimal", 1, 600))).toBe("minimal");
    expect(lodOf(rowHeight("full", 1000, 600))).toBe("full");
  });
});

describe("horizon bars", () => {
  it("wrap count and remainder; a break beyond 3 wraps", () => {
    expect(horizon(40, 100)).toEqual({ wraps: 0, remainder: 40, broken: false });
    expect(horizon(100, 100)).toEqual({ wraps: 0, remainder: 100, broken: false });
    expect(horizon(150, 100)).toEqual({ wraps: 1, remainder: 50, broken: false });
    expect(horizon(200, 100)).toEqual({ wraps: 1, remainder: 100, broken: false });
    expect(horizon(250, 100)).toEqual({ wraps: 2, remainder: 50, broken: false });
    expect(horizon(400, 100)).toEqual({ wraps: 3, remainder: 100, broken: false });
    expect(horizon(401, 100)).toEqual({ wraps: 3, remainder: 100, broken: true });
  });
});

describe("lattice neighbourhood", () => {
  const rows = combinations([A, B, C, D]).map((T) => ({ sets: T, key: T.join(","), mass: 1, contributors: [0] }));
  it("distance is |T Δ S|", () => {
    expect(latticeDistance([A, B], [A, B])).toBe(0);
    expect(latticeDistance([A, B], [A, B, C])).toBe(1);
    expect(latticeDistance([A, B], [A, C])).toBe(2);
    expect(latticeDistance([A], [B, C, D])).toBe(4);
  });
  it("rows within the distance; supersets only", () => {
    expect([...neighbourhood(rows, [A, B], 1, false)].sort()).toEqual(["0", "0,1", "0,1,2", "0,1,3", "1"]);
    expect([...neighbourhood(rows, [A, B], 1, true)].sort()).toEqual(["0,1", "0,1,2", "0,1,3"]);
    expect([...neighbourhood(rows, [A, B], 2, true)].sort()).toEqual(["0,1", "0,1,2", "0,1,2,3", "0,1,3"]);
  });
  it("supersets within any distance hold T's whole inclusive mass in additive mode", () => {
    const d = randomData(40, 4);
    const add = additiveCombos(d, [A, B, C, D]);
    const keep = neighbourhood(add, [A, B], 4, true);
    const inc = inclusiveCombos(d, [A, B, C, D]).combos.find((c) => c.key === "0,1")?.mass ?? 0;
    expect(Math.abs(add.filter((c) => keep.has(c.key)).reduce((s, c) => s + c.mass, 0) - inc)).toBeLessThan(1e-9);
  });
  it("hidden rows become stubs in place (consecutive rows merge); collapsed groups become one stub", () => {
    const keep = neighbourhood(rows, [A], 1, false);
    const entries = displayEntries(rows, null, new Set(), (c) => keep.has(c.key));
    const { items, height } = layout(entries, { rowH: 10, headerH: 18, fisheye: null });
    expect(items.map((p) => (p.kind === "stub" ? `stub ${p.count}` : p.kind === "row" ? p.combo.key : p.id))).toEqual(["0", "stub 3", "0,1", "0,2", "0,3", "stub 8"]);
    expect(height).toBe(4 * 10 + 2 * STUB_H);
    const groups = groupRows(rows, "degree", [A, B, C, D], NAMES)!;
    const col = layout(displayEntries(rows, groups, new Set(["d2"]), null), { rowH: 10, headerH: 18, fisheye: null }).items;
    expect(col.filter((p) => p.kind === "stub").map((p) => (p as { count: number }).count)).toEqual([6]);
  });
  it("fish-eye: the focus and 3 neighbours on each side get Full height; far rows become stubs if needed", () => {
    const entries = displayEntries(rows, null, new Set(), null);
    const id = rows[7].key;
    const out = layout(entries, { rowH: 10, headerH: 18, fisheye: { focus: id, avail: 120 } }).items;
    const full = out.filter((p) => p.kind === "row" && p.h === ROW_FULL).map((p) => (p as { combo: Combo }).combo.key);
    expect(full).toEqual(rows.slice(4, 11).map((c) => c.key));
    expect(out.some((p) => p.kind === "stub" && p.reason === "fisheye")).toBe(true);
    const roomy = layout(entries, { rowH: 10, headerH: 18, fisheye: { focus: id, avail: 1000 } }).items;
    expect(roomy.every((p) => p.kind === "row" && p.h === 10)).toBe(true); // no overflow: no fish-eye
  });
});

describe("set similarity", () => {
  it("fuzzy Jaccard: identical sets 1, disjoint 0, an all-zero set 0", () => {
    const d = data([["a", 0.5, 0.5, 0, 0], ["b", 1, 1, 0, 0], ["c", 0, 0, 0.7, 0]]);
    expect(fuzzyJaccard(d, 0, 1)).toBe(1);
    expect(fuzzyJaccard(d, 0, 2)).toBe(0);
    expect(fuzzyJaccard(d, 3, 3)).toBe(0);
    expect(fuzzyJaccard(d, 0, 3)).toBe(0);
    expect(fuzzyJaccard(fx, A, B)).toBeCloseTo((0.7 + 0.2 + 0.6) / (0.8 + 0.9 + 0.6), 12);
    const J = jaccardMatrix(d);
    expect(J[0 * 4 + 1]).toBe(1);
    expect(J[1 * 4 + 0]).toBe(1);
  });
  it("similarity order on a hand-made example", () => {
    // sigma: A 3, B 1, C 2, D 0.5. J(A, C) = 0.9 > J(A, B); then from C the closest unplaced is D, then B.
    const J: Record<string, number> = { "0,1": 0.2, "0,2": 0.9, "0,3": 0.1, "1,2": 0.1, "1,3": 0.4, "2,3": 0.5 };
    const j = (a: number, b: number) => J[[a, b].sort().join(",")];
    expect(similarityOrder([0, 1, 2, 3], [3, 1, 2, 0.5], j)).toEqual([0, 2, 3, 1]);
    expect(similarityOrder([1, 3], [3, 1, 2, 0.5], j)).toEqual([1, 3]);
    expect(similarityOrder([], [], j)).toEqual([]);
    const d = data([["a", 1, 0.9, 0], ["b", 1, 0.8, 0.1], ["c", 0.1, 0, 1]]);
    expect(similarityOrder([0, 1, 2], sigmaCounts(d), (a, b) => fuzzyJaccard(d, a, b))).toEqual([0, 1, 2]);
  });
});

describe("per-set thresholds", () => {
  it("each set is truncated at its own τ_i; reconstruction and the max identity hold", () => {
    for (let t = 0; t < 100; t++) {
      const d = randomData(40, 4);
      const K = [0, 1, 2, 3];
      const perSet = K.map(randomTau);
      const th: Threshold = { tau: 0.5, beta: 0.5, share: 0.2, perSet };
      const add = additiveCombos(d, K, th);
      const inc = new Map(inclusiveCombos(d, K, th).combos.map((c) => [c.key, c.mass]));
      for (const T of combinations(K)) {
        const rec = add.filter((c) => T.every((i) => c.sets.includes(i))).reduce((s, c) => s + c.mass, 0);
        expect(Math.abs(rec - (inc.get(T.join(",")) ?? 0))).toBeLessThan(1e-9);
      }
      let union = 0;
      for (let x = 0; x < d.N; x++) union += Math.max(...K.map((i) => (d.P[x * 4 + i] >= perSet[i] - 1e-12 ? d.P[x * 4 + i] : 0)));
      expect(Math.abs(add.reduce((s, c) => s + c.mass, 0) - union)).toBeLessThan(1e-9);
    }
  });
  it("rings use β·τ_i to τ_i of the set outside the row", () => {
    // fixture, row B, τ_C = 0.5: E2 has C = 0.4 ≥ 0.25 → ring; with τ_C = 0.9, β = ½: 0.45 ≤ C < 0.9 → E1 (0.5) only
    const rowsB = (perSet: number[]) => {
      const th: Threshold = { tau: 0.5, beta: 0.5, share: 0.2, perSet };
      const b = inclusiveCombos(fx, K3, th).combos.find((c) => c.key === "1")!;
      return rowDetail(fx, b.sets, b.contributors, K3, th).rings;
    };
    expect(rowsB([0.5, 0.5, 0.5]).map((r) => [r.set, r.values])).toEqual([[C, [0.4]]]);
    expect(rowsB([0.5, 0.5, 0.9]).map((r) => [r.set, r.values])).toEqual([[C, [0.5]]]);
    expect(rowsB([0.5, 0.5, 0.95]).find((r) => r.set === A)).toBeUndefined();
  });
  it("one τ for every set equals the per-set form with equal values", () => {
    const one = upsetRows(fx, K3, { tau: 0.5, beta: 0.5, share: 0.2 });
    const per = upsetRows(fx, K3, { tau: 0.9, beta: 0.5, share: 0.2, perSet: [0.5, 0.5, 0.5] });
    expect(per).toEqual(one);
  });
});

describe("snapshots", () => {
  it("rank differences: moved up, moved down, missing on either side", () => {
    const snap = ["a", "b", "c", "d"];
    const live = ["c", "a", "b", "e"];
    const diff = snapshotDiff(snap, live);
    expect(diff.up).toEqual(["c"]);
    expect(diff.down).toEqual(["a", "b"]);
    expect(diff.same).toEqual([]);
    expect(diff.missingInSnapshot).toEqual(["e"]);
    expect(diff.missingInLive).toEqual(["d"]);
    expect(diff.delta.get("c")).toBe(2);
    expect(diff.delta.get("a")).toBe(-1);
    expect(rankChanges(["x", "y"], ["x", "y"]).get("y")).toBe(0);
  });
});
