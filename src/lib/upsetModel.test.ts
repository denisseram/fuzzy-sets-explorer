import { describe, expect, it } from "vitest";
import { degreeSummaries, isSummaryKey, parentKey, upsetModel, visibleColumns } from "./upsetModel";

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

describe("main columns by coverage, the rest summarised by degree", () => {
  // 10 observations, 3 sets: "0" ×4, "1" ×3, "0,1" ×2, "0,1,2" ×1
  const rowsP = [
    ...Array(4).fill([0.9, 0.1, 0.1]), ...Array(3).fill([0.1, 0.9, 0.1]), ...Array(2).fill([0.8, 0.7, 0.1]), [0.9, 0.9, 0.6],
  ].flat();
  const m = upsetModel(Float32Array.from(rowsP), 3, 0.5);
  const o = { showSingle: true, minSize: 0, sortKey: "n" as const, max: 50 };
  it("the largest columns until they hold the coverage; the others go to the rest", () => {
    const v = visibleColumns(m.rows, { ...o, coverage: 0.6 });
    expect(v.shown.map((it) => it.key)).toEqual(["0", "1"]);
    expect(v.rest.map((it) => it.key)).toEqual(["0,1", "0,1,2"]);
    expect(v.covered).toBeCloseTo(0.7, 5);
    expect(visibleColumns(m.rows, { ...o, coverage: 0.4 }).shown.map((it) => it.key)).toEqual(["0"]);
    expect(visibleColumns(m.rows, { ...o, coverage: 0 }).shown).toHaveLength(1); // at least one
    expect(visibleColumns(m.rows, { ...o, coverage: 1, max: 2 }).shown).toHaveLength(2); // at most max
    expect(visibleColumns(m.rows, o).rest).toEqual([]);
  });
  it("columns under the min size are not drawn individually but summarised", () => {
    const v = visibleColumns(m.rows, { ...o, minSize: 3 });
    expect(v.shown.map((it) => it.key)).toEqual(["0", "1"]);
    expect(v.total).toBe(2);
    expect(v.rest.map((it) => it.key)).toEqual(["0,1", "0,1,2"]);
  });
  it("summaries by degree add up, with the share of their observations in each set", () => {
    const v = visibleColumns(m.rows, { ...o, coverage: 0.4 });
    const s = degreeSummaries(v.rest, 3, "n");
    expect(s.map((x) => x.key)).toEqual(["*deg:1", "*deg:2", "*deg:3"]);
    expect(s.map((x) => x.n)).toEqual([3, 2, 1]);
    expect(s[0].share).toEqual([0, 1, 0]);
    expect(s[2].share).toEqual([1, 1, 1]);
    expect(isSummaryKey(s[1].key) && !isSummaryKey("0,1")).toBe(true);
    // drawn + summarised = every observation in some set
    expect(v.shown.reduce((a, it) => a + it.n, 0) + s.reduce((a, x) => a + x.n, 0)).toBe(10 - m.sig.nNone);
  });
  it("4 sets or more share one summary", () => {
    const Q = Float32Array.from([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1]);
    const r = upsetModel(Q, 5, 0.5).rows;
    expect(degreeSummaries(r, 5).map((x) => [x.key, x.combos.length])).toEqual([["*deg:4", 2]]);
  });
});
