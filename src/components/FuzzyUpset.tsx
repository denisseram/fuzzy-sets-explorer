import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { obsLabel, type Dataset } from "../lib/dataset";
import {
  aggregate, CELL_BUDGET, defaultSets, emptyCombos, isCrisp, issueSummary, jaccardMatrix, MAX_SETS, MAX_SETS_EMPTY_ROWS, maxBinOf, maxNonzeroDegree,
  maxRowCount, modeCombos, positiveHistogram, reference, ROW_BUDGET, rowDetail, rowValues, sigmaCounts, similarityOrder,
  type Combo, type Issue, type Memberships, type Mode, type RowDetail, type RowValues, type Threshold,
} from "../lib/fuzzyDecomposition";
import {
  applyFilters, describeClause, describeQuery, displayEntries, groupRows, neighbourhood, pickReference, queryMatches, rankChanges, referenceLabel, sortRows,
  type Clause, type Group, type GroupBy, type LodSetting, type QState, type SortBy,
} from "../lib/upsetView";
import { PATTERN_CUT, PATTERN_EPS, PATTERN_OPEN_ALL_MAX, patternRows, type PatternRow } from "../lib/patterns";
import { tipStyle } from "../lib/tip";
import MiniHist from "./MiniHist";
import Popover from "./Popover";
import ThresholdSidebar from "./ThresholdSidebar";
import UpsetMatrix, { type Agg, type RefMark, type Snapshot } from "./UpsetMatrix";
import "../styles/fuzzy-upset.css";

type Hover = { x: number; y: number; title: string; rows: string[] };
type SetOrder = "input" | "sigma" | "similarity";

const short = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const num = (v: number) => String(+v.toFixed(2));
const SORTS: [SortBy, string][] = [["degree", "Degree"], ["mass", "Membership mass"], ["contributors", "Contributors"], ["mean", "Mean contribution"]];
const GROUPS: [GroupBy, string][] = [["none", "None"], ["degree", "Degree"], ["set", "Set"], ["pairs", "Pairs"], ["setPairs", "Set → pairs"]];
const ORDERS: [SetOrder, string][] = [["input", "Input order"], ["sigma", "Sigma-count"], ["similarity", "Similarity"]];
const LODS: [LodSetting, string][] = [["auto", "Auto"], ["full", "Full"], ["compact", "Compact"], ["minimal", "Minimal"]];
const NEXT_Q: Record<QState, QState> = { may: "must", must: "not", not: "may" };

/** Metadata of one observation (categories and numerical attributes), for tooltips. */
function metaLine(ds: Dataset, i: number): string[] {
  const parts = [
    ...ds.categories.map((c) => (c.codes[i] >= 0 ? `${c.title} ${c.names[c.codes[i]]}` : "")),
    ...ds.numeric.map((a) => (Number.isFinite(a.values[i]) ? `${a.title} ${(+a.values[i]).toFixed(a.digits)}${a.unit ? " " + a.unit : ""}` : "")),
  ].filter(Boolean);
  return parts.length ? [parts.slice(0, 4).join(" · ")] : [];
}

/** UpSet's query symbols: must = dark disc, may = light disc with a dark dot, not = light ring. */
function QSym({ q }: { q: QState }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      {q === "must" && <circle cx={7} cy={7} r={5.5} fill="var(--ink)" />}
      {q === "may" && (<><circle cx={7} cy={7} r={5.5} fill="var(--rule)" /><circle cx={7} cy={7} r={2} fill="var(--ink)" /></>)}
      {q === "not" && <circle cx={7} cy={7} r={5} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} />}
    </svg>
  );
}

/**
 * One fuzzy UpSet plot with its controls bar, the set shelf, and (in threshold mode) the threshold sidebar. All numbers
 * come from lib/fuzzyDecomposition.ts, all display logic from lib/upsetView.ts.
 */
