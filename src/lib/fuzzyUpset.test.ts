// Fuzzy UpSet definitions on small hand-built membership tables with known answers.
import { describe, expect, it } from "vitest";
import {
  cellsFor, composition, fractionsOf, intersections, meanOver, membershipSignatures, nearGroups, nearPattern, nearShare, NONE,
  holeRadius, nearMarked, strongestSet, summarise,
} from "./fuzzyUpset";

const keyOf = (s: ReturnType<typeof membershipSignatures>, i: number) => (s.sig[i] >= 0 ? s.keys[s.sig[i]] : s.sig[i]);
// genome-like scores for 3 movies over [Comedy, Romance, Drama], flat
const P = Float32Array.from([0.78, 0.6, 0.1, 0.9, 0.2, 0.55, 0.3, 0.4, 0.2]);

describe("signatures", () => {
  it("a set belongs when its membership reaches tau; strength = smallest passing membership", () => {
    const s = membershipSignatures(P, 3, 0.5);
    expect([0, 1, 2].map((i) => keyOf(s, i))).toEqual(["0,1", "0,2", NONE]);
    expect(Array.from(s.strength).map((v) => +v.toFixed(2))).toEqual([0.6, 0.55, 0]);
    expect(s.nNone).toBe(1);
    expect(membershipSignatures(P, 3, 0.7).keys).toEqual(["0"]);
  });
  it("intersections: fuzzy size = sum of strengths, never above the number of observations", () => {
    const Q = Float32Array.from([0.9, 0.1, 0.8, 0.2, 0.7, 0.6, 1, 1]);
    const rows = intersections(membershipSignatures(Q, 2, 0.5));
    const by = Object.fromEntries(rows.map((it) => [it.key, it]));
    expect(by["0"].n).toBe(2);
    expect(by["0"].fuzzy).toBeCloseTo(1.7, 5);
    expect(by["0,1"]).toMatchObject({ labels: [0, 1], n: 2 });
    expect(by["0,1"].fuzzy).toBeCloseTo(1.6, 5);
    for (const it of rows) expect(it.fuzzy).toBeLessThanOrEqual(it.n);
  });
  it("crisp memberships: τ anywhere in (0, 1] gives the same sets", () => {
    const B = Float32Array.from([1, 0, 1, 1, 0, 0, 0, 1]);
    const at = (tau: number) => intersections(membershipSignatures(B, 2, tau)).map((it) => [it.key, it.n, it.fuzzy]);
    expect(at(0.1)).toEqual(at(0.95));
    expect(membershipSignatures(B, 2, 0.5).nNone).toBe(1);
  });
  it("observations of a column", () => {
    const s = membershipSignatures(P, 3, 0.5);
    expect(cellsFor(s, "0,2")).toEqual([1]);
    expect(cellsFor(s, "1")).toEqual([]);
  });
});

describe("composition by a crisp category", () => {
  it("fractions per column; unknown codes count in the total but in no category", () => {
    const Q = Float32Array.from([1, 1, 1, 1, 1]); // L = 1, every observation in set 0
    const s = membershipSignatures(Q, 1, 0.5);
    expect(composition(s, [0, 1, 1, 1, -1], 2).get("0")).toEqual([0.2, 0.6]);
  });
});

describe("summarise", () => {
  it("median and quartiles over a subset (linear interpolation, like numpy)", () => {
    const vals = [10, 1, 2, 3, 4, 100];
    expect(summarise(vals, [1, 2, 3, 4])).toEqual({ median: 2.5, q1: 1.75, q3: 3.25, mean: 2.5, n: 4 });
    expect(summarise(vals, [0])).toEqual({ median: 10, q1: 10, q3: 10, mean: 10, n: 1 });
    expect(summarise(vals, [1, 2, 5])!.mean).toBeCloseTo(103 / 3, 10); // the 100 pulls the mean, not the median (2)
    expect(summarise(vals, [0, 5], true)!.mean).toBeCloseTo(Math.log10(55), 10); // arithmetic mean of raw values
    expect(summarise(vals, [])).toBeNull();
    expect(summarise(vals, [0, 5], true)!.median).toBeCloseTo(1.5, 10);
  });
});

