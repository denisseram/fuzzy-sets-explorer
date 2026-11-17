import { describe, expect, it } from "vitest";
import {
  binOf, combinations, component, defaultSets, float32ToDecimal, histogram, inclusiveMembership, issueSummary, maxBinCount,
  reference, thresholded, upsetRows, validateMemberships, type Memberships, type Row, type Threshold,
} from "./fuzzyDecomposition";

const A = 0, B = 1, C = 2;
const NAMES = ["A", "B", "C"];
/** The correctness fixture (also bundled as public/data/fixture). */
const FIXTURE = [
  ["E1", 0.8, 0.7, 0.5],
  ["E2", 0.2, 0.9, 0.4],
  ["E3", 0.0, 0.0, 0.0],
  ["E4", 0.6, 0.6, 0.0],
] as const;

function data(rows: readonly (readonly [string, ...number[]])[]): Memberships {
  const L = rows[0].length - 1;
  return validateMemberships(rows.map((r) => r[0]), rows.flatMap((r) => r.slice(1) as number[]), L).data;
}
const fx = data(FIXTURE);
const K = [A, B, C];
const name = (T: number[]) => T.map((i) => NAMES[i]).join("");
const byName = (rows: Row[]) => new Map(rows.map((r) => [name(r.sets), r]));
const ids = (d: Memberships, idx: number[]) => idx.map((x) => d.ids[x]);
const TH: Threshold = { tau: 0.5, beta: 0.5, share: 0.2 };

/** Every superset of T within K. */
const supersets = (T: number[], all: number[][]) => all.filter((S) => T.every((i) => S.includes(i)));

describe("fixture without threshold", () => {
  const rows = byName(upsetRows(fx, K));
  it("component masses and contributors", () => {
    const want: Record<string, [number, string[]]> = {
      A: [0.1, ["E1"]], B: [0.5, ["E2"]], C: [0, []], AB: [0.8, ["E1", "E4"]], AC: [0, []], BC: [0.2, ["E2"]], ABC: [0.7, ["E1", "E2"]],
    };
    for (const [k, [m, who]] of Object.entries(want)) {
      expect(rows.get(k)!.additive.mass, k).toBeCloseTo(m, 9);
      expect(ids(fx, rows.get(k)!.additive.contributors), k).toEqual(who);
    }
  });
  it("inclusive A ∩ B: mass, contributors, histograms", () => {
    const ab = rows.get("AB")!.inclusive;
    expect(ab.mass).toBeCloseTo(1.5, 9);
    expect(ids(fx, ab.contributors)).toEqual(["E1", "E2", "E4"]);
    expect(ab.contributors.map((x) => fx.P[x * 3 + A])).toEqual([0.8, 0.2, 0.6]);
    expect(ab.contributors.map((x) => fx.P[x * 3 + B])).toEqual([0.7, 0.9, 0.6]);
    expect(ab.hists[0]).toEqual([0, 1, 0, 1, 1]); // A: [0.2,0.4) 1, [0.6,0.8) 1, [0.8,1.0] 1
    expect(ab.rings).toEqual([]);
  });
  it("additive AB: histograms of original values, E1's band from 0.5 to 0.7", () => {
    const ab = rows.get("AB")!.additive;
    expect(ab.contributors.map((x) => fx.P[x * 3 + A])).toEqual([0.8, 0.6]);
    expect(ab.contributors.map((x) => fx.P[x * 3 + B])).toEqual([0.7, 0.6]);
    const r = reference(fx, 0, [A, B], K, null);
    expect(r.value).toBe(0.7);
    expect(r.inside).toBe(0.7);
    expect(r.outside).toBe(0.5);
    expect(r.component).toBeCloseTo(0.2, 12);
  });
  it("reference line: E1 in A ∩ B at 0.7", () => {
    expect(reference(fx, 0, [A, B], K, null).value).toBe(0.7);
  });
});

