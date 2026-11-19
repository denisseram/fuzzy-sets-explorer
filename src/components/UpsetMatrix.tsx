import { scaleLinear, select } from "d3";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { binLabel, BIN_EDGES, N_BINS, tauOf, type Combo, type Mode, type RowDetail, type RowValues, type Threshold } from "../lib/fuzzyDecomposition";
import { holeRadius } from "../lib/fuzzyUpset";
import {
  autoFullRows, countEntries, horizon, layout, lodOf, MAX_WRAPS, rankChangeIntensity, rankChanges, ROW_FULL, rowHeight, stubText, type Entry, type Group, type LodSetting, type Placed,
} from "../lib/upsetView";
import { indexOfSorted, jitter, MAX_POINTS, pointsToDraw, profilePath, VIOLIN_STEPS, violinOf } from "../lib/violin";
import { isPatternRow, PATTERN_COUNT_MIN, ribbonGeometry, ribbonsOf, type PatternRow } from "../lib/patterns";
import { HistBars } from "./MiniHist";

/** Width of the column-header histograms (membership 0 left, 1 right) and the largest half-violin width (a count). */
export const HIST_W = 72;
/** Circles: one size for every set slot (smaller in short rows); a ring is the same disc in grey with a white hole. */
const DOT_R = 6.5, HOLE_MIN = 1.5, HOLE_MAX = 5;
/**
 * Matrix cell: the points' jitter strip (JIT_W) left of the vertical membership axis at AXIS_X, the half violin right of
 * it (up to HIST_W). The circle sits under the axis; the header histogram starts at the axis.
 */
const CELL_W = 116, AXIS_X = 30, JIT_W = 22, CIRCLE_X = AXIS_X, HIST_X = AXIS_X;
/** Points: radius, and radius of the reference element's points. */
const PT_R = 2.5, PT_R_REF = 4;
/** Full rows: the plot area from PLOT_TOP to h − CIRCLE_STRIP (membership 1 at the top), the circles in the strip below. */
const PLOT_TOP = 6, CIRCLE_STRIP = 24;
/** Compact rows: a vertical strip of the 5 bins right of the circle. */
const STRIP_X = AXIS_X + 10, STRIP_W = 16;
const GRID = [0.2, 0.4, 0.6, 0.8];
/** Left edge of the jitter strip and centre of an element's point in a cell (relative to the cell). */
const JIT_X = AXIS_X - 2 - JIT_W;
const pointDx = (x: number) => AXIS_X - 2 - PT_R - jitter(x) * (JIT_W - 2 * PT_R);
/** Summary bars, left of the matrix, growing leftward from its edge. */
const PAD = 22, BAR_W = 150, BAR_H = 12, GAP = 14;
/** Header: bar key, two-axis scale, set names with their histograms. */
const HEAD = 84, TOP_Y = 34, LOW_Y = 76;
/** The pinned query row under the header. */
const QUERY_H = 26;
/** Room right of the matrix for the reference label and group labels. */
const LABEL_W = 210;
/** Snapshots: slope band + a column of mini glyphs (one dot per selected set). */
const SLOPE_W = 44, SNAP_DOT = 5;
/** Group header row height. */
const headerH = (rowH: number) => Math.max(18, Math.min(22, rowH));
/** Rows rendered beyond the visible part of the scroll area (px). */
const OVERSCAN = 300;

export type Tip = (ev: React.MouseEvent, title: string, lines: string[]) => void;
export type Agg = { mass: number; contributors: number; rows: number };

/** The selected element's reference in the selected row. */
export type RefMark = {
  who: string;
  label: string;
  value: number;
  /** Additive mode: the band from the outside maximum to the inside minimum (its width is the component). */
  band: { from: number; to: number; component: number } | null;
  /** Per set of the dataset: the element's original membership. */
  membership: (set: number) => number;
};

export type SnapRow = { sets: number[]; rank: number; mass: number; count: number };
export type Snapshot = { id: number; label: string; details: string[]; keys: string[]; rows: Map<string, SnapRow> };

const fmt = (v: number) => v.toFixed(2);
const plural = (n: number, w = "element") => `${n} ${n === 1 ? w : w + "s"}`;
const dotR = (h: number) => Math.max(1.5, Math.min(DOT_R, h / 2 - 1));

/** One set slot: a member (black disc), out (light grey disc) or ring (grey disc with a white hole of radius `hole`). */
export function Dot({ cx, cy, r = DOT_R, member, hole = 0, may = false }: { cx: number; cy: number; r?: number; member: boolean; hole?: number; may?: boolean }) {
  if (member) return <circle cx={cx} cy={cy} r={r} fill="var(--ink)" />;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={hole > 0 ? "var(--near-ring)" : "var(--rule)"} />
      {hole > 0 && <circle cx={cx} cy={cy} r={hole} fill="var(--panel)" />}
      {may && <circle cx={cx} cy={cy} r={Math.max(1, r * 0.35)} fill="var(--ink)" />}
    </>
  );
}

/** A set slot of a pattern row: high = filled disc, low = ring, in the pattern colour; equal and other: half-tone. */
function PatDot({ cx, cy, r, pat, set }: { cx: number; cy: number; r: number; pat: PatternRow; set: number }) {
  const k = pat.pattern.kind;
  if (k === "equal" || k === "other" || k === "count") return <circle cx={cx} cy={cy} r={r} fill="var(--row-c)" fillOpacity={0.55} />;
  const high = k === "allHigh" || pat.pattern.high.includes(set);
  return high ? <circle cx={cx} cy={cy} r={r} fill="var(--row-c)" /> : <circle cx={cx} cy={cy} r={r - 0.9} fill="var(--panel)" stroke="var(--row-c)" strokeWidth={1.8} />;
}

/**
 * A half violin right of the axis at `ax`: f (elements per 0.2 of membership, at y = 0, 0.02, …, 1) as a width on the
 * shared scale `maxF` (HIST_W px), membership on the vertical axis `yOf`.
 */
function Violin({ ax, f, maxF, yOf, color }: { ax: number; f: Float64Array; maxF: number; yOf: (v: number) => number; color: string }) {
  if (!(maxF > 0)) return null;
  let d = `M${ax},${yOf(0).toFixed(1)}`;
  for (let i = 0; i < VIOLIN_STEPS; i++) d += `L${(ax + (f[i] / maxF) * HIST_W).toFixed(1)},${yOf(i / (VIOLIN_STEPS - 1)).toFixed(1)}`;
  d += `L${ax},${yOf(1).toFixed(1)}Z`;
  return <path d={d} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />;
}

