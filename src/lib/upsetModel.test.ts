import { describe, expect, it } from "vitest";
import { parentKey, upsetModel, visibleColumns } from "./upsetModel";

// 6 observations, 2 sets
const P = Float32Array.from([0.9, 0.1, 0.8, 0.2, 0.7, 0.6, 0.6, 0.9, 0.2, 0.9, 0.1, 0.8]);

describe("columns at τ", () => {
  const model = upsetModel(P, 2, 0.5);
  it("columns are the combinations passing tau", () => {
    expect(new Set(model.rows.map((it) => it.key))).toEqual(new Set(["0", "0,1", "1"]));
    const it0 = model.rows.find((it) => it.key === "0")!;
    expect(it0.n).toBe(2);
    expect(it0.fuzzy).toBeCloseTo(0.9 + 0.8, 5);
    expect(model.members("0")).toEqual([0, 1]);
  });
  it("the column of one observation", () => {
    expect(model.keyOf(0)).toBe("0");
    expect(model.keyOf(2)).toBe("0,1");
    for (let i = 0; i < 6; i++) expect(model.members(model.keyOf(i)!)).toContain(i);
    expect(upsetModel(P, 2, 0.95).keyOf(0)).toBeNull();
  });
});

describe("sub-columns", () => {
  // set 0 members: obs 0 pure, obs 1 near set 1 (0.3), obs 2 near set 1 (0.4)
  const Q = Float32Array.from([0.9, 0.1, 0.8, 0.3, 0.7, 0.4]);
  const m = upsetModel(Q, 2, 0.5);
  it("members of a sub-column follow its near pattern; they add up to the column", () => {
    expect(m.rows[0]).toMatchObject({ key: "0", n: 3, nBorder: 2 });
    expect(m.members("0|")).toEqual([0]);
    expect(m.members("0|1")).toEqual([1, 2]);
    expect(m.members("0|*mixed")).toEqual([]);
    expect(m.groups("0").flatMap((g) => g.idx).sort()).toEqual(m.members("0"));
    expect(parentKey("0|1")).toBe("0");
  });
  it("the near level moves the boundary", () => {
    expect(upsetModel(Q, 2, 0.5, 0.35).members("0|1")).toEqual([]); // obs 2 alone near → other
    expect(upsetModel(Q, 2, 0.5, 0.35).members("0|*other")).toEqual([2]);
  });
});

describe("visible columns", () => {
  const { rows } = upsetModel(P, 2, 0.5);
  it("single-set columns can be hidden; min number of observations and sort apply", () => {
    expect(visibleColumns(rows, { showSingle: true, minSize: 0, sortKey: "n", max: 50 }).total).toBe(3);
    const noSingle = visibleColumns(rows, { showSingle: false, minSize: 0, sortKey: "n", max: 50 });
    expect(noSingle.shown.map((it) => it.key)).toEqual(["0,1"]);
    // every column has 2 observations
    expect(visibleColumns(rows, { showSingle: true, minSize: 3, sortKey: "n", max: 50 }).total).toBe(0);
    expect(visibleColumns(rows, { showSingle: true, minSize: 2, sortKey: "n", max: 50 }).total).toBe(3);
    const bySize = visibleColumns(rows, { showSingle: true, minSize: 0, sortKey: "fuzzy", max: 50 });
    expect(bySize.shown[2].key).toBe("0,1");
    expect(visibleColumns(rows, { showSingle: true, minSize: 0, sortKey: "fuzzy", max: 1 }).shown).toHaveLength(1);
  });
});