describe("fixture with threshold τ = 0.5, β = ½, share 20 %", () => {
  const rows = byName(upsetRows(fx, K, TH));
  it("inclusive masses and contributors", () => {
    const want: Record<string, [number, string[]]> = {
      A: [1.4, ["E1", "E4"]], B: [2.2, ["E1", "E2", "E4"]], C: [0.5, ["E1"]], AB: [1.3, ["E1", "E4"]],
      AC: [0.5, ["E1"]], BC: [0.5, ["E1"]], ABC: [0.5, ["E1"]],
    };
    for (const [k, [m, who]] of Object.entries(want)) {
      expect(rows.get(k)!.inclusive.mass, k).toBeCloseTo(m, 9);
      expect(ids(fx, rows.get(k)!.inclusive.contributors), k).toEqual(who);
    }
  });
  it("additive masses and contributors", () => {
    const want: Record<string, [number, string[]]> = {
      A: [0.1, ["E1"]], B: [0.9, ["E2"]], C: [0, []], AB: [0.8, ["E1", "E4"]], AC: [0, []], BC: [0, []], ABC: [0.5, ["E1"]],
    };
    for (const [k, [m, who]] of Object.entries(want)) {
      expect(rows.get(k)!.additive.mass, k).toBeCloseTo(m, 9);
      expect(ids(fx, rows.get(k)!.additive.contributors), k).toEqual(who);
    }
  });
  it("rings: only row B rings set C, in both modes", () => {
    for (const mode of ["inclusive", "additive"] as const)
      for (const [k, r] of rows) {
        const sets = r[mode].rings.map((g) => NAMES[g.set]);
        expect(sets, `${mode} ${k}`).toEqual(k === "B" ? ["C"] : []);
      }
    const inc = rows.get("B")!.inclusive.rings[0];
    expect(inc.values).toEqual([0.4]);
    expect(inc.contributors).toBe(3);
    expect(inc.mean).toBeCloseTo(0.4, 12);
    expect(inc.hist).toEqual([0, 0, 1, 0, 0]);
    expect(rows.get("B")!.additive.rings[0].contributors).toBe(1);
  });
  it("histograms keep original values; the reference stays the original minimum", () => {
    expect(rows.get("AB")!.inclusive.hists[0]).toEqual([0, 0, 0, 1, 1]);
    const r = reference(fx, 0, [A, B], K, 0.5);
    expect(r.value).toBe(0.7);
    expect(r.outside).toBe(0.5); // E1's C = 0.5 reaches τ
  });
});

describe("identities", () => {
  const check = (d: Memberships, Ks: number[], tau: number | null) => {
    const all = combinations(Ks);
    const rows = upsetRows(d, Ks, tau === null ? null : { tau, beta: 0.5, share: 0.2 });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const v = new Float64Array(d.L);
    for (let x = 0; x < d.N; x++) {
      for (const i of Ks) v[i] = thresholded(d.P[x * d.L + i], tau);
      let sum = 0;
      for (const S of all) sum += component(v, S, Ks);
      expect(sum).toBeCloseTo(Math.max(...Ks.map((i) => v[i])), 9);
      for (const T of all) {
        const rec = supersets(T, all).reduce((s, S) => s + component(v, S, Ks), 0);
        expect(Math.abs(rec - inclusiveMembership(v, T))).toBeLessThan(1e-9);
      }
    }
    for (const T of all) {
      const rec = supersets(T, all).reduce((s, S) => s + byKey.get(S.join(","))!.additive.mass, 0);
      expect(Math.abs(rec - byKey.get(T.join(","))!.inclusive.mass)).toBeLessThan(1e-9);
    }
    // the additive masses sum to the sigma-count of the fuzzy union
    let union = 0;
    for (let x = 0; x < d.N; x++) union += Math.max(...Ks.map((i) => thresholded(d.P[x * d.L + i], tau)));
    expect(rows.reduce((s, r) => s + r.additive.mass, 0)).toBeCloseTo(union, 9);
    // per element, the nonzero components form a nested chain of at most |K| combinations
    for (let x = 0; x < d.N; x++) {
      for (const i of Ks) v[i] = thresholded(d.P[x * d.L + i], tau);
      const chain = all.filter((S) => component(v, S, Ks) > 0).sort((a, b) => a.length - b.length);
      expect(chain.length).toBeLessThanOrEqual(Ks.length);
      for (let c = 1; c < chain.length; c++) expect(chain[c - 1].every((i) => chain[c].includes(i))).toBe(true);
    }
  };
  it("reconstruction and the max identity on the fixture, with and without threshold", () => {
    check(fx, K, null);
    for (const tau of [0.15000000000000002, 0.5, 0.6000000000000001, 0.7000000000000001, 0.95]) check(fx, K, tau);
  });
  it("randomized: 1,000 elements, 1–6 sets, values from {0, 0.5, 1, random}, random τ", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let trial = 0; trial < 6; trial++) {
      const L = trial + 1;
      const rows: [string, ...number[]][] = Array.from({ length: 1000 }, (_, x) => [
        `x${x}`, ...Array.from({ length: L }, () => { const r = rnd(); return r < 0.2 ? 0 : r < 0.35 ? 0.5 : r < 0.5 ? 1 : rnd(); }),
      ]);
      const d = data(rows);
      const Ks = Array.from({ length: L }, (_, i) => i);
      check(d, Ks, null);
      check(d, Ks, Math.round((0.05 + rnd() * 0.9) / 0.05) * 0.05);
    }
  });
});

