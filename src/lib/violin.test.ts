import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import UpsetMatrix, { type MatrixProps, type RefMark } from "../components/UpsetMatrix";
import {
  additiveCombos, inclusiveCombos, maxBinOf, reference, rowDetail, rowValues, validateMemberships, type Memberships, type Mode,
} from "./fuzzyDecomposition";
import { displayEntries, pickReference, referenceLabel } from "./upsetView";
import {
  bezierAt, indexOfSorted, integrate, jitter, MAX_POINTS, pointsToDraw, profilePath, profileSegments, violin, violinDirect, VIOLIN_STEPS, VIOLIN_UNIT,
} from "./violin";

const A = 0, B = 1, C = 2;
const K3 = [A, B, C];
function data(rows: readonly (readonly [string, ...number[]])[]): Memberships {
  const L = rows[0].length - 1;
  return validateMemberships(rows.map((r) => r[0]), rows.flatMap((r) => r.slice(1) as number[]), L).data;
}
const FIXTURE = [["E1", 0.8, 0.7, 0.5], ["E2", 0.2, 0.9, 0.4], ["E3", 0.0, 0.0, 0.0], ["E4", 0.6, 0.6, 0.0]] as const;
const fx = data(FIXTURE);

let seed = 99;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const maxOf = (f: ArrayLike<number>) => Math.max(...Array.from(f));

describe("half violin: smoothed counts", () => {
  it("the trapezoid integral over [0, 1] is 0.2 · n (within 2 %)", () => {
    for (const n of [1, 5, 50, 1000]) {
      const v = Array.from({ length: n }, rnd);
      for (const f of [violin(v), violinDirect(v)]) expect(Math.abs(integrate(f) - VIOLIN_UNIT * n) / (VIOLIN_UNIT * n), `n = ${n}`).toBeLessThan(0.02);
    }
  });
  it("values at 0 or at 1: the reflection keeps all mass inside [0, 1]", () => {
    for (const v of [[0, 0, 0], [1, 1, 1, 1], [0, 1], [0.01, 0.99]]) {
      for (const f of [violin(v), violinDirect(v)]) {
        expect(Math.abs(integrate(f) - VIOLIN_UNIT * v.length) / (VIOLIN_UNIT * v.length)).toBeLessThan(0.02);
        expect(f).toHaveLength(VIOLIN_STEPS);
      }
    }
    // the peak of values at 0 sits at 0 (doubled kernel), not half outside the axis
    const f0 = violinDirect([0]);
    expect(f0[0]).toBe(maxOf(f0));
  });
  it("no values: f = 0", () => {
    expect(Array.from(violin([]))).toEqual(new Array(VIOLIN_STEPS).fill(0));
    expect(Array.from(violinDirect([]))).toEqual(new Array(VIOLIN_STEPS).fill(0));
  });
  it("f counts elements per 0.2 of membership: n identical values far from the edges peak at 0.2 · n · K_h(0)", () => {
    const f = violinDirect(new Array(10).fill(0.5));
    expect(f[25]).toBeCloseTo(0.2 * 10 / (0.06 * Math.sqrt(2 * Math.PI)), 6);
  });
  it("the 0.01-binned computation matches the direct sum within 1 % (of the curve's maximum)", () => {
    const cases: number[][] = [[0.505], [0.003], [0.997], [0.125, 0.135, 0.145], [0, 1, 0.5]];
    for (let t = 0; t < 40; t++) cases.push(Array.from({ length: 1 + Math.floor(rnd() * 300) }, () => (rnd() < 0.2 ? Math.round(rnd()) : rnd())));
    for (const v of cases) {
      const a = violin(v), b = violinDirect(v), m = maxOf(b);
      for (let i = 0; i < VIOLIN_STEPS; i++) expect(Math.abs(a[i] - b[i]) / m).toBeLessThan(0.01);
    }
  });
});

