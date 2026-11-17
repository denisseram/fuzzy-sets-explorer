import { describe, expect, it } from "vitest";
import { holeRadius, strongestSet } from "./fuzzyUpset";

describe("ring hole", () => {
  it("shrinks from max (mean 0) to min (mean τ or more)", () => {
    expect(holeRadius(0, 0.5, 1.5, 5)).toBeCloseTo(5, 10);
    expect(holeRadius(0.5, 0.5, 1.5, 5)).toBeCloseTo(1.5, 10);
    expect(holeRadius(0.9, 0.5, 1.5, 5)).toBeCloseTo(1.5, 10);
    expect(holeRadius(0.1, 0.5)).toBeGreaterThan(holeRadius(0.3, 0.5));
  });
});

describe("strongest set", () => {
  it("is the largest membership, -1 when all are 0", () => {
    expect(Array.from(strongestSet(Float32Array.from([0.2, 0.7, 0, 0, 1, 0]), 2))).toEqual([1, -1, 0]);
  });
});