describe("special cases", () => {
  it("binary memberships: crisp exclusive and inclusive intersections; τ changes nothing", () => {
    const d = data([["a", 1, 0, 1], ["b", 1, 1, 1], ["c", 0, 1, 0], ["d", 0, 0, 0], ["e", 1, 0, 1]]);
    const rows = byName(upsetRows(d, K));
    expect(rows.get("AC")!.additive.mass).toBe(2);
    expect(ids(d, rows.get("AC")!.additive.contributors)).toEqual(["a", "e"]);
    expect(rows.get("ABC")!.additive.mass).toBe(1);
    expect(rows.get("B")!.additive.mass).toBe(1);
    expect(rows.get("A")!.additive.mass).toBe(0);
    expect(rows.get("A")!.inclusive.mass).toBe(3);
    expect(rows.get("AC")!.inclusive.mass).toBe(3);
    for (const tau of [0.05, 0.5, 0.95]) {
      const t = upsetRows(d, K, { tau, beta: 0.5, share: 0.2 });
      expect(t.map((r) => [r.inclusive.mass, r.additive.mass, r.inclusive.contributors, r.additive.contributors]))
        .toEqual([...rows.values()].map((r) => [r.inclusive.mass, r.additive.mass, r.inclusive.contributors, r.additive.contributors]));
      expect(t.every((r) => !r.inclusive.rings.length && !r.additive.rings.length)).toBe(true);
    }
  });
  it("ties: A = B = 0.6 gives component 0 for {A} and 0.6 for {A, B}", () => {
    const v = [0.6, 0.6, 0];
    expect(component(v, [A], K)).toBe(0);
    expect(component(v, [B], K)).toBe(0);
    expect(component(v, [A, B], K)).toBe(0.6);
  });
  it("a membership exactly at τ reaches it", () => {
    expect(thresholded(0.5, 0.5)).toBe(0.5);
    expect(thresholded(0.15, 0.15000000000000002)).toBe(0.15);
    expect(thresholded(0.7, 0.7000000000000001)).toBe(0.7);
    expect(thresholded(0.49, 0.5)).toBe(0);
  });
  it("values 0 and 1, and an all-zero element", () => {
    const d = data([["z", 0, 0, 0], ["o", 1, 1, 1]]);
    const rows = upsetRows(d, K);
    for (const r of rows) {
      expect(ids(d, r.inclusive.contributors)).toEqual(["o"]);
      expect(r.inclusive.mass).toBe(1);
    }
    expect(rows.filter((r) => r.additive.mass > 0).map((r) => name(r.sets))).toEqual(["ABC"]);
  });
  it("a single selected set: component = inclusive = membership", () => {
    const rows = upsetRows(fx, [B]);
    expect(rows).toHaveLength(1);
    expect(rows[0].additive.mass).toBeCloseTo(2.2, 12);
    expect(rows[0].inclusive.mass).toBeCloseTo(2.2, 12);
    expect(rows[0].additive.contributors).toEqual(rows[0].inclusive.contributors);
  });
  it("small positive values still contribute without a threshold", () => {
    const d = data([["s", 1e-12, 0, 0]]);
    const a = byName(upsetRows(d, K)).get("A")!;
    expect(a.additive.contributors).toEqual([0]);
    expect(a.inclusive.contributors).toEqual([0]);
    expect(a.additive.mass).toBe(1e-12);
  });
  it("inclusive values do not depend on K; components do", () => {
    const inc = byName(upsetRows(fx, [A, B])).get("AB")!;
    expect(inc.inclusive.mass).toBeCloseTo(1.5, 12);
    expect(inc.additive.mass).toBeCloseTo(0.7 + 0.2 + 0.6, 12);
  });
});