describe("points", () => {
  it("an element's jitter depends only on its index: the same in every cell, mode and render", () => {
    const inc = inclusiveCombos(fx, K3).combos.find((c) => c.key === "0,1")!;
    const add = additiveCombos(fx, K3).find((c) => c.key === "0,1")!;
    const e1 = 0;
    const offsets = [inc, add].flatMap((c) => c.sets.map(() => jitter(c.contributors[indexOfSorted(c.contributors, e1)])));
    expect(new Set(offsets).size).toBe(1);
    expect(jitter(e1)).toBe(jitter(e1));
    const xs = Array.from({ length: 2000 }, (_, x) => jitter(x));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(xs.reduce((s, v) => s + v, 0) / xs.length - 0.5)).toBeLessThan(0.03); // spread over the strip
  });
  it("cap: above 200 contributors only the reference element's points are drawn", () => {
    const few = Array.from({ length: MAX_POINTS }, (_, i) => i * 2);
    expect(pointsToDraw(few, null)).toHaveLength(MAX_POINTS);
    const many = Array.from({ length: MAX_POINTS + 1 }, (_, i) => i * 2);
    expect(pointsToDraw(many, null)).toEqual([]);
    expect(pointsToDraw(many, 34)).toEqual([17]);
    expect(pointsToDraw(many, 35)).toEqual([]); // not a contributor
  });
  it("per-cell values: the contributors' original memberships (fixture)", () => {
    const inc = inclusiveCombos(fx, K3).combos.find((c) => c.key === "0,1")!;
    const vi = rowValues(fx, inc.sets, inc.contributors);
    expect(vi.idx.map((x) => fx.ids[x])).toEqual(["E1", "E2", "E4"]);
    expect(Array.from(vi.values[0])).toEqual([0.8, 0.2, 0.6]);
    expect(Array.from(vi.values[1])).toEqual([0.7, 0.9, 0.6]);
    const add = additiveCombos(fx, K3).find((c) => c.key === "0,1")!;
    const va = rowValues(fx, add.sets, add.contributors);
    expect(Array.from(va.values[0])).toEqual([0.8, 0.6]);
    expect(Array.from(va.values[1])).toEqual([0.7, 0.6]);
  });
});

describe("profile curve", () => {
  const check = (ys: number[]) => {
    const pts = ys.map((y, i) => [i * 116 + 7 * i * i, y] as const);
    const segs = profileSegments(pts);
    expect(segs).toHaveLength(pts.length - 1);
    for (const g of segs) {
      const xm = (g.p0[0] + g.p1[0]) / 2;
      expect(g.c1).toEqual([xm, g.p0[1]]);
      expect(g.c2).toEqual([xm, g.p1[1]]);
    }
    let lo = Infinity, hi = -Infinity;
    for (const g of segs)
      for (let t = 0; t <= 1; t += 1 / 64) {
        const y = bezierAt(g, t)[1];
        lo = Math.min(lo, y), hi = Math.max(hi, y);
      }
    expect(lo).toBeCloseTo(Math.min(...ys), 12);
    expect(hi).toBeCloseTo(Math.max(...ys), 12);
  };
  it("control points at the midpoint with the endpoints' y; the lowest point is the minimum membership", () => {
    check([0.8, 0.7]); // E1 in A ∩ B
    check([0.8, 0.7, 0.5]); // E1 in A ∩ B ∩ C
    for (let t = 0; t < 50; t++) check(Array.from({ length: 2 + Math.floor(rnd() * 6) }, rnd));
  });
  it("one point: no curve", () => {
    expect(profilePath([[10, 0.4]])).toBe("");
    expect(profileSegments([[10, 0.4]])).toEqual([]);
  });
});

// ---- the plot, rendered to static SVG markup --------------------------------------------------------------------------

