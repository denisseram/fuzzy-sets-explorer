import { describe, expect, it } from "vitest";
import { additiveCombos, histogram, inclusiveCombos, validateMemberships, type Memberships, type Threshold } from "./fuzzyDecomposition";
import { classify, countColor, MAX_PATTERN_ROWS, patternChildren, patternRows, ribbonCounts, ribbonGeometry } from "./patterns";
import { autoFullRows, autoRowHeight, displayEntries, layout, lodOf, rowHeight } from "./upsetView";
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
      const L = 2 + (t % 6);
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
          for (const r of rows) {
            expect(r.contributors).toEqual([...r.contributors].sort((a, b) => a - b));
            const kids = patternChildren(d, r, K, th, mode, opts);
            if (!kids.length) continue;
            expect(kids.flatMap((q) => q.contributors).sort((a, b) => a - b)).toEqual(r.contributors);
            expect(Math.abs(kids.reduce((s, q) => s + q.mass, 0) - r.mass)).toBeLessThan(1e-9);
          }
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
  it("rows of 4+ sets: count groups from all high to none, colours by count, groups open into their patterns", () => {
    // 6 sets; mask m: high (0.6 / 0.9 alternating) in the sets of m, low (0.1 / 0.35) elsewhere, so no element is
    // "equal"; (m % 5) + 1 elements per mask
    const rows: [string, ...number[]][] = [];
    let n = 0;
    const hi = (i: number) => (i % 2 ? 0.9 : 0.6), lo = (i: number) => (i % 2 ? 0.35 : 0.1);
    for (let mask = 0; mask < 64; mask++) for (let r = 0; r <= mask % 5; r++) rows.push([`m${n++}`, ...Array.from({ length: 6 }, (_, i) => (mask & (1 << i) ? hi(i) : lo(i)))]);
    rows.push(["eq", 0.5, 0.5, 0.5, 0.55, 0.5, 0.5]);
    const d = data(rows);
    const K = [0, 1, 2, 3, 4, 5];
    const row = inclusiveCombos(d, K).combos.find((c) => c.sets.length === 6)!;
    const o = { names: NAMES, cols: K };
    const top = patternRows(d, row, K, null, "inclusive", o);
    expect(top.map((r) => r.pattern.label)).toEqual([
      "High in all 6", "High in 5 of 6 (6 patterns)", "High in 4 of 6 (15 patterns)", "High in 3 of 6 (20 patterns)",
      "High in 2 of 6 (15 patterns)", "High in 1 of 6 (6 patterns)", "High in none (all low)", "Equal, middle",
    ]);
    expect(top.flatMap((r) => r.contributors).sort((a, b) => a - b)).toEqual(row.contributors);
    expect(top.map((r) => r.pattern.openable)).toEqual([false, true, true, true, true, true, false, false]);
    expect(top[0].pattern.color).toBe(countColor(6, 6));
    expect(top[3].pattern.color).toBe(countColor(3, 6));
    // the colour follows the count: the same without the all-high and 5-of-6 elements
    const fewer = data(rows.filter((r) => r.slice(1).filter((v) => (v as number) >= 0.5).length < 5));
    const fr = patternRows(fewer, inclusiveCombos(fewer, K).combos.find((c) => c.sets.length === 6)!, K, null, "inclusive", o);
    expect(fr.find((r) => r.pattern.count === 3)!.pattern.color).toBe(countColor(3, 6));
    // a group opens into its patterns: they partition it; at most 12, the smallest merged into "Other"
    const three = top[3];
    const kids = patternChildren(d, three, K, null, "inclusive", o);
    expect(kids).toHaveLength(MAX_PATTERN_ROWS);
    expect(kids.flatMap((r) => r.contributors).sort((a, b) => a - b)).toEqual(three.contributors);
    expect(Math.abs(kids.reduce((s, r) => s + r.mass, 0) - three.mass)).toBeLessThan(1e-9);
    expect(kids[kids.length - 1].pattern.label).toBe("Other (9 patterns)");
    expect(kids[0].pattern.label).toMatch(/^High in [A-F], [A-F], [A-F]$/);
    expect(kids.every((r) => r.parent === row.key && r.key.startsWith(`${three.key}|`) && r.pattern.depth === 2 && r.pattern.color === three.pattern.color)).toBe(true);
    // kept patterns are the largest: of the 20 three-set patterns (sizes (mask % 5) + 1), the 11 kept are at least as
    // large as every merged one
    const all3 = Array.from({ length: 64 }, (_, m) => m).filter((m) => [0, 1, 2, 3, 4, 5].filter((i) => m & (1 << i)).length === 3).map((m) => (m % 5) + 1);
    const desc = all3.sort((a, b) => b - a);
    expect(kids.slice(0, -1).map((r) => r.contributors.length).sort((a, b) => b - a)).toEqual(desc.slice(0, 11));
    expect(kids[kids.length - 1].contributors).toHaveLength(desc.slice(11).reduce((s, v) => s + v, 0));
    // no children for rows without groups
    expect(patternChildren(d, top[0], K, null, "inclusive", o)).toEqual([]);
    expect(patternChildren(d, kids[0], K, null, "inclusive", o)).toEqual([]);
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
  it("Auto: open rows and their pattern rows are Full, and opening does not make the other rows shorter", () => {
    const closed = displayEntries(rows, null, new Set(), null, { open: new Set(), of });
    const h0 = autoRowHeight("auto", closed, 200, autoFullRows(closed, null, null));
    const open = new Set(["0,1", "0,2"]);
    const e = displayEntries(rows, null, new Set(), null, { open, of });
    const full = autoFullRows(e, null, null, open);
    const opened = e.filter((x) => x.kind === "row" && (x.parent !== undefined || open.has(x.combo.key))).map((x) => x.id);
    expect(opened.length).toBeGreaterThan(2);
    expect([...full].sort()).toEqual(opened.sort());
    const h = autoRowHeight("auto", e, 200, autoFullRows(e, null, null));
    expect(h).toBe(h0);
    const items = layout(e, { rowH: h, headerH: 18, fisheye: null, full }).items;
    for (const it of items) if (it.kind === "row") expect(lodOf(it.h)).toBe(full.has(it.id) ? "full" : lodOf(h0));
    // fixed settings are unchanged
    expect(autoRowHeight("compact", e, 200, new Set())).toBe(rowHeight("compact", 0, 0));
  });
  it("nested: an open count group is followed by its patterns, all owned by the row", () => {
    const d = data([["a", 0.9, 0.8, 0.1, 0.2], ["b", 0.1, 0.9, 0.7, 0.2], ["c", 0.6, 0.2, 0.9, 0.3], ["d", 0.2, 0.3, 0.1, 0.35]]);
    const K = [0, 1, 2, 3];
    const rows4 = inclusiveCombos(d, K).combos;
    const row = rows4.find((c) => c.sets.length === 4)!;
    const o = { names: NAMES, cols: K };
    const of = (c: (typeof rows4)[number]) => ("pattern" in c ? patternChildren(d, c as never, K, null, "inclusive", o) : patternRows(d, c, K, null, "inclusive", o));
    const top = patternRows(d, row, K, null, "inclusive", o);
    expect(top.map((r) => r.pattern.label)).toEqual(["High in 2 of 4 (3 patterns)", "High in none (all low)"]);
    const e = displayEntries(rows4, null, new Set(), null, { open: new Set([row.key, top[0].key]), of });
    const at = e.findIndex((x) => x.id === row.key);
    const next = e.slice(at + 1, at + 6) as { id: string; parent?: string }[];
    expect(next.map((x) => x.id)).toEqual([top[0].key, `${top[0].key}|H:0,1`, `${top[0].key}|H:0,2`, `${top[0].key}|H:1,2`, top[1].key]);
    expect(next.every((x) => x.parent === row.key)).toBe(true);
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
