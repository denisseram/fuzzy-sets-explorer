// Numbers and scales of the attribute heatmap.
import { describe, expect, it } from "vitest";
import { attrLabel, attrScales, attrT, fmtAttr, shortAttr } from "./attrHeatmap";

const rating = { key: "r", title: "mean rating", unit: "★", digits: 2, values: [] as number[] };
const pct = { key: "p", title: "rated ≥ 4★", unit: "%", digits: 0, values: [] as number[] };
const sd = { key: "s", title: "rating spread (SD)", unit: "★", digits: 2, values: [] as number[] };
const n = { key: "n", title: "number of ratings", unit: "", digits: 0, log: true, values: [] as number[] };
const year = { key: "y", title: "release year", unit: "", digits: 0, values: [] as number[] };

describe("attribute heatmap", () => {
  it("short cell values", () => {
    expect(shortAttr(rating, 3.58)).toBe("3.6");
    expect(shortAttr(pct, 51.04)).toBe("51");
    expect(shortAttr(sd, 0.934)).toBe(".93");
    expect(shortAttr(sd, 0.996)).toBe("1.0");
    expect(shortAttr(n, Math.log10(6690))).toBe("6.7k");
    expect(shortAttr(n, Math.log10(12070))).toBe("12k");
    expect(shortAttr(n, Math.log10(850))).toBe("850");
    expect(shortAttr(year, 1995)).toBe("'95");
  });
  it("full values for tooltips", () => {
    expect(fmtAttr(rating, 3.584)).toBe("3.58 ★");
    expect(fmtAttr(n, Math.log10(6690))).toBe("6,690");
  });
  it("scale = 5th–95th percentile of all values; clamps outside", () => {
    const vals = { ...rating, values: Array.from({ length: 101 }, (_, i) => i / 20) }; // 0 .. 5
    const [s] = attrScales([vals]);
    expect(s.lo).toBeCloseTo(0.25, 10);
    expect(s.hi).toBeCloseTo(4.75, 10);
    expect(attrT(s, 2.5)).toBeCloseTo(0.5, 10);
    expect(attrT(s, 5)).toBe(1);
    expect(attrT(s, 0)).toBe(0);
    expect(attrLabel(vals, s)).toBe("mean rating .25–4.8");
    expect(attrLabel(pct, { lo: 18, hi: 77 })).toBe("rated ≥ 4★ 18–77%");
    expect(attrLabel(year, { lo: 1959, hi: 2007 })).toBe("release year 1959–2007");
  });
});
