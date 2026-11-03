import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { obsLabel, useDataset } from "../lib/dataset";
import { cellsForKeys, composition, fractionsOf, meanOver, nearShare, NONE, setSizes, summarise } from "../lib/fuzzyUpset";
import { tauGrid, tauSweep } from "../lib/fuzzyViews";
import { OTHER } from "../lib/palette";
import { DEG_MAX, degreeSummaries, parentKey, upsetModel, visibleColumns } from "../lib/upsetModel";
import { attrDensity, attrScales } from "./attrHeatmap";
import MapView from "./MapView";
import MembershipStrip, { type StripGroup } from "./MembershipStrip";
import TauBarcode from "./TauBarcode";
import UpsetControls, { DEFAULT_DISPLAY, TAU_MAX, TAU_MIN, type Display } from "./UpsetControls";
import UpsetMatrix, { LIST_MAX, UpsetLegend, type Column, type ColumnInfo, type Comp } from "./UpsetMatrix";
import { CompositionDefs, compFill, N_ROWS } from "./upsetPatterns";
import "../styles/fuzzy-upset.css";

const MAX_COLS = 50;
const NONE_KEY = "__none";
const OTHER_KEY = "__other";

/** The current selection: a clicked column, or observations dragged on the map. */
type Selection = { cells: Set<number>; column: string | null };

/**
 * Fuzzy UpSet of the dataset's sets. Columns = combinations of sets (an observation is in every set whose membership
 * reaches τ); bars = fuzzy size (solid) and number of observations (outline); an observation is borderline when it
 * is near another set (membership from the near level up to τ), and a column can be split into sub-columns by what its observations are near; then
 * the dot matrix (grey rings where enough of a column is near a set, the hole shrinking as its mean membership rises), the composition by one or more
 * categories (one row each, added from the tray under the chart) and numerical attributes. Clicking a column
 * highlights its observations on the map (drawn through `mapEl`); the right panel (`vizEl`) shows the memberships
 * of each column and the τ barcode.
 */
