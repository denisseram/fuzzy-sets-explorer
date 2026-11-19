// Test helper (not a test file): the fuzzy UpSet matrix rendered to static SVG markup for a dataset, mode and selection.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UpsetMatrix, { type MatrixProps, type RefMark } from "../components/UpsetMatrix";
import { additiveCombos, inclusiveCombos, maxBinOf, reference, rowDetail, rowValues, type Memberships, type Mode } from "./fuzzyDecomposition";
import { patternRows } from "./patterns";
import { displayEntries, referenceLabel } from "./upsetView";

const noop = () => {};
export function renderMatrix(d: Memberships, names: string[], mode: Mode, selKey: string | null, refX: number | null, profileAll = false, open: ReadonlySet<string> = new Set(), range = d.N) {
  const K = names.map((_, i) => i);
  const combos = mode === "inclusive" ? inclusiveCombos(d, K).combos : additiveCombos(d, K);
  const detail = (c: (typeof combos)[number]) => rowDetail(d, c.sets, c.contributors, K, null);
  const valCache = new Map<string, ReturnType<typeof rowValues>>();
  const sel = combos.find((c) => c.key === selKey);
  let refMark: RefMark | null = null;
  if (sel && refX !== null && sel.contributors.includes(refX)) {
    const r = reference(d, refX, sel.sets, K, null);
    refMark = {
      who: d.ids[refX], label: referenceLabel(d.ids[refX], sel.sets.map((i) => names[i]), r.value), value: r.value,
      band: mode === "additive" ? { from: r.outside, to: r.inside, component: r.component } : null, membership: (i) => d.P[refX * d.L + i],
    };
  }
  const props: MatrixProps = {
    names, cols: K, mode, threshold: null, lod: "auto", fisheye: false, open, onToggleOpen: noop,
    entries: displayEntries(combos, null, new Set(), null, { open, of: (c) => patternRows(d, c, K, null, mode, { names, cols: K }) }),
    N: d.N, range, R: Math.max(...combos.map((c) => c.contributors.length)), G: null, onRange: noop, maxBin: Math.max(1, maxBinOf(combos.map(detail))), detail,
    values: (c) => valCache.get(c.key) ?? (valCache.set(c.key, rowValues(d, c.sets, c.contributors)), valCache.get(c.key)!),
    refElem: refMark ? refX : null, elemLabel: (x) => d.ids[x], onPick: noop, profileAll,
    groupAgg: () => ({ mass: 0, contributors: 0, rows: 0 }), query: null, selected: selKey, focusMode: false, reference: refMark,
    onSelect: noop, onToggleGroup: noop, tip: noop, onLeave: noop, headHists: K.map(() => [0, 0, 0, 0, 0]), headMax: 1, headTip: () => [],
    onHeaderDown: noop, headRef: { current: null }, dropActive: false, snapshots: [], onRemoveSnapshot: noop,
    rank: { epoch: 0, delta: new Map() }, ranking: combos.map((c) => c.key),
  };
  return renderToStaticMarkup(createElement(UpsetMatrix, props));
}
