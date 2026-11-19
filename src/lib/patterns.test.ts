import { describe, expect, it } from "vitest";
import { additiveCombos, histogram, inclusiveCombos, validateMemberships, type Memberships, type Threshold } from "./fuzzyDecomposition";
import { classify, MAX_PATTERN_ROWS, patternRows, ribbonCounts, ribbonGeometry } from "./patterns";
import { autoFullRows, displayEntries, layout } from "./upsetView";
import { renderMatrix } from "./testPlot";

const A = 0, B = 1, C = 2;
function data(rows: readonly (readonly [string, ...number[]])[]): Memberships {
  const L = rows[0].length - 1;
  return validateMemberships(rows.map((r) => r[0]), rows.flatMap((r) => r.slice(1) as number[]), L).data;
}
const FIXTURE = [["E1", 0.8, 0.7, 0.5], ["E2", 0.2, 0.9, 0.4], ["E3", 0.0, 0.0, 0.0], ["E4", 0.6, 0.6, 0.0]] as const;
const fx = data(FIXTURE);
const K3 = [A, B, C];
const NAMES = ["A", "B", "C", "D", "E", "F"];
let seed = 4242;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const value = () => {
  const r = rnd();
  return r < 0.25 ? 0 : r < 0.35 ? 0.5 : r < 0.45 ? 1 : Math.round(rnd() * 20) / 20;
};

describe("classification (cut 0.5, equal within 0.15)", () => {
  it("high/low patterns and the three equal levels", () => {
    expect(classify([0.9, 0.1])).toBe("H:0"); // first high, second low
    expect(classify([0.1, 0.9])).toBe("H:1");
    expect(classify([0.7, 0.9])).toBe("H:0,1"); // gap 0.2: both high, not equal
    expect(classify([0.05, 0.35])).toBe("H:"); // both low
    expect(classify([0.8, 0.7])).toBe("E:high");
    expect(classify([0.55, 0.6])).toBe("E:middle");
    expect(classify([0.2, 0.3])).toBe("E:low");
    expect(classify([0.6, 0.6])).toBe("E:high"); // mean exactly at cut + 0.1
    expect(classify([0.5, 0.35])).toBe("E:middle"); // gap exactly 0.15 counts as equal
    expect(classify([0.5, 0.34])).toBe("H:0");
    expect(classify([0.9, 0.2, 0.6])).toBe("H:0,2");
    expect(classify([0.9, 0.2, 0.6], { cut: 0.7, eps: 0.05 })).toBe("H:0");
  });
});