export default function Upset({ mapEl = null, vizEl = null }: {
  /** Where to draw the map (the page's middle column); not drawn when null. */
  mapEl?: HTMLElement | null;
  /** Where to draw the right panel; not drawn when null. */
  vizEl?: HTMLElement | null;
}) {
  const ds = useDataset();
  const { sets, obsWord } = ds;
  const L = sets.names.length;
  const crisp = sets.kind === "crisp";

  // ---- parameters -------------------------------------------------------------------------------------------
  const [tauLive, setTauLive] = useState(0.5);
  // the slider shows tauLive at once; the (heavy) views follow the deferred τ, skipping stale values
  const tau = useDeferredValue(tauLive);
  const [display, setDisplay] = useState<Display>(DEFAULT_DISPLAY);
  /** Composition categories, one stacked-bar row each (null = the default single row). */
  const [compRaw, setCompKeys] = useState<string[] | null>(null);
  /** Category being dragged in the composition tray. */
  const [compDrag, setCompDrag] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"membership" | "barcode">("membership");
  /** The right panel opened large, over the page. */
  const [big, setBig] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  /** The column split into sub-columns (one at a time). */
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Observation marked on the map (or in the membership strip): its column is marked in the UpSet. */
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; rows: string[] } | null>(null);
  const clear = () => setSel(null);
  useEffect(() => {
    if (!sel && !big) return;
    // Esc closes the large view first, then clears the selection
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (big ? setBig(false) : setSel(null));
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel, big]);

  // ---- the model --------------------------------------------------------------------------------------------
  const nearLevel = tau * display.nearFrac;
  const model = useMemo(() => upsetModel(sets.P, L, tau, nearLevel), [sets, L, tau, nearLevel]);
  /** Per set: observations reaching τ and the sum of their memberships (the set bars). */
  const setSize = useMemo(() => setSizes(sets.P, L, tau), [sets, L, tau]);
  const { shown, rest, total, covered } = useMemo(
    () => visibleColumns(model.rows, { ...display, max: MAX_COLS }),
    [model, display],
  );
  // the columns not drawn individually, pooled by degree
  const summaries = useMemo(() => degreeSummaries(rest, L, display.sortKey), [rest, L, display.sortKey]);
  const summaryOf = useMemo(() => new Map(summaries.map((s) => [s.key, s])), [summaries]);
  /** Observations of a column, sub-column or summary. */
  const membersOf = useCallback(
    (key: string) => {
      const s = summaryOf.get(key);
      return s ? cellsForKeys(model.sig, s.combos.map((it) => it.key)) : model.members(key);
    },
    [summaryOf, model],
  );
  // the drawn columns: the visible ones, with the expanded column followed by its sub-columns; then the summaries, the
  // expanded one followed by its columns
  const { cols, colIdx } = useMemo(() => {
    const cols: Column[] = [];
    const colIdx = new Map<string, number[]>();
    for (const it of shown) {
      const isExp = expanded === it.key && it.nBorder > 0;
      cols.push({ key: it.key, labels: it.labels, n: it.n, nBorder: it.nBorder, fuzzy: it.fuzzy, sub: null, summary: null, listedIn: null, expandable: it.nBorder > 0, expanded: isExp });
      colIdx.set(it.key, model.members(it.key));
      if (!isExp) continue;
      for (const g of model.groups(it.key)) {
        const key = `${it.key}|${g.key}`;
        const fuzzy = g.idx.reduce((a, i) => a + model.sig.strength[i], 0);
        cols.push({
          key, labels: it.labels, n: g.idx.length, nBorder: g.kind === "pure" ? 0 : g.idx.length, fuzzy,
          sub: { parent: it.key, kind: g.kind, near: g.near }, summary: null, listedIn: null, expandable: false, expanded: false,
        });
        colIdx.set(key, g.idx);
      }
    }
    for (const s of summaries) {
      const isExp = expanded === s.key;
      cols.push({ key: s.key, labels: [], n: s.n, nBorder: s.nBorder, fuzzy: s.fuzzy, sub: null, summary: s, listedIn: null, expandable: true, expanded: isExp });
      colIdx.set(s.key, membersOf(s.key));
      if (!isExp) continue;
      for (const it of s.combos.slice(0, LIST_MAX)) {
        cols.push({ key: it.key, labels: it.labels, n: it.n, nBorder: it.nBorder, fuzzy: it.fuzzy, sub: null, summary: null, listedIn: s.key, expandable: false, expanded: false });
        colIdx.set(it.key, model.members(it.key));
      }
    }
    return { cols, colIdx };
  }, [shown, summaries, expanded, model, membersOf]);
  // a clicked column follows τ: its observations are those in the column at the current τ
  const selCells = useMemo(
    () => (sel?.column ? new Set(membersOf(sel.column)) : sel?.cells ?? null),
    [sel, membersOf],
  );

  // ---- per shown column: observations, mean memberships, typical observations, attributes --------------------
  const attrs = ds.numeric;
  const attrAll = useMemo(() => {
    const all = Array.from({ length: ds.N }, (_, i) => i);
    return attrs.map((a) => summarise(a.values, all, a.log)!);
  }, [attrs, ds.N]);
  const scales = useMemo(() => attrScales(attrs), [attrs]);
  const info = useMemo(() => {
    const m = new Map<string, ColumnInfo>();
    for (const c of cols) {
      const idx = colIdx.get(c.key)!;
      m.set(c.key, {
        idx,
        mean: meanOver(sets.P, idx, L),
        near: nearShare(sets.P, idx, L, tau, nearLevel),
        typical: [...idx].sort((a, b) => model.sig.strength[b] - model.sig.strength[a]).slice(0, 3),
        attr: attrs.map((a) => summarise(a.values, idx, a.log)),
        dens: attrs.map((a, r) => (a.plot === "density" ? attrDensity(a, idx, scales[r]) : null)),
        groups: c.sub || c.summary || c.nBorder === 0 ? null : model.groups(c.key),
      });
    }
    return m;
  }, [cols, colIdx, model, sets, L, attrs, scales, tau, nearLevel]);

  // ---- composition rows: the share of each column's observations in each category ---------------------------
  const catKeys = ds.categories.map((c) => c.key);
  const defaultComp = ["decade"].find((c) => catKeys.includes(c)) ?? catKeys[0];
  const kept = (compRaw ?? []).filter((c) => catKeys.includes(c));
  const compList = kept.length ? kept : defaultComp ? [defaultComp] : [];
  const compSig = compList.join("|");
  const comps = useMemo<Comp[]>(
    () => compList.flatMap((key) => {
      const cat = ds.categories.find((c) => c.key === key);
      if (!cat) return [];
      const comp = composition(model.sig, cat.codes, cat.names.length);
      for (const c of cols) if (c.sub || c.summary) comp.set(c.key, fractionsOf(colIdx.get(c.key)!, cat.codes, cat.names.length));
      return [{ cat, comp }];
    }),
    [model, ds, compSig, cols, colIdx],
  );
  const catTitle = (key: string) => ds.categories.find((c) => c.key === key)?.title ?? key;
  const compAvailable = catKeys.filter((c) => !compList.includes(c));
  function compDropOn(target: string | null) {
    const d = compDrag;
    setCompDrag(null);
    if (!d) return;
    const next = compList.filter((c) => c !== d);
    if (!compList.includes(d) && compList.length >= N_ROWS) return;
    const at = target ? next.indexOf(target) : -1;
    if (at < 0) next.push(d);
    else next.splice(compList.indexOf(d) >= 0 && compList.indexOf(d) < compList.indexOf(target!) ? at + 1 : at, 0, d);
    setCompKeys(next);
  }
  const allowCompDrop = (ev: React.DragEvent) => {
    if (!compDrag) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
  };

  // ---- selection --------------------------------------------------------------------------------------------
  /** Selects a column or sub-column (or clears the selection when it is already selected). */
  function selectKey(key: string) {
    if (sel?.column === key) return clear();
    const idx = membersOf(key);
    if (idx.length) setSel({ cells: new Set(idx), column: key });
  }
  function brush(cells: number[], add: boolean) {
    const set = new Set([...(add && selCells ? selCells : []), ...cells]);
    setSel(set.size ? { cells: set, column: null } : null);
  }
  /** Per shown column, how many selected observations it holds. */
  const selCounts = useMemo(() => {
    if (!selCells) return null;
    const m = new Map<string, number>();
    for (const c of cols) m.set(c.key, (info.get(c.key)?.idx ?? []).reduce((n, i) => n + (selCells.has(i) ? 1 : 0), 0));
    return m;
  }, [selCells, cols, info]);
  /** Sets of the columns that hold selected observations; the other sets' rows fade. */
  const selLabels = useMemo(() => {
    if (!selCounts) return null;
    const s = new Set<number>();
    for (const c of cols) if ((selCounts.get(c.key) ?? 0) > 0) for (const l of c.labels) s.add(l);
    return s;
  }, [selCounts, cols]);
  /** Selected observations the drawn columns and summaries don't hold: in no set at τ, or in a single-set column
   *  hidden by the filter. */
  const selOutside = useMemo(() => {
    if (!selCells || !selCounts) return null;
    let inShown = 0;
    for (const c of cols) if (!c.sub && !c.listedIn) inShown += selCounts.get(c.key) ?? 0;
    let none = 0;
    for (const i of selCells) if (model.sig.sig[i] === NONE) none++;
    return { none, hidden: selCells.size - inShown - none };
  }, [selCells, selCounts, cols, model]);
  const pickedKey = picked == null ? null : model.keyOf(picked);
  /** The summary holding the marked observation's column, when that column is not drawn individually. */
  const pickedSummary = pickedKey == null ? null : summaries.find((s) => s.combos.some((it) => it.key === pickedKey)) ?? null;
  /** The marked observation's column (or summary), and its sub-column when that column is expanded. */
  const pickedKeys = useMemo(() => {
    const s = new Set<string>();
    if (pickedKey == null || picked == null) return s;
    s.add(pickedKey);
    if (pickedSummary) s.add(pickedSummary.key);
    for (const c of cols) if (c.sub?.parent === pickedKey && colIdx.get(c.key)!.includes(picked)) s.add(c.key);
    return s;
  }, [pickedKey, pickedSummary, picked, cols, colIdx]);

  // ---- right panel: membership strip and τ barcode ------------------------------------------------------------
  const summaryName = (degree: number) => `${degree}${degree === DEG_MAX ? "+" : ""}-set combinations`;
  const keyName = (key: string): string =>
    summaryOf.has(key) ? `${summaryName(summaryOf.get(key)!.degree)} (${summaryOf.get(key)!.combos.length})`
    : key === NONE_KEY ? "in no set at τ" : key === "" ? "none" : key.split(",").map((l) => sets.names[+l]).join(" & ");
  /** Name of a column or sub-column ("Comedy & Romance · near Drama"). */
  const colName = (key: string) => {
    const bar = key.indexOf("|");
    if (bar < 0) return keyName(key);
    const g = key.slice(bar + 1);
    const what = g === "" ? "pure" : g === "*mixed" ? "mixed (near 3+ sets)" : g === "*other" ? "other borderline"
      : `near ${g.split(",").map((l) => sets.names[+l]).join(" & ")}`;
    return `${keyName(key.slice(0, bar))} · ${what}`;
  };
  const keyColors = (key: string) =>
    key === NONE_KEY || key === "" ? ["#C9CBD1"] : key.split(",").map((l) => sets.colors[+l] ?? OTHER);
  // membership strip: observations grouped by their column, in the UpSet's order
  const stripGroups = useMemo<StripGroup[]>(() => {
    if (!vizEl || rightTab !== "membership") return [];
    const s = model.sig;
    const byStrength = (idx: number[]) => idx.sort((a, b) => s.strength[b] - s.strength[a]);
    // the UpSet's visible columns, in its order; its summaries; anything else (single-set columns hidden by the
    // filter) in one "other" row; then those in no set
    const groups: StripGroup[] = shown.map((it) => ({ key: it.key, name: keyName(it.key), labels: it.labels, idx: byStrength(model.members(it.key)) }));
    for (const sm of summaries) groups.push({ key: sm.key, name: keyName(sm.key), labels: null, idx: byStrength(membersOf(sm.key)) });
    const inShown = new Set([...shown, ...rest].map((it) => it.key));
    const other: number[] = [], none: number[] = [];
    let nOther = 0;
    for (const key of s.keys) if (!inShown.has(key)) nOther++;
    for (let i = 0; i < s.sig.length; i++) {
      if (s.sig[i] < 0) none.push(i);
      else if (!inShown.has(s.keys[s.sig[i]])) other.push(i);
    }
    if (other.length) groups.push({ key: OTHER_KEY, name: `other columns (${nOther}, not in the UpSet view)`, labels: null, idx: byStrength(other) });
    if (none.length) groups.push({ key: NONE_KEY, name: "in no set at τ", labels: [], idx: none });
    return groups.filter((g) => g.idx.length);
  }, [vizEl, rightTab, model, shown, rest, summaries, membersOf, sets]);
  // τ barcode: every observation's combination for a sweep of τ
  const taus = useMemo(() => tauGrid(TAU_MIN, TAU_MAX, 19), []);
  const barcode = useMemo(
    () => (!vizEl || rightTab !== "barcode" ? null : tauSweep(sets.P, L, taus)),
    [vizEl, rightTab, sets, L, taus],
  );
  const barcodePicked = useMemo(() => {
    if (picked == null || !barcode) return null;
    return taus.map((t) => {
      const labs = Array.from({ length: L }, (_, l) => l).filter((l) => sets.P[picked * L + l] >= t - 1e-12);
      return labs.length ? labs.join(",") : null;
    });
  }, [picked, barcode, sets, L, taus]);

  const tip = (ev: React.MouseEvent, t: string, lines: string[]) => setHover({ x: ev.clientX, y: ev.clientY, title: t, rows: lines });

  const right = vizEl && (
    <div className={big ? "big-overlay" : "rt-host"} onClick={big ? (e) => e.target === e.currentTarget && setBig(false) : undefined}>
      <div className={`rt${big ? " rt-big" : ""}`} role={big ? "dialog" : undefined} aria-modal={big || undefined} aria-label={big ? "Large view" : undefined}>
        <div className="rt-bar">
          <div className="seg rt-tabs" role="tablist" aria-label="Right panel">
            <button role="tab" aria-selected={rightTab === "membership"} aria-pressed={rightTab === "membership"} onClick={() => setRightTab("membership")}>Membership</button>
            <button role="tab" aria-selected={rightTab === "barcode"} aria-pressed={rightTab === "barcode"} onClick={() => setRightTab("barcode")}>Barcode</button>
          </div>
          <button className="chip rt-big-btn" onClick={() => setBig(!big)} title={big ? "Close the large view (Esc)" : "Open this view large"}>
            {big ? "✕ Close" : "⤢ Enlarge"}
          </button>
        </div>
        <div className="rt-body">
          {rightTab === "membership" && (
            <MembershipStrip
              P={sets.P}
              L={L}
              names={sets.names}
              colors={sets.colors}
              groups={stripGroups}
              tau={null}
              title={sets.title}
              note={`one row per column (as in the UpSet): its ${obsWord}' mean memberships and, in grey, the share outside the column; click a name to see each ${obsWord.replace(/s$/, "")}`}
              active={selCells}
              picked={picked}
              onPick={setPicked}
              onSelectGroup={(key) => key !== NONE_KEY && key !== OTHER_KEY && selectKey(key)}
              obsName={(i) => obsLabel(ds, i)}
            />
          )}
          {rightTab === "barcode" && barcode && (
            <TauBarcode
              large={big}
              keys={barcode.keys}
              count={barcode.count}
              taus={taus}
              tau={tau}
              onTau={(t) => setTauLive(+t.toFixed(3))}
              nodeName={keyName}
              nodeColors={keyColors}
              selectedKey={sel?.column ? parentKey(sel.column) : null}
              onSelectKey={selectKey}
              picked={barcodePicked}
              title={sets.title}
              unit={obsWord}
              note={
                crisp
                  ? `Crisp sets: every combination exists at every τ, so all bands run the full width.`
                  : `x = τ; a band where the combination exists, thicker = more ${obsWord}; long bands are robust to τ, short ones depend on it. Click the track to set τ`
              }
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fu">
      <CompositionDefs />
      <UpsetControls
        setsTitle={sets.title} nSets={L} crisp={crisp} tau={tauLive} onTau={setTauLive}
        display={display} onDisplay={setDisplay} obsWord={obsWord} hasAttrs={attrs.length > 0}
      />

      <p className="panel-note fu-status" aria-live="polite">
        {selCells && (
          <span className="fu-selinfo">
            <i aria-hidden="true" />
            {selCells.size} {selCells.size === 1 ? obsWord.replace(/s$/, "") : obsWord} selected
            {sel?.column ? ` (column ${colName(sel.column)})` : " (dragged on the map; Shift-drag adds)"}
            {selOutside && (selOutside.hidden > 0 || selOutside.none > 0) &&
              ` · ${[selOutside.hidden > 0 ? `${selOutside.hidden} in columns not shown` : "", selOutside.none > 0 ? `${selOutside.none} in no set at τ` : ""].filter(Boolean).join(", ")}`}
          </span>
        )}
        {selCells && (
          <button className="chip fu-clear" onClick={clear} title="Clear the selection (Esc)">✕ Clear selection</button>
        )}
        {picked != null && (() => {
          const setName = pickedKey == null ? "no column (in no set at τ)" : keyName(pickedKey);
          const inView = pickedKey != null && (shown.some((it) => it.key === pickedKey) || pickedSummary != null);
          return (
            <span className="fu-pick">
              <svg width={10} height={10} aria-hidden="true"><path d="M1,1 L9,1 L5,8 Z" fill="var(--accent)" /></svg>
              <strong>{obsLabel(ds, picked)}</strong> in {setName}
              {pickedSummary ? ` (in the ${summaryName(pickedSummary.degree)})` : ""}
              {pickedKey != null && !inView ? " (column not shown: single-set columns are hidden)" : ""}
              <button className="fu-pick-x" onClick={() => setPicked(null)} aria-label={`Unmark this ${obsWord.replace(/s$/, "")}`}>✕</button>
            </span>
          );
        })()}
        <span className="fu-count">
          showing {shown.length} of {shown.length + rest.length} columns ({Math.round(covered * 100)}% of the {obsWord} in them)
          {summaries.length ? ` + ${rest.length} in ${summaries.length} ${summaries.length === 1 ? "summary" : "summaries"}` : ""}
          {total > MAX_COLS && shown.length === MAX_COLS ? ` (at most ${MAX_COLS})` : ""}
          {model.sig.nNone > 0 ? ` · ${model.sig.nNone} ${obsWord} in no set` : ""}
          {!crisp ? ` · near from ${nearLevel.toFixed(2)}` : ""}
        </span>
      </p>

      <div className="fu-scroll" onDragOver={allowCompDrop} onDrop={(ev) => (ev.preventDefault(), compDropOn(null))}>
        {cols.length === 0 ? (
          <p className="panel-note">No column passes the filters{!display.showSingle ? " (single-set columns are hidden)" : ""}.</p>
        ) : (
          <UpsetMatrix
            sets={sets} setSize={setSize} shown={cols} info={info} comps={comps} attrs={attrs} attrAll={attrAll} scales={scales}
            belowMode={display.belowMode} minShare={display.minShare} tau={tau} flip={display.flip} stat={display.stat} activeKey={sel?.column ?? null}
            pickedKeys={pickedKeys} selCounts={selCounts} selLabels={selLabels} obsWord={obsWord} title={(i) => obsLabel(ds, i)}
            colName={colName} onSelect={selectKey} onToggle={(key) => setExpanded((e) => (e === key ? null : key))}
            tip={tip} onLeave={() => setHover(null)}
          />
        )}
      </div>

      {catKeys.length > 0 && (
        <div
          className={`comp-tray${compDrag && !compList.includes(compDrag) ? " comp-tray-drop" : ""}`}
          onDragOver={allowCompDrop}
          onDrop={(ev) => (ev.preventDefault(), compDropOn(null))}
        >
          <span className="fc-lbl">Composition</span>
          {compList.map((c, r) => (
            <span
              key={c} className="chip comp-chip" draggable
              onDragStart={(ev) => (ev.dataTransfer.setData("text/plain", c), (ev.dataTransfer.effectAllowed = "move"), setCompDrag(c))}
              onDragEnd={() => setCompDrag(null)}
              onDragOver={allowCompDrop}
              onDrop={(ev) => (ev.preventDefault(), ev.stopPropagation(), compDropOn(c))}
              title="Drag onto another to reorder the rows"
            >
              <svg width={10} height={10} aria-hidden="true"><rect width={10} height={10} rx={2} fill={compFill(4, r)} /></svg>
              {catTitle(c)}
              {compList.length > 1 && (
                <button className="comp-x" onClick={() => setCompKeys(compList.filter((k) => k !== c))} aria-label={`Remove ${catTitle(c)}`}>✕</button>
              )}
            </span>
          ))}
          {compAvailable.length > 0 && <span className="comp-hint">drag to add:</span>}
          {compAvailable.map((c) => (
            <button
              key={c} className="chip comp-avail" draggable disabled={compList.length >= N_ROWS}
              onDragStart={(ev) => (ev.dataTransfer.setData("text/plain", c), (ev.dataTransfer.effectAllowed = "move"), setCompDrag(c))}
              onDragEnd={() => setCompDrag(null)}
              onClick={() => setCompKeys([...compList, c])}
              title={compList.length >= N_ROWS ? `At most ${N_ROWS} composition rows` : "Drag onto the composition (or click) to add a row"}
            >
              + {catTitle(c)}
            </button>
          ))}
        </div>
      )}

      <UpsetLegend belowMode={display.belowMode} minShare={display.minShare} tau={tau} stat={display.stat} hasAttrs={attrs.length > 0} comps={comps} obsWord={obsWord} />

      {hover && (
        <div className="dot-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="dot-tip-hd">{hover.title}</div>
          {hover.rows.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
      {mapEl && createPortal(
        <MapView highlight={selCells} picked={picked} onPick={setPicked} onBrush={brush} onClear={selCells ? clear : null} />,
        mapEl,
      )}
      {vizEl && big && createPortal(
        <div className="rt-placeholder">
          <p className="sk-note">Open in the large view.</p>
          <button className="chip" onClick={() => setBig(false)}>Back here</button>
        </div>,
        vizEl,
      )}
      {right && createPortal(right, big ? document.body : vizEl!)}
    </div>
  );
}