const noop = () => {};
function renderMatrix(d: Memberships, names: string[], mode: Mode, selKey: string, refX: number | null, profileAll = false) {
  const K = names.map((_, i) => i);
  const combos = mode === "inclusive" ? inclusiveCombos(d, K).combos : additiveCombos(d, K);
  const detail = (c: (typeof combos)[number]) => rowDetail(d, c.sets, c.contributors, K, null);
  const valCache = new Map<string, ReturnType<typeof rowValues>>();
  const sel = combos.find((c) => c.key === selKey)!;
  let refMark: RefMark | null = null;
  if (refX !== null && sel.contributors.includes(refX)) {
    const r = reference(d, refX, sel.sets, K, null);
    refMark = {
      who: d.ids[refX], label: referenceLabel(d.ids[refX], sel.sets.map((i) => names[i]), r.value), value: r.value,
      band: mode === "additive" ? { from: r.outside, to: r.inside, component: r.component } : null, membership: (i) => d.P[refX * d.L + i],
    };
  }
  const props: MatrixProps = {
    names, cols: K, mode, threshold: null, entries: displayEntries(combos, null, new Set(), null), lod: "auto", fisheye: false,
    N: d.N, range: d.N, R: d.N, G: null, onRange: noop, maxBin: Math.max(1, maxBinOf(combos.map(detail))), detail,
    values: (c) => valCache.get(c.key) ?? (valCache.set(c.key, rowValues(d, c.sets, c.contributors)), valCache.get(c.key)!),
    refElem: refMark ? refX : null, elemLabel: (x) => d.ids[x], onPick: noop, profileAll,
    groupAgg: () => ({ mass: 0, contributors: 0, rows: 0 }), query: null, selected: selKey, focusMode: false, reference: refMark,
    onSelect: noop, onToggleGroup: noop, tip: noop, onLeave: noop, headHists: K.map(() => [0, 0, 0, 0, 0]), headMax: 1, headTip: () => [],
    onHeaderDown: noop, headRef: { current: null }, dropActive: false, snapshots: [], onRemoveSnapshot: noop,
    rank: { epoch: 0, delta: new Map() }, ranking: combos.map((c) => c.key),
  };
  return renderToStaticMarkup(createElement(UpsetMatrix, props));
}
/** The plot area of a Full row (86 px): membership 0 at y = 62, 1 at y = 6. */
const yOf = (v: number) => 62 - v * 56;
const nums = (s: string) => s.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("element profile (fixture)", () => {
  it("clicking E1's point in inclusive A ∩ B: E1 becomes the reference; curve (A, 0.8) → (B, 0.7); dashed line at 0.70", () => {
    const E1 = 0;
    // the click: E1 becomes the reference and its row is selected; a second click clears it
    const picked = pickReference({ selected: null, refX: null }, "0,1", E1);
    expect(picked).toEqual({ selected: "0,1", refX: E1 });
    expect(pickReference(picked, "0,1", E1)).toEqual({ selected: "0,1", refX: null });
    expect(pickReference(picked, "1", E1)).toEqual({ selected: "1", refX: E1 });

    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", picked.selected, picked.refX);
    const curve = svg.match(/<path d="(M[^"]+)" fill="none" stroke="var\(--select\)" stroke-width="2"/)!;
    expect(curve).not.toBeNull();
    const v = nums(curve[1]);
    expect(v).toHaveLength(8); // M x0,y0 C c1 c2 p1: one segment
    expect(v[1]).toBeCloseTo(yOf(0.8), 1);
    expect(v[7]).toBeCloseTo(yOf(0.7), 1);
    expect(v[6] - v[0]).toBeCloseTo(116, 1); // same jitter offset, one cell apart
    const dashed = svg.match(/<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)" stroke="var\(--select\)" stroke-width="1.5" stroke-dasharray="4 3"/)!;
    expect(+dashed[1]).toBeCloseTo(yOf(0.7), 6);
    expect(svg).toContain(">E1: min(A, B) = 0.70</text>");
    expect(svg.match(/class="fu-pt-ref"/g)).toHaveLength(2);
  });
  it("additive AB: the band runs from 0.5 to 0.7", () => {
    const svg = renderMatrix(fx, ["A", "B", "C"], "additive", "0,1", 0);
    const band = svg.match(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="var\(--select\)" fill-opacity="0.14"/)!;
    expect(+band[1]).toBeCloseTo(yOf(0.7), 6);
    expect(+band[1] + +band[2]).toBeCloseTo(yOf(0.5), 6);
  });
  it("a single-set row: no curve, only the dashed line", () => {
    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", "1", 0);
    expect(svg).not.toMatch(/stroke="var\(--select\)" stroke-width="2"/);
    expect(svg).toContain(">E1: min(B) = 0.70</text>");
  });
  it("above 200 contributors: the violins without points, except the reference element's", () => {
    const rows = Array.from({ length: 250 }, (_, x) => [`P${x}`, 0.2 + 0.6 * rnd(), 0.2 + 0.6 * rnd()] as [string, number, number]);
    const d = data(rows);
    const many = renderMatrix(d, ["A", "B"], "inclusive", "0,1", 12);
    expect(many.match(/class="fu-pt"/g)).toBeNull();
    expect(many.match(/class="fu-pt-ref"/g)).toHaveLength(2);
    const few = renderMatrix(data(rows.slice(0, 150)), ["A", "B"], "inclusive", "0,1", 12);
    // rows A and B (Full, 150 points each) and A ∩ B (2 × 149 points plus the reference element's 2)
    expect(few.match(/class="fu-pt"/g)).toHaveLength(150 + 150 + 2 * 149);
  });
});