describe("pattern rows", () => {
  it("fixture, inclusive A ∩ B: Equal high (E1, E4; mass 1.3) and A low · B high (E2; mass 0.2)", () => {
    const ab = inclusiveCombos(fx, K3).combos.find((c) => c.key === "0,1")!;
    const rows = patternRows(fx, ab, K3, null, "inclusive", { names: NAMES, cols: K3 });
    expect(rows.map((r) => [r.pattern.label, r.contributors.map((x) => fx.ids[x])])).toEqual([
      ["A low · B high", ["E2"]],
      ["Equal, high", ["E1", "E4"]],
    ]);
    expect(rows[0].mass).toBeCloseTo(0.2, 12);
    expect(rows[1].mass).toBeCloseTo(1.3, 12);
    expect(rows.map((r) => r.key)).toEqual(["0,1|H:1", "0,1|E:high"]);
    expect(rows[0].pattern.color).toBe("var(--pat-mixed-2)"); // "B high" is the second mixed pattern of two sets
    // additive AB: E1 (component 0.2) and E4 (0.6), both equal high
    const add = additiveCombos(fx, K3).find((c) => c.key === "0,1")!;
    const ra = patternRows(fx, add, K3, null, "additive", { names: NAMES, cols: K3 });
    expect(ra).toHaveLength(1);
    expect(ra[0].mass).toBeCloseTo(0.8, 12);
  });
  it("labels follow the column order; one-set rows and empty rows have no patterns", () => {
    const ab = inclusiveCombos(fx, K3).combos.find((c) => c.key === "0,1")!;
    expect(patternRows(fx, ab, K3, null, "inclusive", { names: NAMES, cols: [B, A, C] })[0].pattern.label).toBe("B high · A low");
    const a = inclusiveCombos(fx, K3).combos.find((c) => c.key === "0")!;
    expect(patternRows(fx, a, K3, null, "inclusive", { names: NAMES, cols: K3 })).toEqual([]);
    expect(patternRows(fx, { sets: [A, B], key: "0,1", mass: 0, contributors: [] }, K3, null, "inclusive", { names: NAMES, cols: K3 })).toEqual([]);
  });
  it("partition: disjoint, cover the row, masses add up (200 random datasets, both modes, τ and per-set τ)", () => {
    for (let t = 0; t < 200; t++) {
      const L = 2 + (t % 4);
      const d = data(Array.from({ length: 5 + Math.floor(rnd() * 40) }, (_, x) => [`x${x}`, ...Array.from({ length: L }, value)] as [string, ...number[]]));
      const K = Array.from({ length: L }, (_, i) => i);
      const kind = t % 3;
      const tau = () => Math.round((0.05 + rnd() * 0.9) / 0.05) * 0.05;
      const th: Threshold | null = kind === 0 ? null : { tau: tau(), beta: 0.5, share: 0.2, perSet: kind === 2 ? K.map(tau) : null };
      const opts = { names: NAMES, cols: K, cut: [0.5, 0.3, 0.7][t % 3], eps: [0.15, 0, 0.3][t % 3] };
      for (const [mode, combos] of [["inclusive", inclusiveCombos(d, K, th).combos], ["additive", additiveCombos(d, K, th)]] as const)
        for (const c of combos) {
          const rows = patternRows(d, c, K, th, mode, opts);
          if (c.sets.length < 2) continue;
          const all = rows.flatMap((r) => r.contributors).sort((a, b) => a - b);
          expect(all, `${mode} ${c.key} #${t}`).toEqual(c.contributors);
          expect(Math.abs(rows.reduce((s, r) => s + r.mass, 0) - c.mass), `${mode} ${c.key} #${t}`).toBeLessThan(1e-9);
          for (const r of rows) expect(r.contributors).toEqual([...r.contributors].sort((a, b) => a - b));
        }
    }
  });
  it("order: all high, mixed (more high sets first), all low, equal high, middle, low", () => {
    const d = data([
      ["eqlo", 0.2, 0.25, 0.3], ["low", 0.1, 0.4, 0.2], ["hh", 0.9, 0.6, 0.3], ["h", 0.9, 0.1, 0.1], ["all", 0.9, 0.7, 1],
      ["eqmid", 0.5, 0.5, 0.45], ["eqhi", 0.8, 0.8, 0.8], ["hc", 0.1, 0.2, 0.9],
    ]);
    const abc = inclusiveCombos(d, K3).combos.find((c) => c.key === "0,1,2")!;
    const rows = patternRows(d, abc, K3, null, "inclusive", { names: NAMES, cols: K3 });
    expect(rows.map((r) => r.pattern.label)).toEqual([
      "All high", "A high · B high · C low", "A high · B low · C low", "A low · B low · C high", "All low", "Equal, high", "Equal, middle", "Equal, low",
    ]);
  });
  it(`at most ${MAX_PATTERN_ROWS} rows: the smallest mixed patterns merge into "Other mixed"`, () => {
    // 6 sets: every contributor has a distinct mixed pattern (high in a different pair or triple of sets)
    const rows: [string, ...number[]][] = [];
    let n = 0;
    for (let mask = 1; mask < 63; mask++) for (let r = 0; r <= (mask % 5); r++) rows.push([`m${n++}`, ...Array.from({ length: 6 }, (_, i) => (mask & (1 << i) ? 0.9 : 0.1))]);
    const d = data(rows);
    const K = [0, 1, 2, 3, 4, 5];
    const all = inclusiveCombos(d, K).combos.find((c) => c.sets.length === 6)!;
    const pr = patternRows(d, all, K, null, "inclusive", { names: NAMES, cols: K });
    expect(pr).toHaveLength(MAX_PATTERN_ROWS);
    const other = pr.find((r) => r.pattern.kind === "other")!;
    expect(other.pattern.label).toMatch(/^Other mixed \(\d+ patterns\)$/);
    expect(pr.flatMap((r) => r.contributors).sort((a, b) => a - b)).toEqual(all.contributors);
    // the kept mixed patterns are at least as large as every merged one
    const kept = pr.filter((r) => r.pattern.kind === "mixed").map((r) => r.contributors.length);
    expect(kept).toEqual(new Array(MAX_PATTERN_ROWS - 1).fill(5)); // sizes are 1–5: 11 kept, all of the largest size
    expect(pr[0].pattern.label).toMatch(/^high in /);
  });
});

