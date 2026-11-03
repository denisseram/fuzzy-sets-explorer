import { describe, expect, it } from "vitest";
import { intersections, membershipSignatures } from "./fuzzyUpset";
import { tauGrid, tauSweep } from "./fuzzyViews";

describe("τ persistence barcode", () => {
  it("at any τ, combination sizes equal the UpSet's columns", () => {
    const P = Float32Array.from([0.9, 0.1, 0.8, 0.3, 0.6, 0.6, 0.35, 0.9, 0.05, 0.2]);
    const taus = [0.2, 0.34, 0.5, 0.7];
    const sw = tauSweep(P, 2, taus);
    taus.forEach((tau, t) => {
      const rows = intersections(membershipSignatures(P, 2, tau));
      for (const it of rows) expect(sw.count[sw.keys.indexOf(it.key)][t]).toBe(it.n);
      expect(sw.count.reduce((a, c) => a + c[t], 0)).toBe(rows.reduce((a, it) => a + it.n, 0));
    });
  });
  it("a combination exists only over its τ range", () => {
    // memberships 0.9 / 0.1: {0} for 0.1 < τ <= 0.9, {0,1} for τ <= 0.1
    const sw = tauSweep([0.9, 0.1], 2, [0.05, 0.1, 0.5, 0.9, 0.95]);
    expect(sw.count[sw.keys.indexOf("0,1")]).toEqual([1, 1, 0, 0, 0]);
    expect(sw.count[sw.keys.indexOf("0")]).toEqual([0, 0, 1, 1, 0]);
  });
  it("grid", () => expect(tauGrid(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]));
});