export default function FuzzyUpset({ ds, data, issues }: { ds: Dataset; data: Memberships; issues: Issue[] }) {
  const names = ds.sets.names;
  const L = data.L;
  const crisp = useMemo(() => isCrisp(data), [data]);
  const sigma = useMemo(() => sigmaCounts(data), [data]);
  const J = useMemo(() => jaccardMatrix(data), [data]);
  const setHists = useMemo(() => names.map((_, i) => positiveHistogram(data, [i])), [data, names]);
  const setHistMax = useMemo(() => Math.max(1, ...setHists.flat()), [setHists]);

  const [K, setK] = useState<number[]>(() => defaultSets(data));
  const [mode, setMode] = useState<Mode>("inclusive");
  const [thOn, setThOn] = useState(false);
  const [tauLive, setTauLive] = useState(0.5);
  const [perSetOn, setPerSetOn] = useState(false);
  const [tausLive, setTausLive] = useState<number[]>(() => new Array(L).fill(0.5));
  const tau = useDeferredValue(tauLive);
  const taus = useDeferredValue(tausLive);
  const [beta, setBeta] = useState(0.5);
  const [share, setShare] = useState(0.2);
  const [selected, setSelected] = useState<string | null>(null);
  const [refX, setRefX] = useState<number | null>(null);
  const [refText, setRefText] = useState("");
  const [profileAll, setProfileAll] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [cut, setCut] = useState(PATTERN_CUT);
  const [eps, setEps] = useState(PATTERN_EPS);
  const [hover, setHover] = useState<Hover | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [degLo, setDegLo] = useState<number | null>(null);
  const [degHi, setDegHi] = useState<number | null>(null);
  const [minMass, setMinMass] = useState(0);
  const [minContrib, setMinContrib] = useState(1);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("degree");
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [lod, setLod] = useState<LodSetting>("auto");
  const [fisheye, setFisheye] = useState(false);
  const [hop, setHop] = useState(0);
  const [supOnly, setSupOnly] = useState(false);
  const [setOrder, setSetOrder] = useState<SetOrder>("input");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [rangeSel, setRangeSel] = useState<number | null>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // ---- computation -------------------------------------------------------------------------------------------------

  const thActive = thOn && !crisp;
  const cutKey = !thActive ? "off" : perSetOn ? taus.join(",") : String(tau);
  const threshold = useMemo<Threshold | null>(
    () => (thActive ? { tau, beta, share, perSet: perSetOn ? taus : null } : null),
    [thActive, tau, beta, share, perSetOn, taus],
  );
  const cols = useMemo(() => {
    const k = [...K].sort((a, b) => a - b);
    if (setOrder === "sigma") return k.sort((a, b) => sigma[b] - sigma[a] || a - b);
    if (setOrder === "similarity") return similarityOrder(k, sigma, (a, b) => J[a * L + b]);
    return k;
  }, [K, setOrder, sigma, J, L]);

  const maxDeg = useMemo(() => maxNonzeroDegree(data, K, threshold), [data, K, cutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = Math.max(1, Math.min(degLo ?? 1, K.length));
  const hi = Math.max(lo, Math.min(degHi ?? Math.max(1, maxDeg), K.length));
  const emptyOk = K.length <= MAX_SETS_EMPTY_ROWS;
  const withEmpty = showEmpty && emptyOk;

  // minMass and the maximum degree also prune the inclusive enumeration
  const result = useMemo(
    () => modeCombos(data, K, mode, threshold, mode === "inclusive" ? { minMass: withEmpty ? 0 : minMass, maxDegree: hi, budget: ROW_BUDGET, cellBudget: CELL_BUDGET } : {}),
    [data, K, mode, cutKey, minMass, hi, withEmpty], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const all = useMemo(() => (withEmpty ? [...result.combos, ...emptyCombos(K, result.combos)] : result.combos), [result, withEmpty, K]);
  const filters = useMemo(() => ({ minDegree: lo, maxDegree: hi, minMass, minContributors: minContrib }), [lo, hi, minMass, minContrib]);
  const sorted = useMemo(() => sortRows(applyFilters(all, filters, withEmpty), sortBy, cols), [all, filters, withEmpty, sortBy, cols]);
  const ranking = useMemo(() => sorted.map((c) => c.key), [sorted]);

  // pattern rows of the open rows (lib/patterns.ts), computed once per row and setting
  const patternCache = useMemo(() => new Map<string, PatternRow[]>(), [all, cut, eps, threshold, K, cols, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const patternsOf = useCallback((c: Combo) => {
    let r = patternCache.get(c.key);
    if (!r) patternCache.set(c.key, (r = patternRows(data, c, K, threshold, mode, { cut, eps, names, cols })));
    return r;
  }, [patternCache, data, K, threshold, mode, cut, eps, names, cols]);

  // histograms and rings, per row (and pattern row), computed once per row and threshold
  const detailCache = useMemo(() => new Map<string, RowDetail>(), [result, threshold, K, patternCache]); // eslint-disable-line react-hooks/exhaustive-deps
  const detail = useCallback((c: Combo) => {
    let d = detailCache.get(c.key);
    if (!d) detailCache.set(c.key, (d = rowDetail(data, c.sets, c.contributors, K, threshold)));
    return d;
  }, [detailCache, data, K, threshold]);
  const maxBin = useMemo(() => Math.max(1, maxBinOf(sorted.map(detail))), [sorted, detail]);
  // the contributors' original memberships per cell: only for the rows drawn at Full detail (points and violins)
  const valuesCache = useMemo(() => new Map<string, RowValues>(), [all, patternCache]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = useCallback((c: Combo) => {
    let v = valuesCache.get(c.key);
    if (!v) valuesCache.set(c.key, (v = rowValues(data, c.sets, c.contributors)));
    return v;
  }, [valuesCache, data]);

  // queries (clauses on deselected sets are ignored)
  const activeClauses = useMemo(
    () => clauses.map((cl) => Object.fromEntries(Object.entries(cl).filter(([s]) => K.includes(+s))) as Clause),
    [clauses, K],
  );
  const query = useMemo(() => {
    if (!activeClauses.length) return null;
    const rows = sorted.filter((c) => queryMatches(c.sets, activeClauses));
    return { text: describeQuery(activeClauses, names, cols), agg: aggregate(rows, data.N), matches: new Set(rows.map((c) => c.key)) };
  }, [activeClauses, sorted, names, cols, data.N]);

  // groups
  const groups = useMemo(() => groupRows(sorted, groupBy, cols, names), [sorted, groupBy, cols, names]);
  const groupAgg = useMemo(() => {
    const cache = new Map<string, Agg>();
    return (g: Group) => {
      let a = cache.get(g.id);
      if (!a) cache.set(g.id, (a = aggregate(g.rows, data.N)));
      return a;
    };
  }, [groups, data.N]); // eslint-disable-line react-hooks/exhaustive-deps
  const G = useMemo(() => {
    if (!groups) return null;
    let m = 0;
    const walk = (gs: Group[]) => gs.forEach((g) => ((m = Math.max(m, groupAgg(g).contributors)), g.children && walk(g.children)));
    walk(groups);
    return m;
  }, [groups, groupAgg]);
  useEffect(() => setCollapsed(new Set()), [groupBy]);

  // selection, neighbourhood
  const selCombo = selected ? sorted.find((c) => c.key === selected) ?? null : null;
  useEffect(() => { if (selected && !selCombo) setSelected(null); }, [selected, selCombo]);
  const keep = useMemo(() => {
    if (!hop || !selCombo) return null;
    const s = neighbourhood(sorted, selCombo.sets, hop, supOnly);
    return (c: Combo) => s.has(c.key);
  }, [hop, selCombo, sorted, supOnly]);
  const entries = useMemo(
    () => displayEntries(sorted, groups, collapsed, keep, open.size ? { open, of: patternsOf } : null),
    [sorted, groups, collapsed, keep, open, patternsOf],
  );
  const openable = useMemo(() => sorted.filter((c) => c.sets.length > 1 && c.contributors.length > 0), [sorted]);
  const onToggleOpen = useCallback((key: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  }), []);
  const openShown = openable.filter((c) => open.has(c.key)).length;

  // rank changes after a change of mode, τ, sort or filters: coloured rows that fade, rows that move
  const sig = `${mode}|${cutKey}|${sortBy}|${degLo},${degHi},${minMass},${minContrib},${withEmpty}`;
  const rankRef = useRef({ sig, keys: ranking, delta: new Map<string, number>() as ReadonlyMap<string, number>, epoch: 0 });
  const rank = useMemo(() => {
    const prev = rankRef.current;
    if (prev.sig === sig) return { ...prev, keys: ranking };
    return { sig, keys: ranking, delta: rankChanges(prev.keys, ranking), epoch: prev.epoch + 1 };
  }, [sig, ranking]);
  useEffect(() => { rankRef.current = rank; }, [rank]);
  const rankView = useMemo(() => ({ epoch: rank.epoch, delta: rank.delta }), [rank.epoch, rank.delta]);

  // the bar scale: default range = the largest inclusive row (fixed across modes)
  const defaultRange = useMemo(() => Math.max(1, maxRowCount(data, K, threshold)), [data, K, cutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = rangeSel ?? defaultRange;
  const R = useMemo(() => Math.max(0, ...sorted.map((c) => c.contributors.length)), [sorted]);

  // reference element
  const contributors = selCombo ? selCombo.contributors : [];
  const contribSet = useMemo(() => new Set(contributors), [contributors]);
  useEffect(() => { if (refX !== null && !contribSet.has(refX)) (setRefX(null), setRefText("")); }, [refX, contribSet]);
  const optLabel = useCallback((x: number) => {
    const nm = obsLabel(ds, data.src[x]);
    return nm === data.ids[x] ? nm : `${nm} — ${data.ids[x]}`;
  }, [ds, data]);
  const byLabel = useMemo(() => new Map(contributors.map((x) => [optLabel(x), x])), [contributors, optLabel]);
  const refMark = useMemo<RefMark | null>(() => {
    if (!selCombo || refX === null || !contribSet.has(refX)) return null;
    const T = selCombo.sets;
    const r = reference(data, refX, T, K, threshold);
    const who = short(obsLabel(ds, data.src[refX]), 24);
    return {
      who,
      label: referenceLabel(who, cols.filter((i) => T.includes(i)).map((i) => names[i]), r.value),
      value: r.value,
      band: mode === "additive" ? { from: r.outside, to: r.inside, component: r.component } : null,
      membership: (i) => data.P[refX * data.L + i],
    };
  }, [selCombo, refX, contribSet, data, K, threshold, ds, cols, names, mode]);
  const elemLabel = useCallback((x: number) => short(obsLabel(ds, data.src[x]), 24), [ds, data]);
  const clearRef = useCallback(() => (setRefX(null), setRefText("")), []);
  // a click on a point: that element becomes the reference (input kept in sync) and its row is selected; again: clear
  const onPick = useCallback((key: string, x: number) => {
    const next = pickReference({ selected, refX }, key, x);
    setSelected(next.selected);
    setRefX(next.refX);
    setRefText(next.refX === null ? "" : optLabel(next.refX));
  }, [refX, selected, optLabel]);
  useEffect(() => {
    if (refX === null) return;
    // Escape clears the reference element, unless it closes an open popover
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]") && clearRef();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [refX, clearRef]);

  // ---- set selection: shelf chips and header drag ------------------------------------------------------------------

  const addSet = useCallback((i: number) => setK((k) => (k.includes(i) || k.length >= MAX_SETS ? k : [...k, i].sort((a, b) => a - b))), []);
  const removeSet = useCallback((i: number) => setK((k) => (k.length > 1 && k.includes(i) ? k.filter((j) => j !== i) : k)), []);
  const [drag, setDrag] = useState<{ set: number; kind: "add" | "remove"; x: number; y: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const inHead = (x: number, y: number) => {
    const r = headRef.current?.getBoundingClientRect();
    const box = headRef.current?.parentElement?.getBoundingClientRect();
    return !!r && !!box && x >= Math.max(r.left, box.left) && x <= Math.min(r.right, box.right) && y >= r.top && y <= r.bottom;
  };
  const startDrag = useCallback((set: number, kind: "add" | "remove", e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    setDrag({ set, kind, x: x0, y: y0, moved: false });
    const move = (ev: PointerEvent) => setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, moved: d.moved || Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6 });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const over = inHead(ev.clientX, ev.clientY);
      if (kind === "add" && (over || !d.moved)) addSet(set);
      if (kind === "remove" && d.moved && !over) removeSet(set);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [addSet, removeSet]);
  const onHeaderDown = useCallback((set: number, e: React.PointerEvent) => startDrag(set, "remove", e), [startDrag]);
  const headTip = useCallback((i: number) => {
    const sim = names.map((_, j) => j).filter((j) => j !== i).sort((a, b) => J[i * L + b] - J[i * L + a]).slice(0, 3);
    return [
      `sigma-count ${sigma[i].toFixed(1)}; histogram of its memberships > 0`,
      `most similar: ${sim.map((j) => `${names[j]} ${J[i * L + j].toFixed(2)}`).join(", ")} (fuzzy Jaccard)`,
      K.length > 1 ? "drag out of the header row to deselect" : "at least one set",
    ];
  }, [names, J, L, sigma, K.length]);
  const headHists = useMemo(() => cols.map((i) => setHists[i]), [cols, setHists]);
  /** Histogram of every membership > 0 in the selected sets (behind the τ slider). */
  const tauHist = useMemo(() => positiveHistogram(data, cols), [data, cols]);

  // ---- callbacks to the plot ---------------------------------------------------------------------------------------

  const tip = useCallback((ev: React.MouseEvent, title: string, lines: string[]) => setHover({ x: ev.clientX, y: ev.clientY, title, rows: lines }), []);
  const onLeave = useCallback(() => setHover(null), []);
  const onSelect = useCallback((key: string) => setSelected((s) => (s === key ? null : key)), []);
  const onToggleGroup = useCallback((id: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);
  const onRange = useCallback((v: number) => setRangeSel(v), []);
  const onRemoveSnapshot = useCallback((id: number) => setSnapshots((s) => s.filter((x) => x.id !== id)), []);

  const takeSnapshot = () => {
    const tauText = !threshold ? "τ off" : perSetOn ? "per-set τ" : `τ = ${num(tau)}`;
    const snap: Snapshot = {
      id: Date.now(),
      label: `${mode}, ${tauText}`,
      details: [
        `sort: ${SORTS.find(([v]) => v === sortBy)![1].toLowerCase()}`,
        `filters: degree ${lo}–${hi}, mass ≥ ${num(minMass)}${minMass ? "" : " (> 0)"}, contributors ≥ ${minContrib}${withEmpty ? ", empty rows shown" : ""}`,
        ...(threshold && perSetOn ? [`τ_i: ${cols.map((i) => `${names[i]} ${num(taus[i])}`).join(", ")}`] : []),
      ],
      keys: ranking,
      rows: new Map(sorted.map((c, r) => [c.key, { sets: c.sets, rank: r, mass: c.mass, count: c.contributors.length }])),
    };
    setSnapshots((s) => [...s, snap].slice(-2));
  };

  // ---- text ----------------------------------------------------------------------------------------------------------

  const nonzeroShown = sorted.filter((c) => c.mass > 0).length;
  const emptyShown = sorted.length - nonzeroShown;
  const lowerBound = mode === "inclusive" && (result.stoppedAt !== null || (!withEmpty && minMass > 0) || hi < maxDeg);
  const total = mode === "inclusive" ? result.nonzero : result.combos.length;
  const showing = `Showing ${nonzeroShown} of ${lowerBound ? "at least " : ""}${total} nonzero combinations${emptyShown ? ` and ${emptyShown} empty ${emptyShown === 1 ? "row" : "rows"}` : ""}`;
  const showingWhy = lowerBound
    ? [
      result.stoppedAt !== null ? `The enumeration stopped before degree ${result.stoppedAt} (${result.stoppedCandidates} candidates over the budget of ${ROW_BUDGET} rows or ${CELL_BUDGET / 1e6} M stored contributors).` : "",
      minMass > 0 && !withEmpty ? "Supersets of combinations below the minimum mass were not enumerated." : "",
      hi < maxDeg ? `Degrees above ${hi} were not enumerated.` : "",
    ].filter(Boolean).join(" ")
    : "";
  const note = issues.length ? issuesNote(issues, ds.obsWord) : null;
  const shelf = names.map((_, i) => i).filter((i) => !K.includes(i));
  const filterBadge = [degLo !== null || degHi !== null, minMass > 0, minContrib > 1, withEmpty].filter(Boolean).length;

  return (
    <div className="fu">
      <p className="fu-showing" title={showingWhy || undefined}>
        {showing}{result.stoppedAt !== null && <span className="fu-warn"> · enumeration stopped before degree {result.stoppedAt}: raise the minimum mass or lower the maximum degree</span>}
      </p>
      <div className="fc">
        <div className="fc-row">
          <div className="fc-item">
            <span className="fc-lbl">Mode</span>
            <div className="seg" role="group" aria-label="Mode">
              <button aria-pressed={mode === "inclusive"} onClick={() => setMode("inclusive")} title="Membership in every set of the row (min); other sets unrestricted">Inclusive intersections</button>
              <button aria-pressed={mode === "additive"} onClick={() => setMode("additive")} title="Membership above the element's memberships in the other selected sets; the masses add up">Additive contributions</button>
            </div>
          </div>
          <div className="fc-item">
            <label className="fc-lbl" htmlFor="fu-ref">Reference element</label>
            <input
              id="fu-ref" className="fu-ref" list="fu-ref-list" value={refText} disabled={!selCombo || !contributors.length}
              placeholder={!selCombo ? "select a row first" : contributors.length ? `search ${contributors.length} contributors` : "no contributors"}
              onChange={(e) => (setRefText(e.target.value), setRefX(byLabel.get(e.target.value) ?? null))}
            />
            <datalist id="fu-ref-list">{contributors.slice(0, 2000).map((x) => <option key={x} value={optLabel(x)} />)}</datalist>
            {refText && <button className="fu-link" aria-label="Clear the reference element" onClick={clearRef}>✕</button>}
            <label className="fc-check" title="Draw the reference element's profile in every visible Full row where it contributes, not only in the selected row">
              <input type="checkbox" checked={profileAll} onChange={(e) => setProfileAll(e.target.checked)} /> Profile in all rows
            </label>
          </div>
          <button
            className="fc-btn" aria-pressed={thActive} disabled={crisp} onClick={() => setThOn(!thOn)}
            title={crisp ? "Crisp memberships (0 or 1): τ has no effect" : thOn ? "Turn threshold mode off" : "Count only memberships that reach τ"}
          >
            Threshold{thActive ? (perSetOn ? " per set" : ` τ = ${tauLive.toFixed(2)}`) : ""}
          </button>
          <button className="fc-btn" onClick={takeSnapshot} title={`Store the current ranking with its settings (at most 2; a third replaces the oldest)${snapshots.length ? `. Stored: ${snapshots.map((s) => s.label).join("; ")}` : ""}`}>
            Snapshot{snapshots.length ? <span className="fc-badge">{snapshots.length}</span> : null}
          </button>
        </div>
        <div className="fc-row">
          <label className="fc-item"><span className="fc-lbl">Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>{SORTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </label>
          <label className="fc-item"><span className="fc-lbl">Group by</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>{GROUPS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </label>
          <label className="fc-item" title="Column order; rows sorted by degree break ties by this order"><span className="fc-lbl">Set order</span>
            <select value={setOrder} onChange={(e) => setSetOrder(e.target.value as SetOrder)}>{ORDERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </label>
          <label className="fc-item" title="Level of detail per cell: Full = points and half violin, Compact = vertical grayscale strip, Minimal = circles only. Auto: the selected row (and the fish-eye focus) Full, the others at the largest level at which all rows fit"><span className="fc-lbl">Rows</span>
            <select value={lod} onChange={(e) => setLod(e.target.value as LodSetting)}>{LODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </label>
          <label className="fc-item fc-check" title="When rows overflow: the hovered or selected row and 3 neighbours on each side get full height">
            <input type="checkbox" checked={fisheye} onChange={(e) => setFisheye(e.target.checked)} /> Fish-eye
          </label>
          <Popover label="Filters" badge={filterBadge ? String(filterBadge) : null} title="Degree range, minimum mass and contributors, empty rows">
            <p className="panel-title">Filters</p>
            <label className="fp-row" title={emptyOk ? "Also show combinations with zero mass in the active mode (only the degree range applies to them)" : `Too many rows: available up to ${MAX_SETS_EMPTY_ROWS} selected sets`}>
              <input type="checkbox" checked={withEmpty} disabled={!emptyOk} onChange={(e) => setShowEmpty(e.target.checked)} /> Show empty rows
            </label>
            <div className="fp-row">
              <span className="fp-lbl">Degree</span>
              <select aria-label="Minimum degree" value={lo} onChange={(e) => setDegLo(+e.target.value)}>
                {K.map((_, d) => <option key={d} value={d + 1}>{d + 1}</option>)}
              </select>
              to
              <select aria-label="Maximum degree" value={hi} onChange={(e) => setDegHi(+e.target.value)}>
                {K.map((_, d) => <option key={d} value={d + 1} disabled={d + 1 < lo}>{d + 1}{d + 1 === maxDeg ? " (max nonzero)" : ""}</option>)}
              </select>
            </div>
            <label className="fp-row"><span className="fp-lbl">Min. mass</span>
              <input type="number" min={0} step={0.1} value={minMass} onChange={(e) => setMinMass(Math.max(0, +e.target.value || 0))} />
              <span className="fp-hint">{minMass ? "" : "0 = any mass > 0"}</span>
            </label>
            <label className="fp-row"><span className="fp-lbl">Min. contributors</span>
              <input type="number" min={1} step={1} value={minContrib} onChange={(e) => setMinContrib(Math.max(1, Math.round(+e.target.value || 1)))} />
            </label>
            <p className="fp-hint">In inclusive mode the minimum mass and the maximum degree also prune the enumeration.</p>
            <button className="fu-link" onClick={() => (setDegLo(null), setDegHi(null), setMinMass(0), setMinContrib(1), setShowEmpty(false))}>Reset filters</button>
          </Popover>
          <Popover label="Query" badge={activeClauses.length ? String(query?.agg.rows ?? 0) : null} title="Select combinations: each set must / may / not be in the row; OR between clauses" wide>
            <p className="panel-title">Query</p>
            <p className="fp-hint">Click a symbol to cycle: <QSym q="may" /> may · <QSym q="must" /> must · <QSym q="not" /> not. A row matches if it matches any clause.</p>
            <div className="q-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, 22px) 1fr 18px` }}>
              {cols.map((i) => <span key={i} className="q-head" title={names[i]}>{short(names[i], 4)}</span>)}
              <span /><span />
              {clauses.map((cl, ci) => [
                ...cols.map((i) => {
                  const q = cl[i] ?? "may";
                  return (
                    <button
                      key={`${ci}-${i}`} className="q-cell" aria-label={`${names[i]}: ${q}`} title={`${names[i]}: ${q}`}
                      onClick={() => setClauses((cs) => cs.map((c, j) => (j === ci ? { ...c, [i]: NEXT_Q[q] } : c)))}
                    >
                      <QSym q={q} />
                    </button>
                  );
                }),
                <span key={`t${ci}`} className="q-text">{ci > 0 ? "OR " : ""}{describeClause(activeClauses[ci], names, cols)}</span>,
                <button key={`x${ci}`} className="fu-link" aria-label="Remove this clause" onClick={() => setClauses((cs) => cs.filter((_, j) => j !== ci))}>✕</button>,
              ])}
            </div>
            <div className="q-actions">
              <button className="fc-btn" onClick={() => setClauses((cs) => [...cs, {}])}>{clauses.length ? "+ OR clause" : "+ Clause"}</button>
              {clauses.length > 0 && <button className="fu-link" onClick={() => setClauses([])}>Clear</button>}
            </div>
            {query && <p className="fp-hint">{query.agg.rows ? `${query.agg.rows} of ${sorted.length} shown combinations match` : "No shown combination matches."}</p>}
          </Popover>
          <Popover label="Patterns" badge={openShown ? String(openShown) : null} title="Split rows by the joint pattern of their contributors' memberships (▸ on a row opens one)">
            <p className="panel-title">Patterns</p>
            <p className="fp-hint">
              A row opens (▸) into pattern rows: all high, each mix of high and low, all low, and about equal (high, middle,
              low), from the contributors' original memberships in the row's sets. They split the row's contributors and
              mass. Full rows also show ribbons between neighbouring set axes: contributors from one membership bin to the next.
            </p>
            <div className="q-actions">
              <button className="fc-btn" disabled={!openable.length} onClick={() => setOpen(new Set(openable.slice(0, PATTERN_OPEN_ALL_MAX).map((c) => c.key)))}>Open all</button>
              <button className="fu-link" disabled={!open.size} onClick={() => setOpen(new Set())}>Close all</button>
            </div>
            {openable.length > PATTERN_OPEN_ALL_MAX && <p className="fp-hint">Open all opens the first {PATTERN_OPEN_ALL_MAX} of {openable.length} rows.</p>}
            <label className="fp-row"><span className="fp-lbl">High from</span>
              <input type="number" min={0.05} max={0.95} step={0.05} value={cut} onChange={(e) => setCut(Math.min(0.95, Math.max(0.05, +e.target.value || PATTERN_CUT)))} />
            </label>
            <label className="fp-row"><span className="fp-lbl">Equal within</span>
              <input type="number" min={0} max={0.5} step={0.05} value={eps} onChange={(e) => setEps(Math.min(0.5, Math.max(0, +e.target.value || 0)))} />
              <span className="fp-hint">max − min</span>
            </label>
            <p className="fp-hint">Equal rows: high if the mean is ≥ {num(cut + 0.1)}, low if &lt; {num(cut - 0.1)}, middle otherwise.</p>
          </Popover>
          {selCombo && (
            <div className="fc-item" title="Lattice distance |T Δ S|: the number of sets added or removed">
              <span className="fc-lbl">Neighbourhood</span>
              <div className="seg" role="group" aria-label="Neighbourhood distance">
                {[0, 1, 2, 3].map((d) => <button key={d} aria-pressed={hop === d} onClick={() => setHop(d)}>{d ? d : "Off"}</button>)}
              </div>
              <label className="fc-check" title="Keep only supersets S ⊇ T of the selected row T. In additive mode, the components of all supersets of T add up to T's inclusive mass.">
                <input type="checkbox" checked={supOnly} disabled={!hop} onChange={(e) => setSupOnly(e.target.checked)} /> Supersets only
              </label>
            </div>
          )}
        </div>
      </div>
      {note && <p className="fu-excl" title={note.detail}>⚠ {note.text}</p>}
      <div className="fu-body">
        <div className="fu-plot">
          <div className="fu-shelf" role="group" aria-label={`${ds.sets.title} not selected`}>
            <span className="fc-lbl" title="Click or drag a set into the header row to select it; drag a header out to deselect it">Sets ({K.length} of max {MAX_SETS})</span>
            {shelf.map((i) => {
              const full = K.length >= MAX_SETS;
              return (
                <button
                  key={i} className="chip shelf-chip" disabled={full} onPointerDown={full ? undefined : (e) => startDrag(i, "add", e)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), addSet(i))}
                  title={full ? `At most ${MAX_SETS} sets` : `${names[i]}: sigma-count ${sigma[i].toFixed(1)}. Click or drag into the header row to select`}
                >
                  {short(names[i], 18)}
                  <MiniHist counts={setHists[i]} max={setHistMax} tau={thActive ? (perSetOn ? taus[i] : tau) : null} />
                </button>
              );
            })}
            {!shelf.length && <span className="fp-hint">all sets selected</span>}
          </div>
          <UpsetMatrix
            names={names} cols={cols} mode={mode} threshold={threshold} entries={entries} lod={lod} fisheye={fisheye}
            N={data.N} range={range} R={R} G={G} onRange={onRange} maxBin={maxBin} detail={detail} groupAgg={groupAgg} query={query}
            values={values} refElem={refMark ? refX : null} elemLabel={elemLabel} onPick={onPick} profileAll={profileAll} open={open} onToggleOpen={onToggleOpen}
            selected={selected} focusMode={!!keep} reference={refMark} onSelect={onSelect} onToggleGroup={onToggleGroup} tip={tip} onLeave={onLeave}
            headHists={headHists} headMax={setHistMax} headTip={headTip} onHeaderDown={onHeaderDown} headRef={headRef}
            dropActive={!!drag?.moved && drag.kind === "add"} snapshots={snapshots} onRemoveSnapshot={onRemoveSnapshot} rank={rankView} ranking={ranking}
          />
        </div>
        {thActive && (
          <ThresholdSidebar
            names={names} cols={cols} tau={tauLive} onTau={setTauLive} perSet={perSetOn}
            onPerSet={(on) => (on && setTausLive(new Array(L).fill(tauLive)), setPerSetOn(on))}
            taus={tausLive} onSetTau={(i, v) => setTausLive((t) => t.map((x, j) => (j === i ? v : x)))}
            beta={beta} onBeta={setBeta} share={share} onShare={setShare}
            hist={tauHist} setHists={headHists} histMax={setHistMax}
          />
        )}
      </div>
      {drag?.moved && <div className="drag-ghost" style={{ left: drag.x + 10, top: drag.y + 8 }}>{drag.kind === "add" ? "+ " : "− "}{names[drag.set]}</div>}
      {hover && (
        <div className="dot-tip" style={tipStyle(hover.x, hover.y)}>
          <div className="dot-tip-hd">{hover.title}</div>
          {hover.rows.map((r, k) => <div key={k}>{r}</div>)}
          {hover.title === refMark?.label && refX !== null && metaLine(ds, data.src[refX]).map((r, k) => <div key={`m${k}`} className="dot-tip-hint">{r}</div>)}
        </div>
      )}
    </div>
  );
}

function issuesNote(issues: Issue[], word: string) {
  const detail = issues.slice(0, 20).map((s) => `${s.id}: ${s.detail}`).join("\n") + (issues.length > 20 ? `\n… and ${issues.length - 20} more` : "");
  return { text: issueSummary(issues, word)!, detail };
}