/** Compact level: the 5 bins as grayscale cells stacked bottom ([0, 0.2)) to top (darker = more elements, shared count scale). */
function VStrip({ x, y, h, counts, maxC, ring = false, color = "var(--ink)" }: { x: number; y: number; h: number; counts: number[]; maxC: number; ring?: boolean; color?: string }) {
  const bh = h / N_BINS;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={STRIP_W} height={h} fill="none" stroke="var(--axis)" strokeWidth={0.6} />
      {counts.map((c, b) => c > 0 && (
        <rect key={b} x={x} y={y + (N_BINS - 1 - b) * bh} width={STRIP_W} height={bh} fill={ring ? "var(--near-ring)" : color} fillOpacity={(ring ? 0.5 : 1) * (0.1 + 0.85 * (c / Math.max(1, maxC)))} />
      ))}
    </g>
  );
}

/** Upper edge of display bin b. */
const binTop = (b: number) => (b === N_BINS - 1 ? 1 : BIN_EDGES[b + 1]);

/** Hatch of wrap t (1: 45°, 2: 135°, 3: both), dark lines on the light contributors bar, light lines on the mass bar. */
const hatchOf = (kind: "count" | "mass", t: number) => `url(#fu-hatch-${kind === "count" ? "dark" : "light"}-${t === 1 ? "a" : t === 2 ? "b" : "x"})`;

/** The hatch patterns of the wrap layers (in the header SVG; ids are document-wide, like the arrow marker). */
function HatchDefs() {
  return (
    <>
      {(["dark", "light"] as const).map((tone) => (
        <g key={tone}>
          {([["a", 45], ["b", -45]] as const).map(([d, a]) => (
            <pattern key={d} id={`fu-hatch-${tone}-${d}`} className={`fu-hatch-${tone}`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform={`rotate(${a})`}>
              <line x1={0} y1={0} x2={0} y2={4} />
            </pattern>
          ))}
          {/* cross-hatch: both directions in one tile */}
          <pattern id={`fu-hatch-${tone}-x`} className={`fu-hatch-${tone}`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={4} />
            <line x1={0} y1={0} x2={4} y2={0} />
          </pattern>
        </g>
      ))}
    </>
  );
}

/** "longer than the range (500): contributors 3 × range + 120, mass 1 × range + 40" (null when nothing wraps). */
function wrapLine(count: number, mass: number, range: number): string | null {
  const part = (name: string, v: number, f: (x: number) => string) => {
    const hz = horizon(v, range);
    if (!hz.wraps) return null;
    return hz.broken ? `${name} more than ${MAX_WRAPS + 1} × range` : `${name} ${hz.wraps} × range + ${f(hz.remainder)}`;
  };
  const parts = [part("contributors", count, (x) => String(Math.round(x))), part("mass", mass, (x) => x.toFixed(2))].filter(Boolean);
  return parts.length ? `longer than the range (${range}): ${parts.join(", ")}` : null;
}
const wrapLines = (count: number, mass: number, range: number) => {
  const w = wrapLine(count, mass, range);
  return w ? [w] : [];
};

/**
 * A count or mass bar on the adjustable axis, growing leftward from `right`. Beyond the range it wraps (UpSet's horizon
 * bars): each wrap is drawn narrower over the previous layer in the same colour, marked by a hatch (45°, 135°, both),
 * so colour keeps meaning the measure; beyond 3 wraps a break symbol.
 */
function HBar({ v, range, right, cy, h, kind }: { v: number; range: number; right: number; cy: number; h: number; kind: "count" | "mass" }) {
  if (!(v > 0)) return null;
  const hz = horizon(v, range);
  const px = (u: number) => (u / range) * BAR_W;
  const layers: ReactNode[] = [];
  for (let t = 0; t <= hz.wraps; t++) {
    const len = t < hz.wraps ? range : hz.remainder;
    const hh = Math.max(1.5, h * (1 - 0.24 * t));
    const geo = { x: right - px(len), y: cy - hh / 2, width: px(len), height: hh, rx: t ? 1 : 2 };
    layers.push(
      <g key={t}>
        {/* a wrap of the light bar has no fill of its own (stacked tints would darken it): outline + hatch */}
        <rect {...geo} className={kind === "count" ? "fu-bar fu-bar-out" : "fu-bar fu-bar-in"} style={t && kind === "count" ? { fillOpacity: 0 } : undefined} />
        {t > 0 && <rect {...geo} className="fu-bar fu-bar-wrap" fill={hatchOf(kind, t)} pointerEvents="none" />}
      </g>,
    );
  }
  return (
    <>
      {layers}
      {hz.broken && (
        <g className="fu-break">
          <line x1={right - BAR_W + 6} x2={right - BAR_W + 10} y1={cy + h / 2 + 1} y2={cy - h / 2 - 1} />
          <line x1={right - BAR_W + 10} x2={right - BAR_W + 14} y1={cy + h / 2 + 1} y2={cy - h / 2 - 1} />
        </g>
      )}
    </>
  );
}

/** A row group that moves with a 400 ms transition when the ranking changes and flashes its rank change. */
function Moving({ id, y, prev, animate, epoch, delta, width, h, children, ...rest }: {
  id: string; y: number; prev: RefObject<Map<string, number>>; animate: boolean; epoch: number; delta: number; width: number; h: number;
  children: ReactNode;
} & React.SVGProps<SVGGElement>) {
  const ref = useRef<SVGGElement>(null);
  const flash = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    const g = select(ref.current!);
    const from = prev.current?.get(id);
    g.interrupt();
    if (animate && from !== undefined && from !== y) g.attr("transform", `translate(0,${from})`).transition().duration(400).attr("transform", `translate(0,${y})`);
    else g.attr("transform", `translate(0,${y})`);
  }, [y]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!animate || !delta || !flash.current) return;
    select(flash.current).interrupt().attr("fill-opacity", rankChangeIntensity(delta)).transition().duration(2000).attr("fill-opacity", 0);
  }, [epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g ref={ref} transform={`translate(0,${y})`} {...rest}>
      {children}
      <rect ref={flash} x={PAD} y={0} width={width - PAD} height={h} fill={delta > 0 ? "var(--rank-up)" : "var(--rank-down)"} fillOpacity={0} pointerEvents="none" />
    </g>
  );
}

