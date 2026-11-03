import { describe, expect, it } from "vitest";
import { buildDataset, pcaMap, type FzMeta } from "./loadFz";

const meta = (over: Partial<FzMeta> = {}): FzMeta => ({
  schema: "fz-1.0.0",
  title: "toy",
  source: "hand-made",
  attribution: "",
  n: 3,
  obs_ids: ["a", "b", "c"],
  obs_names: ["A", "B", "C"],
  sets: { title: "genres", names: ["x", "y"], kind: "graded", file: "membership.bin" },
  categories: { decade: { title: "decade", names: ["70s", "80s"], codes: [0, 1, 1] } },
  numeric_attributes: [{ key: "r", title: "rating", unit: "", digits: 1, values: [1, 2, 3] }],
  map: { name: "PCA", description: "", file: "map.bin" },
  ...over,
});
const buf = (v: number[]) => Float32Array.from(v).buffer;

describe("fz-1 dataset", () => {
  it("builds memberships, categories, attributes and the map", () => {
    const ds = buildDataset("toy", meta(), buf([0.9, 0.1, 0.4, 0.6, 0, 0]), buf([0, 0, 1, 0, 0.5, 1]));
    expect(ds.N).toBe(3);
    expect(Array.from(ds.sets.P)).toHaveLength(6);
    expect(Array.from(ds.sets.top)).toEqual([0, 1, -1]);
    expect(ds.sets.colors).toHaveLength(2);
    expect(ds.categories[0]).toMatchObject({ key: "decade", names: ["70s", "80s"] });
    expect(ds.map.pts[2]).toEqual([0.5, 1]);
    expect(ds.numeric[0].key).toBe("r");
  });
  it("rejects other schemas and wrong sizes", () => {
    expect(() => buildDataset("toy", meta({ schema: "ec-1.2.0" }), buf([0, 0, 0, 0, 0, 0]), null)).toThrow(/schema/);
    expect(() => buildDataset("toy", meta(), buf([0, 0, 0]), null)).toThrow(/membership/);
    expect(() => buildDataset("toy", meta(), buf([0, 0, 0, 0, 0, 0]), buf([0, 0]))).toThrow(/map/);
  });
  it("without a map, the map is the PCA of the memberships", () => {
    const ds = buildDataset("toy", meta({ map: null }), buf([0.9, 0.1, 0.4, 0.6, 0, 0]), null);
    expect(ds.map.name).toMatch(/PCA/);
    for (const [x, y] of ds.map.pts) for (const v of [x, y]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });
  it("PCA: the first axis follows the direction of largest spread", () => {
    // points on a line along set 0 (set 1 constant): the first coordinate orders them, the second is constant
    const P = Float32Array.from([0, 0.5, 0.5, 0.5, 1, 0.5]);
    const pts = pcaMap(P, 3, 2);
    const xs = pts.map((p) => p[0]);
    expect(Math.abs(xs[2] - xs[0])).toBeCloseTo(1, 6);
    expect(new Set(pts.map((p) => p[1].toFixed(6))).size).toBe(1);
  });
});