describe("near a set: from the near level up to τ", () => {
  it("column means", () => {
    expect(meanOver(P, [0, 1], 3).map((v) => +v.toFixed(3))).toEqual([0.84, 0.4, 0.325]);
  });
  it("near pattern: at the near level counts, just below it does not, τ and above is a member", () => {
    const Q = Float32Array.from([0.25, 0.2499, 0.5, 0.49]);
    expect(nearPattern(Q, 0, 4, 0.5, 0.25)).toEqual([0, 3]);
    expect(nearPattern(Q, 0, 4, 0.5, 0.5)).toEqual([]); // near level at τ: nothing is near
  });
  it("borderline count: pure + borderline = n", () => {
    // [Comedy, Romance, Drama]: movie 0 near Drama (0.3), movie 1 pure, movie 2 in no set
    const Q = Float32Array.from([0.8, 0.1, 0.3, 0.9, 0.0, 0.1, 0.2, 0.3, 0.1]);
    const rows = intersections(membershipSignatures(Q, 3, 0.5));
    expect(rows).toEqual([{ key: "0", labels: [0], fuzzy: expect.any(Number), n: 2, nBorder: 1 }]);
    expect(intersections(membershipSignatures(Q, 3, 0.5, 0.35))[0].nBorder).toBe(0);
  });
  it("share near each set; empty column → zeros", () => {
    // 10 movies in set 0; one is near set 1, three near set 2
    const rows = Array.from({ length: 10 }, (_, i) => [0.9, i === 0 ? 0.3 : 0.1, i < 3 ? 0.4 : 0]);
    const Q = Float32Array.from(rows.flat());
    const idx = Array.from({ length: 10 }, (_, i) => i);
    expect(nearShare(Q, idx, 3, 0.5, 0.25).map((v) => +v.toFixed(2))).toEqual([0, 0.1, 0.3]);
    expect(nearShare(Q, [], 3, 0.5, 0.25)).toEqual([0, 0, 0]);
  });
  it("groups: pure first, then patterns by size; near 3+ sets → mixed; patterns of one → other", () => {
    const rows = [
      [0.9, 0, 0, 0, 0], [0.9, 0, 0, 0, 0], // pure
      [0.9, 0.3, 0, 0, 0], [0.9, 0.3, 0, 0, 0], [0.9, 0.3, 0, 0, 0], // near 1
      [0.9, 0, 0.3, 0.3, 0], [0.9, 0, 0.3, 0.3, 0], // near 2 & 3
      [0.9, 0.3, 0.3, 0.3, 0.3], // near 4 sets: mixed
      [0.9, 0, 0, 0, 0.4], // alone: other
    ];
    const Q = Float32Array.from(rows.flat());
    const g = nearGroups(Q, rows.map((_, i) => i), 5, 0.5, 0.25);
    expect(g.map((x) => [x.key, x.kind, x.idx])).toEqual([
      ["", "pure", [0, 1]], ["1", "near", [2, 3, 4]], ["2,3", "near", [5, 6]], ["*mixed", "mixed", [7]], ["*other", "other", [8]],
    ]);
    expect(g.reduce((n, x) => n + x.idx.length, 0)).toBe(rows.length);
  });
  it("crisp memberships: everything pure", () => {
    const B = Float32Array.from([1, 0, 1, 1, 0, 1]);
    expect(intersections(membershipSignatures(B, 2, 0.5)).every((it) => it.nBorder === 0)).toBe(true);
    expect(nearGroups(B, [0, 1, 2], 2, 0.5, 0.25).map((x) => x.kind)).toEqual(["pure"]);
  });
  it("near mark: only from the minimum share", () => {
    expect(nearMarked(0)).toBe(false);
    expect(nearMarked(0.1, 0.2)).toBe(false);
    expect(nearMarked(0.2, 0.2)).toBe(true);
    expect(nearMarked(1, 0.2)).toBe(true);
  });
  it("hole radius: max at mean 0, min from mean τ, shrinking in between", () => {
    expect(holeRadius(0, 0.5, 1.5, 5)).toBeCloseTo(5, 10);
    expect(holeRadius(0.5, 0.5, 1.5, 5)).toBeCloseTo(1.5, 10);
    expect(holeRadius(0.9, 0.5, 1.5, 5)).toBeCloseTo(1.5, 10);
    expect(holeRadius(0.1, 0.5)).toBeGreaterThan(holeRadius(0.3, 0.5));
  });
  it("fractions of a subset by category", () => {
    expect(fractionsOf([0, 2, 3], [0, 1, 1, -1], 2).map((v) => +v.toFixed(3))).toEqual([0.333, 0.333]);
  });
});

describe("strongest set", () => {
  it("argmax per observation; -1 when every membership is 0", () => {
    expect(Array.from(strongestSet(Float32Array.from([0.2, 0.7, 0, 0, 1, 0]), 2))).toEqual([1, -1, 0]);
  });
});