describe("ribbons", () => {
  const a = Array.from({ length: 500 }, () => (rnd() < 0.5 ? rnd() * 0.3 : 0.7 + rnd() * 0.3));
  const b = a.map((v) => (rnd() < 0.8 ? 1 - v : v)); // mostly one or the other
  const t = ribbonCounts(a, b);
  it("the table counts every contributor; its rows add up to the left set's histogram, its columns to the right's", () => {
    expect(t.flat().reduce((s, c) => s + c, 0)).toBe(500);
    expect(t.map((r) => r.reduce((s, c) => s + c, 0))).toEqual(histogram(a));
    expect(t[0].map((_, j) => t.reduce((s, r) => s + r[j], 0))).toEqual(histogram(b));
    expect(t[4][0] + t[0][4]).toBeGreaterThan(t[4][4] + t[0][0]); // the crossing dominates
  });
  it("stacked inside each bin without overlap, ordered by the other end (higher bins on top)", () => {
    const scale = Math.max(...histogram(a), ...histogram(b));
    const binH = 11.2;
    const g = ribbonGeometry(t, scale, binH);
    expect(g).toHaveLength(t.flat().filter((c) => c > 0).length);
    for (const side of ["left", "right"] as const) {
      const bin = (r: (typeof g)[number]) => (side === "left" ? r.i : r.j), other = (r: (typeof g)[number]) => (side === "left" ? r.j : r.i);
      for (let b0 = 0; b0 < 5; b0++) {
        const rs = g.filter((r) => bin(r) === b0).sort((p, q) => other(q) - other(p));
        for (const r of rs) {
          expect(r[side][0]).toBeGreaterThanOrEqual(-1e-9);
          expect(r[side][1]).toBeLessThanOrEqual(binH + 1e-9);
          expect(r[side][1] - r[side][0]).toBeCloseTo((r.count / scale) * (binH - 1), 9);
        }
        for (let q = 1; q < rs.length; q++) expect(rs[q][side][0]).toBeCloseTo(rs[q - 1][side][1], 9); // touching, in order
      }
    }
  });
});

describe("pattern rows in the plot", () => {
  const rows = inclusiveCombos(fx, K3).combos;
  const of = (c: (typeof rows)[number]) => patternRows(fx, c, K3, null, "inclusive", { names: NAMES, cols: K3 });
  it("an open row is followed by its pattern rows; hidden with it; Full with the selected row in Auto", () => {
    const e = displayEntries(rows, null, new Set(), null, { open: new Set(["0,1"]), of });
    const ids = e.map((x) => x.id);
    expect(ids.slice(ids.indexOf("0,1"), ids.indexOf("0,1") + 3)).toEqual(["0,1", "0,1|H:1", "0,1|E:high"]);
    expect(autoFullRows(e, "0,1", null)).toEqual(new Set(["0,1", "0,1|H:1", "0,1|E:high"]));
    const hidden = displayEntries(rows, null, new Set(), (c) => c.key !== "0,1", { open: new Set(["0,1"]), of });
    const items = layout(hidden, { rowH: 20, headerH: 18, fisheye: null }).items;
    expect(items.some((it) => it.kind === "row" && (it.combo.key === "0,1" || it.combo.key.startsWith("0,1|")))).toBe(false);
  });
  it("renders labels, pattern colours and ribbons", () => {
    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", "0,1", null, false, new Set(["0,1"]));
    expect(svg).toContain(">A low · B high — 1 (33 %)</text>");
    expect(svg).toContain(">Equal, high — 2 (67 %)</text>");
    expect(svg).toContain("--row-c:var(--pat-eq-high)");
    expect(svg.match(/class="fu-ribbon"/g)!.length).toBeGreaterThan(0);
    expect(svg).toContain('aria-expanded="true"');
  });
});