describe("rows", () => {
  it("2^|K| − 1 rows, by degree then lexicographic by column order", () => {
    expect(combinations([0, 1, 2]).map((T) => T.join(""))).toEqual(["0", "1", "2", "01", "02", "12", "012"]);
    expect(combinations([1, 3, 4, 7, 8, 9])).toHaveLength(63);
  });
  it("default sets: the 4 largest by sigma-count, in dataset order", () => {
    const d = data([["a", 0.1, 0.9, 0.5, 0.3, 0.8], ["b", 0.1, 0.9, 0.5, 0.2, 0.8]]);
    expect(defaultSets(d)).toEqual([1, 2, 3, 4]);
    expect(defaultSets(fx)).toEqual([0, 1, 2]);
  });
  it("shared count scale covers histograms and ring histograms", () => {
    expect(maxBinCount(upsetRows(fx, K), "inclusive")).toBe(2);
  });
});

describe("binning", () => {
  it("assigns 0, 0.2, 0.4, 0.6, 0.8 and 1.0 by explicit edges", () => {
    expect([0, 0.2, 0.4, 0.6, 0.8, 1.0].map(binOf)).toEqual([0, 1, 2, 3, 4, 4]);
    expect([0.19999, 0.3, 0.6 - 1e-15, 0.79].map(binOf)).toEqual([0, 1, 2, 3]);
    expect(histogram([0, 0.6, 1, 1])).toEqual([1, 0, 0, 1, 2]);
  });
});

describe("validation", () => {
  it("missing, non-numeric, NaN, out-of-range and duplicate identifiers are excluded, never set to 0", () => {
    const { data: d, issues } = validateMemberships(
      ["ok", "nan", "neg", "big", "dup", "dup", "str", "ok2", "short"],
      [0.5, 0.5, NaN, 0, -0.1, 0, 1.2, 0, 0.1, 0.1, 0.2, 0.2, "0.3", 0, 1, 0, null, 0.5].slice(0, 17),
      2,
    );
    expect(d.ids).toEqual(["ok", "ok2"]);
    expect(Array.from(d.P)).toEqual([0.5, 0.5, 1, 0]);
    expect(new Set(issues.map((s) => s.id))).toEqual(new Set(["nan", "neg", "big", "dup", "str", "short"]));
    expect(issueSummary(issues)).toBe("7 elements excluded: duplicate identifiers, invalid memberships");
    expect(issueSummary([])).toBeNull();
  });
  it("float32 memberships are read as their shortest decimal", () => {
    expect(float32ToDecimal(Math.fround(0.7))).toBe(0.7);
    expect(float32ToDecimal(Math.fround(0.15))).toBe(0.15);
    expect(float32ToDecimal(1)).toBe(1);
    const { data: d } = validateMemberships(["a"], Float32Array.from([0.7, 0.3]), 2, { float32: true });
    expect(Array.from(d.P)).toEqual([0.7, 0.3]);
  });
});