export type MatrixProps = {
  names: string[];
  /** Selected sets in column order. */
  cols: number[];
  mode: Mode;
  threshold: Threshold | null;
  entries: Entry[];
  lod: LodSetting;
  fisheye: boolean;
  /** Number of elements (top axis 0–N). */
  N: number;
  /** Range of the lower axis used by the bars. */
  range: number;
  /** Largest row count (R) and largest group count (G). */
  R: number;
  G: number | null;
  onRange: (v: number) => void;
  /** Shared count scale of every compact strip. */
  maxBin: number;
  detail: (c: Combo) => RowDetail;
  /** Per set of a row: the contributors' original memberships (points and violins of Full rows). */
  values: (c: Combo) => RowValues;
  /** The reference element (index into the memberships), its short label for tooltips, and the click on a point. */
  refElem: number | null;
  elemLabel: (x: number) => string;
  onPick: (key: string, x: number) => void;
  /** Draw the reference element's profile in every visible Full row where it contributes. */
  profileAll: boolean;
  /** Rows opened into their pattern rows (lib/patterns.ts), and the ▸ toggle. */
  open: ReadonlySet<string>;
  onToggleOpen: (key: string) => void;
  groupAgg: (g: Group) => Agg;
  query: { text: string; agg: Agg; matches: ReadonlySet<string> } | null;
  selected: string | null;
  /** Rows outside the neighbourhood are stubs: do not dim the others. */
  focusMode: boolean;
  reference: RefMark | null;
  onSelect: (key: string) => void;
  onToggleGroup: (id: string) => void;
  tip: Tip;
  onLeave: () => void;
  /** Per column: histogram of the set's memberships > 0, and the shared scale. */
  headHists: number[][];
  headMax: number;
  /** Tooltip lines of a column header (similar sets). */
  headTip: (set: number) => string[];
  onHeaderDown: (set: number, e: React.PointerEvent) => void;
  headRef: RefObject<HTMLDivElement | null>;
  dropActive: boolean;
  snapshots: Snapshot[];
  onRemoveSnapshot: (id: number) => void;
  rank: { epoch: number; delta: ReadonlyMap<string, number> };
  /** The live ranking (keys of the filtered rows in sorted order), compared with each snapshot. */
  ranking: string[];
};

/**
 * The fuzzy UpSet as a sticky header SVG over a scrolling body SVG; only the rows near the visible part are drawn.
 * Left: the summary bars on an adjustable two-axis scale; then the snapshots (slope lines to their rankings); then the
 * matrix: one column per selected set, one row per combination, with per-cell membership distributions at three levels
 * of detail.
 */
