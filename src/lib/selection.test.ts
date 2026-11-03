import { describe, expect, it } from "vitest";
import { pointsInRect } from "./selection";

describe("rectangle selection", () => {
  it("returns the points inside, whatever the drag direction", () => {
    const pts: [number, number][] = [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9], [0.5, 0.2]];
    expect(pointsInRect(pts, 0.4, 0.1, 0.6, 0.6)).toEqual([1, 3]);
    expect(pointsInRect(pts, 0.6, 0.6, 0.4, 0.1)).toEqual([1, 3]);
    expect(pointsInRect(pts, 0.95, 0.95, 1, 1)).toEqual([]);
  });
});