function UpsetMatrix(p: MatrixProps) {
  const { names, cols, mode, threshold, selected, reference, tip, range } = p;
  const k = cols.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ top: 0, h: 480 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = scrollRef.current!;
    let raf = 0;
    const read = () => setVp({ top: el.scrollTop, h: el.clientHeight });
    const onScroll = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(read)));
    const ro = new ResizeObserver(read);
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => (ro.disconnect(), el.removeEventListener("scroll", onScroll), cancelAnimationFrame(raf));
  }, []);

  // geometry
  const snapW = k * SNAP_DOT + 14;
  const barR = PAD + BAR_W;
  const snapX = (s: number) => barR + 8 + s * (SLOPE_W + snapW);
  const mx = snapX(p.snapshots.length) + GAP;
  const colX = (c: number) => mx + c * CELL_W;
  const W = colX(k) + LABEL_W;
  const hx = (c: number, v: number) => colX(c) + HIST_X + v * HIST_W;
  const rowName = (T: readonly number[]) => cols.filter((s) => T.includes(s)).map((i) => names[i]).join(" ∩ ") + T.filter((s) => !cols.includes(s)).map((s) => ` ∩ ${names[s]}`).join("");
  const modeName = mode === "inclusive" ? "inclusive intersection" : "additive contribution";
  const headTotal = HEAD + (p.query ? QUERY_H : 0);

  // row height (level of detail) and layout
  const counts = useMemo(() => countEntries(p.entries), [p.entries]);
  const avail = Math.max(120, vp.h - headTotal - 4);
  const hH0 = headerH(ROW_FULL);
  const focus = p.fisheye ? (hoverId ?? p.entries.find((e) => e.kind === "row" && e.combo.key === selected)?.id ?? null) : null;
  // Auto: the selected row and the fish-eye focus rows are always Full; the others take the largest level that fits
  const fullIds = useMemo(() => (p.lod === "auto" ? autoFullRows(p.entries, selected, focus) : new Set<string>()), [p.lod, p.entries, selected, focus]);
  const rowH = rowHeight(p.lod, counts.rows, avail - counts.headers * hH0 - counts.stubs * 5, fullIds.size);
  const hH = headerH(rowH);
  const lay = useMemo(
    () => layout(p.entries, { rowH, headerH: hH, fisheye: p.fisheye ? { focus, avail } : null, full: fullIds }),
    [p.entries, rowH, hH, p.fisheye, focus, avail, fullIds],
  );
  const pitch = rowH;
  const snapH = Math.max(0, ...p.snapshots.map((s) => s.keys.length * pitch));
  const bodyH = Math.max(lay.height, snapH) + 8;

  // animation bookkeeping: previous positions of every item; animate only when the ranking epoch changed
  const prevY = useRef(new Map<string, number>());
  const lastEpoch = useRef(p.rank.epoch);
  const animate = lastEpoch.current !== p.rank.epoch;
  useLayoutEffect(() => {
    lastEpoch.current = p.rank.epoch;
    const m = new Map<string, number>();
    for (const it of lay.items) m.set(it.id, it.y);
    prevY.current = m;
  });

  const top = vp.top - OVERSCAN, bottom = vp.top + vp.h + OVERSCAN;
  const visible = lay.items.filter((it) => it.y + it.h >= top && it.y <= bottom);

  // one horizontal scale for every half violin on screen: the largest f over the visible Full cells (rings included)
  let maxF = 0;
  for (const it of visible) {
    if (it.kind !== "row" || lodOf(it.h) !== "full") continue;
    for (const v of p.values(it.combo).values) maxF = Math.max(maxF, violinOf(v).max);
    for (const g of p.detail(it.combo).rings) maxF = Math.max(maxF, violinOf(g.values).max);
  }

  // the selected row out of view: an arrow at the edge
  const selItem = selected ? lay.items.find((it) => it.kind === "row" && it.combo.key === selected) : undefined;
  const bodyTop = vp.top, bodyBottom = vp.top + vp.h - headTotal;
  const selDir = selItem ? (selItem.y + selItem.h < bodyTop ? "up" : selItem.y > bodyBottom ? "down" : null) : null;

  // scales
  const top0 = scaleLinear().domain([0, Math.max(1, p.N)]).range([0, BAR_W]);
  const low = scaleLinear().domain([0, range]).range([0, BAR_W]);
  const lowTicks = low.ticks(3).filter((t) => Number.isInteger(t) && t > 0);

  const dragRange = (e: React.PointerEvent<SVGRectElement>) => {
    const svgX = e.currentTarget.getBoundingClientRect().left;
    const set = (cx: number) => p.onRange(Math.max(1, Math.min(p.N, Math.round(top0.invert(barR - (cx - svgX + PAD))))));
    set(e.clientX);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => (el.removeEventListener("pointermove", move), el.removeEventListener("pointerup", up));
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const scaleLabels = [
    { key: "R", v: p.R, title: `largest row: ${plural(p.R)}` },
    ...(p.G !== null ? [{ key: "G", v: p.G, title: `largest group: ${plural(p.G)} (distinct)` }] : []),
    { key: "U", v: p.N, title: `all elements: ${p.N}` },
  ];

  // ---- rows ----------------------------------------------------------------------------------------------------------

  const bars = (count: number, mass: number, cy: number, h: number) => (
    <>
      <HBar v={count} range={range} right={barR} cy={cy} h={h} kind="count" />
      <HBar v={mass} range={range} right={barR} cy={cy} h={h} kind="mass" />
    </>
  );

  const renderRow = (it: Extract<Placed, { kind: "row" }>) => {
    const c = it.combo, h = it.h, lod = lodOf(h), r = lod === "full" ? DOT_R : dotR(h);
    // Full rows: plot area on top, circles in a strip at the bottom; otherwise the circles are centred
    const cy = lod === "full" ? h - CIRCLE_STRIP / 2 : h / 2;
    const n = c.contributors.length;
    const det = p.detail(c);
    const rings = new Map(det.rings.map((g) => [g.set, g]));
    // a pattern row belongs to its row: selection, dimming and clicks go to the row
    const pat: PatternRow | null = isPatternRow(c) ? c : null;
    const owner = pat ? pat.parent : c.key;
    const isSel = selected === owner;
    const dim = selected && !isSel && !p.focusMode ? 0.45 : 1;
    const bg = isSel && !pat ? "var(--accent-bg)" : "var(--panel)";
    const name = rowName(c.sets);
    const cxs = cols.flatMap((s, ci) => (c.sets.includes(s) ? [colX(ci) + CIRCLE_X] : []));
    const share = pat ? `${((100 * n) / Math.max(1, pat.parentCount)).toFixed(0)} %` : "";
    // rows of 2+ sets open into pattern rows; count groups ("High in 3 of 10") open into their patterns
    const canOpen = n > 0 && (pat ? pat.pattern.openable : c.sets.length > 1);
    const sub = pat?.pattern.depth === 2;
    const barTip = (ev: React.MouseEvent) => tip(ev, pat ? `${name} · ${pat.pattern.label}` : name, pat ? [
      modeName,
      `contributors: ${n} of ${pat.parentCount} (${share}${sub ? " of the group" : ""})`,
      `membership mass: ${fmt(c.mass)}${n ? ` (mean ${fmt(c.mass / n)} per contributor)` : ""}`,
      ...wrapLines(n, c.mass, range),
    ] : [
      modeName,
      `contributors: ${n}`,
      `membership mass: ${fmt(c.mass)}${n ? ` (mean ${fmt(c.mass / n)} per contributor)` : ""}`,
      ...wrapLines(n, c.mass, range),
      ...p.snapshots.map((s) => {
        const sr = s.rows.get(c.key);
        return `${s.label}: ${sr ? `rank ${sr.rank + 1}, mass ${fmt(sr.mass)}` : "not in snapshot"}`;
      }),
    ]);
    return (
      <Moving
        key={it.id} id={it.id} y={it.y} prev={prevY} animate={animate} epoch={p.rank.epoch} delta={p.rank.delta.get(c.key) ?? 0} width={colX(k)} h={h}
        className={pat ? "fu-row fu-row-pat" : "fu-row"} onClick={() => p.onSelect(owner)} aria-label={pat ? `${name}: ${pat.pattern.label}` : name}
        style={pat ? ({ "--row-c": pat.pattern.color } as React.CSSProperties) : undefined}
        onMouseEnter={p.fisheye ? () => (clearTimeout(hoverTimer.current), (hoverTimer.current = window.setTimeout(() => setHoverId(it.id), 150))) : undefined}
      >
        <rect x={PAD} y={0} width={W - PAD} height={h} fill={bg} className="fu-row-bg" />
        {pat && <rect x={PAD} y={0} width={W - PAD} height={h} fill="var(--row-c)" fillOpacity={sub ? 0.03 : 0.07} pointerEvents="none" />}
        {h >= 9 && <line x1={PAD} x2={colX(k)} y1={h} y2={h} stroke="var(--rule-2)" />}
        {pat && <rect x={PAD - 7} y={1} width={3} height={h - 2} fill="var(--row-c)" />}
        {!pat && p.query?.matches.has(c.key) && <rect x={PAD - 7} y={1} width={3} height={h - 2} fill="var(--accent)" />}
        {canOpen && (
          <g
            className="fu-tg" role="button" aria-expanded={p.open.has(c.key)} aria-label={`${p.open.has(c.key) ? "Close" : "Open"} the patterns of ${name}`}
            onClick={(ev) => (ev.stopPropagation(), p.onToggleOpen(c.key))}
            onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, pat ? `${name} · ${pat.pattern.label}` : name, [
              p.open.has(c.key) ? "click: close the pattern rows"
                : pat ? "click: show its patterns (which sets are high)"
                  : c.sets.length >= PATTERN_COUNT_MIN ? "click: split by the number of high sets, then by pattern" : "click: split by pattern (both high, one high, both low, about equal)",
            ]))}
          >
            <rect x={0} y={0} width={PAD - 8} height={h} fill="transparent" />
            <text x={3} y={cy + 4}>{p.open.has(c.key) ? "▾" : "▸"}</text>
          </g>
        )}
        <g onMouseMove={barTip}>
          <rect x={PAD} y={0} width={BAR_W} height={h} fill="transparent" />
          {bars(n, c.mass, cy, Math.max(2, Math.min(BAR_H, h - 6)))}
        </g>
        <g opacity={dim}>
          {cols.map((s, ci) => !c.sets.includes(s) && !rings.has(s) && <Dot key={s} cx={colX(ci) + CIRCLE_X} cy={cy} r={r} member={false} />)}
          {cxs.length > 1 && <line x1={Math.min(...cxs)} x2={Math.max(...cxs)} y1={cy} y2={cy} stroke={pat ? "var(--row-c)" : "var(--ink)"} strokeWidth={isSel && !pat ? Math.min(3.5, r) : Math.min(2.5, r * 0.8)} />}
        </g>
        {lod === "full" && fullCells(c, h, det, rings, isSel, dim, name, owner, pat)}
        {lod === "compact" && compactCells(c, h, det, rings, isSel, dim, bg, name, pat)}
        <g opacity={dim}>
          {cols.map((s, ci) => {
            const member = c.sets.includes(s);
            const ring = rings.get(s);
            if (!member && !ring) return null;
            const cx = colX(ci) + CIRCLE_X;
            const tau = tauOf(threshold, s);
            return (
              <g
                key={s}
                onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${name} · ${names[s]}`, ring && tau !== null
                  ? [`${ring.values.length} of ${ring.contributors} contributors have ${fmt(threshold!.beta * tau)} ≤ ${names[s]} < ${fmt(tau)}; mean ${fmt(ring.mean)}`]
                  : [`${names[s]} is in this combination`]))}
              >
                <circle cx={cx} cy={cy} r={r + 3} fill="transparent" />
                {pat && member ? <PatDot cx={cx} cy={cy} r={r} pat={pat} set={s} /> : (
                  <Dot cx={cx} cy={cy} r={r} member={member} hole={ring && tau !== null ? holeRadius(ring.mean, tau, HOLE_MIN, HOLE_MAX) * (r / DOT_R) : 0} />
                )}
              </g>
            );
          })}
        </g>
        {isSel && !pat && reference && lod === "compact" && <text className="fu-ref-lbl" x={colX(k) + 4} y={cy + 3.5}>{reference.label}</text>}
        {pat && lod !== "minimal" && (
          <text className="fu-pat-lbl" x={colX(k) + 4} y={cy + 3.5}>{`${sub ? "↳ " : ""}${pat.pattern.label} — ${n.toLocaleString("en-US")} (${share})`}</text>
        )}
      </Moving>
    );
  };

  /** Compact cells: a vertical strip of the 5 bins right of each circle; the reference element as a tick across it. */
  const compactCells = (c: Combo, h: number, det: RowDetail, rings: Map<number, RowDetail["rings"][number]>, isSel: boolean, dim: number, bg: string, name: string, pat: PatternRow | null) => {
    const n = c.contributors.length;
    const sh = h - 4, sy = 2, bh = sh / N_BINS;
    return cols.map((s, ci) => {
      const member = c.sets.includes(s);
      const ring = rings.get(s);
      if (!member && !ring) return null;
      const x0 = colX(ci) + STRIP_X;
      const counts = member ? det.hists[c.sets.indexOf(s)] : ring!.hist;
      return (
        <g key={s}>
          <rect x={x0 - 3} y={1} width={STRIP_W + 6} height={h - 2} fill={bg} />
          <g opacity={dim}><VStrip x={x0} y={sy} h={sh} counts={counts} maxC={p.maxBin} ring={!member} color={pat ? "var(--row-c)" : undefined} /></g>
          {counts.map((kk, b) => (
            <rect
              key={b} x={x0} y={sy + (N_BINS - 1 - b) * bh} width={STRIP_W} height={bh} fill="transparent"
              onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${name} · ${names[s]}`, member
                ? [`${names[s]} membership in ${binLabel(b)}: ${plural(kk)}`, `of ${plural(n)} contributing (${modeName})`]
                : [`below τ but near ${names[s]}: ${binLabel(b)}: ${plural(kk)}`, "not counted in masses or contributors"]))}
            />
          ))}
          {isSel && reference && member && (!pat || indexOfSorted(c.contributors, p.refElem ?? -1) >= 0) && (
            <line x1={x0 - 3} x2={x0 + STRIP_W + 3} y1={sy + (1 - reference.value) * sh} y2={sy + (1 - reference.value) * sh} stroke="var(--select)" strokeWidth={2} pointerEvents="none" />
          )}
        </g>
      );
    });
  };

  /**
   * Full cells: per set of the row, the points (contributors at their original membership, jittered left of the axis)
   * and the half violin right of it; rings get a grey violin. The reference element's profile: a curve through its
   * points, a dashed line at its minimum and (additive) the band from the outside maximum to the inside minimum.
   */
  const fullCells = (c: Combo, h: number, det: RowDetail, rings: Map<number, RowDetail["rings"][number]>, isSel: boolean, dim: number, name: string, owner: string, pat: PatternRow | null) => {
    const n = c.contributors.length;
    const pTop = PLOT_TOP, pBot = h - CIRCLE_STRIP;
    const yOf = (v: number) => pBot - v * (pBot - pTop);
    const vals = p.values(c);
    const part = cols.flatMap((s, ci) => (c.sets.includes(s) ? [{ s, ci, j: c.sets.indexOf(s) }] : []));
    const gx0 = colX(0) + JIT_X, gx1 = colX(k - 1) + AXIS_X + HIST_W;
    const px0 = colX(part[0].ci) + JIT_X, px1 = colX(part[part.length - 1].ci) + AXIS_X + HIST_W;
    // the reference element in this row: in the selected row, or in every row with "Profile in all rows"
    const x = p.refElem;
    const at = x !== null && (isSel ? reference !== null : p.profileAll) ? indexOfSorted(vals.idx, x) : -1;
    const ref = at >= 0 ? x! : null;
    const refV = (j: number) => vals.values[j][at];
    const refMin = ref === null ? 0 : isSel && reference ? reference.value : Math.min(...part.map((q) => refV(q.j)));
    const profile = ref === null ? [] : part.map((q) => [colX(q.ci) + pointDx(ref), yOf(refV(q.j))] as const);
    const shown = pointsToDraw(vals.idx, vals.values, ref);
    const capped = n > MAX_POINTS;
    const ptTip = (ev: React.MouseEvent) => {
      const d = (ev.target as SVGElement).dataset;
      if (d?.x === undefined) return;
      ev.stopPropagation();
      const xi = +d.x, s = +d.s!;
      tip(ev, `${p.elemLabel(xi)}: ${names[s]} = ${fmt(+d.v!)}`, [xi === ref && isSel ? "click: clear the reference element" : "click: show this element's profile"]);
    };
    const ptClick = (ev: React.MouseEvent) => {
      const d = (ev.target as SVGElement).dataset;
      if (d?.x === undefined) return;
      ev.stopPropagation();
      p.onPick(owner, +d.x);
    };
    const cellTip = (s: number, b: number, member: boolean) => (ev: React.MouseEvent) => {
      ev.stopPropagation();
      if (member) {
        const kk = det.hists[c.sets.indexOf(s)][b];
        tip(ev, `${names[s]} in ${name}: ${n.toLocaleString("en-US")} ${n === 1 ? "contributor" : "contributors"}`, [
          `${names[s]} membership in ${binLabel(b)}: ${plural(kk)}`,
          modeName,
          ...(capped ? [`points: a fixed sample of ${shown.length} of ${n.toLocaleString("en-US")} (${MAX_POINTS} plus each cell's lowest and highest)`] : []),
        ]);
      } else {
        const g = rings.get(s)!;
        tip(ev, `below τ but near ${names[s]}: ${g.values.length} of ${g.contributors} contributors`, [`${binLabel(b)}: ${plural(g.hist[b])}`, "not counted in masses or contributors"]);
      }
    };
    return (
      <g>
        {/* membership gridlines and the 0 / 1 labels, once per row */}
        {GRID.map((v) => <line key={v} x1={gx0} x2={gx1} y1={yOf(v)} y2={yOf(v)} className="fu-grid" />)}
        <text className="bar-hd" x={gx0 - 3} y={yOf(0) + 3} textAnchor="end">0</text>
        <text className="bar-hd" x={gx0 - 3} y={yOf(1) + 3} textAnchor="end">1</text>
        {/* ribbons between neighbouring set axes: contributors from bin i of one set to bin j of the next (all of them) */}
        <g opacity={dim}>
          {part.slice(1).map((q1, t) => {
            const q0 = part[t];
            const ax0 = colX(q0.ci) + AXIS_X, ax1 = colX(q1.ci) + AXIS_X, xm = (ax0 + ax1) / 2;
            const binH = yOf(0) - yOf(BIN_EDGES[1]);
            const scaleMax = Math.max(1, ...det.hists.flat());
            return ribbonGeometry(ribbonsOf(vals, q0.j, q1.j), scaleMax, binH).map((rb) => {
              const l0 = yOf(binTop(rb.i)) + rb.left[0], l1 = yOf(binTop(rb.i)) + rb.left[1];
              const r0 = yOf(binTop(rb.j)) + rb.right[0], r1 = yOf(binTop(rb.j)) + rb.right[1];
              const f = (v: number) => v.toFixed(1);
              return (
                <path
                  key={`${q0.s}-${rb.i}-${rb.j}`} className="fu-ribbon" fill={pat ? "var(--row-c)" : "var(--accent)"} fillOpacity={pat ? 0.35 : 0.18}
                  d={`M${ax0},${f(l0)}C${xm},${f(l0)} ${xm},${f(r0)} ${ax1},${f(r0)}L${ax1},${f(r1)}C${xm},${f(r1)} ${xm},${f(l1)} ${ax0},${f(l1)}Z`}
                  onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${names[q0.s]} ${binLabel(rb.i)} → ${names[q1.s]} ${binLabel(rb.j)}: ${plural(rb.count)}`, [
                    `of ${plural(n)} in ${name}${pat ? ` · ${pat.pattern.label}` : ""}`,
                  ]))}
                />
              );
            });
          })}
        </g>
        {cols.map((s, ci) => {
          const member = c.sets.includes(s);
          const ring = rings.get(s);
          if (!member && !ring) return null;
          const ax = colX(ci) + AXIS_X;
          const tau = tauOf(threshold, s);
          const v = member ? vals.values[c.sets.indexOf(s)] : ring!.values;
          return (
            <g key={s}>
              {tau !== null && member && <rect x={colX(ci) + JIT_X} y={yOf(tau)} width={AXIS_X + HIST_W - JIT_X} height={yOf(0) - yOf(tau)} fill="var(--ink)" fillOpacity={0.03} />}
              <line x1={ax} x2={ax} y1={yOf(0)} y2={yOf(1)} className="fu-hist-axis" />
              {tau !== null && <line x1={ax - 3} x2={ax + 3} y1={yOf(tau)} y2={yOf(tau)} className="fu-hist-tick" />}
              <g opacity={dim}>
                {v.length > 0 && <Violin ax={ax} f={violinOf(v).f} maxF={maxF} yOf={yOf} color={member ? (pat ? "var(--row-c)" : "var(--accent)") : "var(--near-ring)"} />}
              </g>
              {BIN_EDGES.map((lo, b) => (
                <rect key={b} x={ax} y={yOf(binTop(b))} width={HIST_W} height={yOf(lo) - yOf(binTop(b))} fill="transparent" onMouseMove={cellTip(s, b, member)} />
              ))}
            </g>
          );
        })}
        {isSel && reference?.band && ref !== null && (
          <rect x={px0} y={yOf(reference.band.to)} width={px1 - px0} height={yOf(reference.band.from) - yOf(reference.band.to)} fill="var(--select)" fillOpacity={0.14} pointerEvents="none" />
        )}
        {ref !== null && (
          <g>
            <line x1={px0} x2={px1} y1={yOf(refMin)} y2={yOf(refMin)} stroke="var(--select)" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
            <rect
              x={px0} y={yOf(refMin) - 3} width={px1 - px0} height={6} fill="transparent"
              onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, isSel && reference ? reference.label : `${p.elemLabel(ref)}: min = ${fmt(refMin)}`, [
                part.map((q) => `${names[q.s]} = ${fmt(refV(q.j))}`).join(", "),
                ...(isSel && reference?.band ? [`component band ${fmt(reference.band.from)}–${fmt(reference.band.to)} (width ${fmt(reference.band.component)})`] : []),
              ]))}
            />
          </g>
        )}
        {profile.length > 1 && (
          <g>
            <path
              d={profilePath(profile)} fill="none" stroke="transparent" strokeWidth={8}
              onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${p.elemLabel(ref!)} in ${name}`, part.map((q) => `${names[q.s]} = ${fmt(refV(q.j))}`)))}
            />
            <path d={profilePath(profile)} fill="none" stroke="var(--select)" strokeWidth={2} strokeLinecap="round" pointerEvents="none" />
          </g>
        )}
        <g className="fu-pts" onClick={ptClick} onMouseMove={ptTip}>
          {part.map((q) => {
            const cx0 = colX(q.ci), vs = vals.values[q.j];
            return (
              <g key={q.s} opacity={dim}>
                {shown.map((jj) => {
                  const xi = vals.idx[jj];
                  if (xi === ref) return null;
                  return <circle key={xi} cx={cx0 + pointDx(xi)} cy={yOf(vs[jj])} r={PT_R} className="fu-pt" data-x={xi} data-s={q.s} data-v={vs[jj]} />;
                })}
              </g>
            );
          })}
          {ref !== null && part.map((q) => (
            <circle key={`r${q.s}`} cx={colX(q.ci) + pointDx(ref)} cy={yOf(refV(q.j))} r={PT_R_REF} className="fu-pt-ref" data-x={ref} data-s={q.s} data-v={refV(q.j)} />
          ))}
        </g>
        {isSel && !pat && reference && ref !== null && <text className="fu-ref-lbl" x={colX(k) + 4} y={yOf(refMin) + 3.5}>{reference.label}</text>}
      </g>
    );
  };

  const renderHeader = (it: Extract<Placed, { kind: "header" }>) => {
    const g = it.group, h = it.h, cy = h / 2, r = dotR(Math.min(h, 16));
    const a = p.groupAgg(g);
    const overlap = mode === "inclusive" ? "sum of row masses (rows overlap)" : "sum of row masses";
    return (
      <g
        key={it.id} transform={`translate(0,${it.y})`} className="fu-group" role="button" aria-expanded={!it.collapsed} aria-label={g.label}
        onClick={() => p.onToggleGroup(g.id)}
        onMouseMove={(ev) => tip(ev, g.label, [`${plural(a.rows, "row")}${it.collapsed ? " (collapsed)" : ""}`, `contributors: ${a.contributors} distinct`, `membership mass: ${fmt(a.mass)} — ${overlap}`, ...wrapLines(a.contributors, a.mass, range)])}
      >
        <rect x={PAD - 6} y={0.5} width={W - PAD + 6 - 4} height={h - 1} className="fu-group-bg" />
        {/* toggle and label at the left (always in view); the summary bar along the bottom of the header */}
        <text className="fu-group-tg" x={PAD - 3 + it.depth * 10} y={10}>{it.collapsed ? "▸" : "▾"}</text>
        <text className="fu-group-lbl" x={PAD + 9 + it.depth * 10} y={9}>{g.label}</text>
        {bars(a.contributors, a.mass, h - 4.5, 5)}
        {g.sets && cols.map((s, ci) => <Dot key={s} cx={colX(ci) + CIRCLE_X} cy={cy} r={r} member={g.sets!.includes(s)} may={!g.sets!.includes(s)} />)}
      </g>
    );
  };

  const renderStub = (it: Extract<Placed, { kind: "stub" }>) => (
    <g key={it.id} transform={`translate(0,${it.y})`} onMouseMove={(ev) => tip(ev, stubText(it.count, it.reason), [])}>
      <rect x={PAD} y={0} width={colX(k) - PAD} height={it.h} fill="transparent" />
      <line x1={PAD} x2={colX(k)} y1={it.h / 2} y2={it.h / 2} className="fu-stub" />
    </g>
  );

  // ---- snapshots: slope lines and mini glyphs ------------------------------------------------------------------------

  const snapDelta = useMemo(() => p.snapshots.map((s) => rankChanges(s.keys, p.ranking)), [p.snapshots, p.ranking]);
  const liveRows = lay.items.filter((it): it is Extract<Placed, { kind: "row" }> => it.kind === "row" && it.parent === undefined);
  const liveKeys = new Set(liveRows.map((it) => it.combo.key));
  const snapLayer = p.snapshots.map((s, si) => {
    const x0 = snapX(si), x1 = x0 + SLOPE_W, gx = x1 + 2;
    const sy = (rank: number) => rank * pitch + pitch / 2;
    const els: ReactNode[] = [];
    for (const it of liveRows) {
      const ly = it.y + it.h / 2;
      const sr = s.rows.get(it.combo.key);
      if (!sr) {
        if (ly < top || ly > bottom) continue;
        els.push(
          <g key={`m${it.id}`} onMouseMove={(ev) => tip(ev, rowName(it.combo.sets), [`not in snapshot (${s.label})`])}>
            <line x1={x0 + 2} x2={x0 + 12} y1={ly} y2={ly} className="fu-slope-miss" markerEnd="url(#fu-arrow)" />
            <rect x={x0} y={ly - 4} width={16} height={8} fill="transparent" />
          </g>,
        );
        continue;
      }
      const ty = sy(sr.rank);
      if (Math.max(ly, ty) < top || Math.min(ly, ty) > bottom) continue;
      const dr = snapDelta[si].get(it.combo.key) ?? 0;
      const cls = dr > 0 ? "fu-slope fu-slope-up" : dr < 0 ? "fu-slope fu-slope-down" : "fu-slope";
      els.push(<line key={`l${it.id}`} x1={x0} x2={x1} y1={ly} y2={ty} className={cls} />);
    }
    s.keys.forEach((key, rank) => {
      const y = sy(rank);
      if (y < top || y > bottom) return;
      const sr = s.rows.get(key)!;
      const missing = !liveKeys.has(key);
      els.push(
        <g key={`g${key}`} onMouseMove={(ev) => tip(ev, rowName(sr.sets), [`${s.label}: rank ${rank + 1}`, `contributors ${sr.count}, mass ${fmt(sr.mass)}`, ...(missing ? ["not in the live chart"] : [])])}>
          <rect x={gx - 2} y={y - pitch / 2} width={snapW} height={pitch} fill="transparent" />
          {cols.map((c, ci) => <circle key={c} cx={gx + 4 + ci * SNAP_DOT} cy={y} r={sr.sets.includes(c) ? 1.8 : 1.1} fill={sr.sets.includes(c) ? "var(--ink)" : "var(--axis)"} />)}
          {sr.sets.some((c) => !cols.includes(c)) && <text className="bar-hd" x={gx + 4 + k * SNAP_DOT} y={y + 3}>+</text>}
          {missing && <line x1={gx - 3} x2={gx - 13} y1={y} y2={y} className="fu-slope-miss" markerEnd="url(#fu-arrow)" />}
        </g>,
      );
    });
    return <g key={s.id}>{els}</g>;
  });

  // ---- header --------------------------------------------------------------------------------------------------------

  const labelPos = scaleLabels.map((l) => ({ ...l, x: barR - top0(l.v) })).sort((a, b) => a.x - b.x);
  const stagger = labelPos.map((l, i) => (i > 0 && Math.abs(l.x - labelPos[i - 1].x) < 14 ? 1 : 0));

  return (
    <div className="fu-plot-wrap">
      <div className="fu-scroll" ref={scrollRef} onMouseLeave={() => (p.onLeave(), clearTimeout(hoverTimer.current), setHoverId(null))}>
        <div className={`fu-head${p.dropActive ? " fu-drop" : ""}`} ref={p.headRef} style={{ width: W }}>
          <svg width={W} height={headTotal} role="img" aria-label={`Fuzzy UpSet header: ${cols.map((i) => names[i]).join(", ")}`}>
            <defs>
              <HatchDefs />
              <marker id="fu-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
                <path d="M0,0L6,3L0,6z" fill="var(--ink-3)" />
              </marker>
            </defs>
            <g className="bar-lbl">
              <rect x={PAD} y={4} width={14} height={9} rx={2} className="fu-bar-out" />
              <text x={PAD + 19} y={12}>contributors</text>
              <rect x={PAD + 88} y={4} width={14} height={9} rx={2} className="fu-bar-in" />
              <text x={PAD + 107} y={12}>mass</text>
              {range < Math.max(p.R, p.G ?? 0) && (
                <g onMouseMove={(ev) => tip(ev, "Wrap: past the range", ["a bar longer than the range wraps: each further range is a narrower layer", "hatched 45°, then 135°, then both; beyond that two white slashes"])}>
                  <rect x={PAD + 138} y={4} width={14} height={9} rx={2} className="fu-bar-out" />
                  <rect x={PAD + 138} y={4} width={14} height={9} rx={2} fill={hatchOf("count", 1)} />
                  <text x={PAD + 157} y={12}>wrap</text>
                </g>
              )}
            </g>
            {/* top axis: 0 to N; the shaded part is the lower axis's range */}
            <line x1={barR - BAR_W} x2={barR} y1={TOP_Y} y2={TOP_Y} className="fu-axis" />
            <rect x={barR - top0(Math.min(range, p.N))} y={TOP_Y - 3} width={top0(Math.min(range, p.N))} height={6} className="fu-range" />
            <line x1={barR - top0(Math.min(range, p.N))} x2={barR - BAR_W} y1={TOP_Y + 3} y2={LOW_Y} className="fu-zoom" />
            <line x1={barR} x2={barR} y1={TOP_Y + 3} y2={LOW_Y} className="fu-zoom" />
            <rect
              x={barR - BAR_W - 4} y={TOP_Y - 8} width={BAR_W + 8} height={16} fill="transparent" className="fu-range-hit" onPointerDown={dragRange}
              onMouseMove={(ev) => tip(ev, "Bar scale", [`range ${range} of ${p.N} elements`, "drag along this axis, or click R, G or U, to set the range", "bars longer than the range wrap (up to 3 times)"])}
            />
            <circle cx={barR - top0(Math.min(range, p.N))} cy={TOP_Y} r={4} className="fu-range-handle" pointerEvents="none" />
            {labelPos.map((l, i) => (
              <g key={l.key} className="fu-scale-lbl" onClick={() => p.onRange(Math.max(1, l.v))} onMouseMove={(ev) => tip(ev, l.title, ["click: set the bar range to this value"])}>
                <line x1={l.x} x2={l.x} y1={TOP_Y - 3} y2={TOP_Y} className="fu-axis" />
                <text x={l.x} y={TOP_Y - 6 - stagger[i] * 9} textAnchor="middle" aria-label={l.title} fontWeight={Math.abs(l.v - range) < 0.5 ? 600 : 400}>{l.key}</text>
              </g>
            ))}
            {/* lower axis: the bars' range */}
            <line x1={barR - BAR_W} x2={barR} y1={LOW_Y} y2={LOW_Y} className="fu-axis" />
            <text className="bar-hd" x={barR} y={LOW_Y - 4} textAnchor="middle">0</text>
            {lowTicks.map((t) => (
              <g key={t}>
                <line x1={barR - low(t)} x2={barR - low(t)} y1={LOW_Y - 3} y2={LOW_Y} className="fu-axis" />
                <text className="bar-hd" x={barR - low(t)} y={LOW_Y - 5} textAnchor="middle">{t}</text>
              </g>
            ))}
            {/* snapshot column labels */}
            {p.snapshots.map((s, si) => (
              <g key={s.id} onMouseMove={(ev) => tip(ev, `Snapshot ${si + 1}`, [s.label, ...s.details, `${s.keys.length} rows`])}>
                <text className="fu-snap-lbl" x={snapX(si) + 2} y={44}>Snapshot {si + 1}</text>
                <text className="bar-hd" x={snapX(si) + 2} y={56}>{s.label.split(", ")[0]}</text>
                <text className="bar-hd" x={snapX(si) + 2} y={67}>{s.label.split(", ").slice(1).join(", ")}</text>
                <text className="fu-snap-x" x={snapX(si) + SLOPE_W + snapW - 6} y={44} role="button" aria-label={`Remove snapshot ${si + 1}`} onClick={() => p.onRemoveSnapshot(s.id)}>✕</text>
              </g>
            ))}
            {/* column headers: name, histogram of memberships > 0 (τ_i marked), the 0–1 axis */}
            {cols.map((i, c) => {
              const tau = tauOf(threshold, i);
              return (
                <g key={i} className="fu-col-head" onPointerDown={(e) => p.onHeaderDown(i, e)} onMouseMove={(ev) => tip(ev, names[i], p.headTip(i))}>
                  <rect x={colX(c) + 2} y={0} width={CELL_W - 4} height={HEAD - 2} fill="transparent" />
                  <text className="fu-set" x={hx(c, 0.5)} y={13} textAnchor="middle">{names[i].length > 16 ? names[i].slice(0, 15) + "…" : names[i]}</text>
                  <HistBars x={hx(c, 0)} y={20} w={HIST_W} h={36} counts={p.headHists[c]} max={p.headMax} tau={tau} />
                  <text className="bar-hd" x={hx(c, 0)} y={HEAD - 10} textAnchor="middle">0</text>
                  <text className="bar-hd" x={hx(c, 1)} y={HEAD - 10} textAnchor="middle">1</text>
                  {tau !== null && <text className="bar-hd fu-tau-lbl" x={hx(c, tau)} y={HEAD - 10} textAnchor="middle">τ</text>}
                </g>
              );
            })}
            {/* the query result, pinned under the header */}
            {p.query && (
              <g
                transform={`translate(0,${HEAD})`}
                onMouseMove={(ev) => tip(ev, `Query: ${p.query!.text}`, p.query!.agg.rows
                  ? [`${plural(p.query!.agg.rows, "combination")} match`, `contributors: ${p.query!.agg.contributors} distinct`, `membership mass: ${fmt(p.query!.agg.mass)} — ${mode === "inclusive" ? "sum of row masses (rows overlap)" : "sum of row masses"}`, ...wrapLines(p.query!.agg.contributors, p.query!.agg.mass, range)]
                  : ["no combination matches"])}
              >
                <rect x={PAD - 6} y={1} width={W - PAD + 6 - 4} height={QUERY_H - 3} className="fu-query-bg" />
                {bars(p.query.agg.contributors, p.query.agg.mass, QUERY_H / 2, BAR_H)}
                <text className="fu-query-lbl" x={mx + 4} y={QUERY_H / 2 + 4}>
                  Query: {p.query.text} — {p.query.agg.rows ? plural(p.query.agg.rows, "combination") : "no combination matches"}
                </text>
              </g>
            )}
          </svg>
        </div>
        <svg width={W} height={bodyH} className="fu-body-svg" role="img" aria-label={`Fuzzy UpSet, ${modeName}s of ${cols.map((i) => names[i]).join(", ")}`}>
          {visible.map((it) => (it.kind === "row" ? renderRow(it) : it.kind === "header" ? renderHeader(it) : renderStub(it)))}
          {/* over the rows' backgrounds */}
          {snapLayer}
        </svg>
      </div>
      {selDir && (
        <button
          className={`fu-jump fu-jump-${selDir}`} style={selDir === "up" ? { top: headTotal + 6 } : undefined}
          aria-label="Scroll to the selected row"
          onClick={() => scrollRef.current?.scrollTo({ top: Math.max(0, selItem!.y - vp.h / 3), behavior: "smooth" })}
        >
          {selDir === "up" ? "▲" : "▼"} selected row
        </button>
      )}
    </div>
  );
}

export default memo(UpsetMatrix);
