import { area, curveMonotoneX, line, scaleLinear, select } from "d3";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { binLabel, N_BINS, tauOf, type Combo, type Mode, type RowDetail, type Threshold } from "../lib/fuzzyDecomposition";
import { holeRadius } from "../lib/fuzzyUpset";
import {
  countEntries, horizon, layout, lodOf, rankChangeIntensity, rankChanges, ROW_FULL, rowHeight, stubText, type Entry, type Group, type LodSetting, type Placed,
} from "../lib/upsetView";
import { HistBars } from "./MiniHist";

/** Width of every membership histogram and compact strip (membership 0 at the left edge, 1 at the right edge). */
export const HIST_W = 72;
/** Circles: one size for every set slot (smaller in short rows); a ring is the same disc in grey with a white hole. */
const DOT_R = 6.5, HOLE_MIN = 1.5, HOLE_MAX = 5;
/** Matrix cell: the circle at the left, then the histogram. */
const CELL_W = 112, CIRCLE_X = 12, HIST_X = 28;
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

/** A small histogram: bars per 0.2-wide bin plus a monotone curve through the bin centres (no overshoot). */
function Hist({ x, base, h, counts, maxC, color, tint }: { x: number; base: number; h: number; counts: number[]; maxC: number; color: string; tint: number }) {
  const bw = HIST_W / N_BINS;
  const y = (c: number) => base - (maxC > 0 ? (c / maxC) * h : 0);
  const pts = counts.map((c, b) => [x + (b + 0.5) * bw, y(c)] as [number, number]);
  if (!counts.some((c) => c > 0)) return null;
  return (
    <g pointerEvents="none">
      {counts.map((c, b) => c > 0 && <rect key={b} x={x + b * bw + 0.75} y={y(c)} width={bw - 1.5} height={base - y(c)} fill={color} fillOpacity={tint} />)}
      <path d={area<[number, number]>().x((p) => p[0]).y0(base).y1((p) => p[1]).curve(curveMonotoneX)(pts) ?? ""} fill={color} fillOpacity={0.08} />
      <path d={line().curve(curveMonotoneX)(pts) ?? ""} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

/** Compact level: the 5 bins as grayscale cells (darker = more elements, on the shared count scale). */
function Strip({ x, y, h, counts, maxC, ring = false }: { x: number; y: number; h: number; counts: number[]; maxC: number; ring?: boolean }) {
  const bw = HIST_W / N_BINS;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={HIST_W} height={h} fill="none" stroke="var(--axis)" strokeWidth={0.6} />
      {counts.map((c, b) => c > 0 && (
        <rect key={b} x={x + b * bw} y={y} width={bw} height={h} fill={ring ? "var(--near-ring)" : "var(--ink)"} fillOpacity={(ring ? 0.5 : 1) * (0.1 + 0.85 * (c / Math.max(1, maxC)))} />
      ))}
    </g>
  );
}

/**
 * A count or mass bar on the adjustable axis, growing leftward from `right`. Beyond the range it wraps: each wrap is
 * drawn narrower and darker over the previous layer; beyond 3 wraps a break symbol.
 */
function HBar({ v, range, right, cy, h, kind }: { v: number; range: number; right: number; cy: number; h: number; kind: "count" | "mass" }) {
  if (!(v > 0)) return null;
  const hz = horizon(v, range);
  const px = (u: number) => (u / range) * BAR_W;
  const layers: ReactNode[] = [];
  for (let t = 0; t <= hz.wraps; t++) {
    const len = t < hz.wraps ? range : hz.remainder;
    const hh = Math.max(1.5, h * (1 - 0.24 * t));
    layers.push(
      <rect
        key={t} x={right - px(len)} y={cy - hh / 2} width={px(len)} height={hh} rx={t ? 1 : 2}
        className={kind === "count" ? "fu-bar fu-bar-out" : "fu-bar fu-bar-in"}
        style={t ? (kind === "count" ? { fillOpacity: 0.15 + 0.2 * t } : { fill: `color-mix(in srgb, var(--accent) ${100 - 25 * t}%, black)` }) : undefined}
      />,
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
  /** Shared count scale of every histogram and strip on screen. */
  maxBin: number;
  detail: (c: Combo) => RowDetail;
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
  const { names, cols, mode, threshold, selected, reference, tip, maxBin, range } = p;
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
  const rowH = rowHeight(p.lod, counts.rows, avail - counts.headers * hH0 - counts.stubs * 5);
  const hH = headerH(rowH);
  const focus = p.fisheye ? (hoverId ?? p.entries.find((e) => e.kind === "row" && e.combo.key === selected)?.id ?? null) : null;
  const lay = useMemo(
    () => layout(p.entries, { rowH, headerH: hH, fisheye: p.fisheye ? { focus, avail } : null }),
    [p.entries, rowH, hH, p.fisheye, focus, avail],
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
    const c = it.combo, h = it.h, cy = h / 2, lod = lodOf(h), r = dotR(h);
    const n = c.contributors.length;
    const det = p.detail(c);
    const rings = new Map(det.rings.map((g) => [g.set, g]));
    const isSel = selected === c.key;
    const dim = selected && !isSel && !p.focusMode ? 0.45 : 1;
    const bg = isSel ? "var(--accent-bg)" : "var(--panel)";
    const name = rowName(c.sets);
    const cxs = cols.flatMap((s, ci) => (c.sets.includes(s) ? [colX(ci) + CIRCLE_X] : []));
    const base = h - 5, hh = h - 9;
    const sh = Math.min(14, h - 4), sy = (h - sh) / 2;
    const barTip = (ev: React.MouseEvent) => tip(ev, name, [
      modeName,
      `contributors: ${n}`,
      `membership mass: ${fmt(c.mass)}${n ? ` (mean ${fmt(c.mass / n)} per contributor)` : ""}`,
      ...p.snapshots.map((s) => {
        const sr = s.rows.get(c.key);
        return `${s.label}: ${sr ? `rank ${sr.rank + 1}, mass ${fmt(sr.mass)}` : "not in snapshot"}`;
      }),
    ]);
    return (
      <Moving
        key={it.id} id={it.id} y={it.y} prev={prevY} animate={animate} epoch={p.rank.epoch} delta={p.rank.delta.get(c.key) ?? 0} width={colX(k)} h={h}
        className="fu-row" onClick={() => p.onSelect(c.key)} aria-label={name}
        onMouseEnter={p.fisheye ? () => (clearTimeout(hoverTimer.current), (hoverTimer.current = window.setTimeout(() => setHoverId(it.id), 150))) : undefined}
      >
        <rect x={PAD} y={0} width={W - PAD} height={h} fill={bg} className="fu-row-bg" />
        {h >= 9 && <line x1={PAD} x2={colX(k)} y1={h} y2={h} stroke="var(--rule-2)" />}
        {p.query?.matches.has(c.key) && <rect x={PAD - 7} y={1} width={3} height={h - 2} fill="var(--accent)" />}
        <g onMouseMove={barTip}>
          <rect x={PAD} y={0} width={BAR_W} height={h} fill="transparent" />
          {bars(n, c.mass, cy, Math.max(2, Math.min(BAR_H, h - 6)))}
        </g>
        <g opacity={dim}>
          {cols.map((s, ci) => !c.sets.includes(s) && !rings.has(s) && <Dot key={s} cx={colX(ci) + CIRCLE_X} cy={cy} r={r} member={false} />)}
          {cxs.length > 1 && <line x1={Math.min(...cxs)} x2={Math.max(...cxs)} y1={cy} y2={cy} stroke="var(--ink)" strokeWidth={isSel ? Math.min(3.5, r) : Math.min(2.5, r * 0.8)} />}
        </g>
        {lod !== "minimal" && cols.map((s, ci) => {
          const member = c.sets.includes(s);
          const ring = rings.get(s);
          if (!member && !ring) return null;
          const x0 = colX(ci) + HIST_X;
          const counts = member ? det.hists[c.sets.indexOf(s)] : ring!.hist;
          const tau = tauOf(threshold, s);
          return (
            <g key={s}>
              <rect x={x0 - 4} y={1.5} width={HIST_W + 8} height={h - 3} fill={bg} />
              {lod === "full" ? (
                <>
                  {tau !== null && member && <rect x={x0} y={base - hh} width={tau * HIST_W} height={hh} fill="var(--ink)" fillOpacity={0.03} />}
                  <line x1={x0} x2={x0 + HIST_W} y1={base} y2={base} className="fu-hist-axis" />
                  {tau !== null && <line x1={x0 + tau * HIST_W} x2={x0 + tau * HIST_W} y1={base} y2={base + 3} className="fu-hist-tick" />}
                  <g opacity={dim}>
                    {isSel && reference?.band && member && (
                      <rect x={x0 + reference.band.from * HIST_W} y={base - hh} width={(reference.band.to - reference.band.from) * HIST_W} height={hh} fill="var(--select)" fillOpacity={0.14} />
                    )}
                    <Hist x={x0} base={base} h={hh} counts={counts} maxC={maxBin} color={member ? "var(--accent)" : "var(--near-ring)"} tint={member ? 0.3 : 0.35} />
                  </g>
                </>
              ) : (
                <g opacity={dim}>
                  <Strip x={x0} y={sy} h={sh} counts={counts} maxC={maxBin} ring={!member} />
                </g>
              )}
              {counts.map((kk, b) => (
                <rect
                  key={b} x={x0 + (b * HIST_W) / N_BINS} y={1} width={HIST_W / N_BINS} height={h - 2} fill="transparent"
                  onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${name} · ${names[s]}`, member
                    ? [`${names[s]} membership in ${binLabel(b)}: ${plural(kk)}`, `of ${plural(n)} contributing (${modeName})`]
                    : [`below τ but near ${names[s]}: ${binLabel(b)}: ${plural(kk)}`, "not counted in masses or contributors"]))}
                />
              ))}
              {isSel && reference && member && (
                <g>
                  {lod === "full"
                    ? <line x1={x0 + reference.value * HIST_W} x2={x0 + reference.value * HIST_W} y1={2} y2={base} stroke="var(--select)" strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" />
                    : <line x1={x0 + reference.value * HIST_W} x2={x0 + reference.value * HIST_W} y1={sy - 2} y2={sy + sh + 2} stroke="var(--select)" strokeWidth={2} pointerEvents="none" />}
                  <rect
                    x={x0 + reference.value * HIST_W - 3} y={1} width={6} height={h - 2} fill="transparent"
                    onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, reference.label, [
                      `${reference.who}: ${names[s]} = ${fmt(reference.membership(s))}`,
                      ...(reference.band ? [`component band ${fmt(reference.band.from)}–${fmt(reference.band.to)} (width ${fmt(reference.band.component)})`] : []),
                    ]))}
                  />
                </g>
              )}
            </g>
          );
        })}
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
                <Dot cx={cx} cy={cy} r={r} member={member} hole={ring && tau !== null ? holeRadius(ring.mean, tau, HOLE_MIN, HOLE_MAX) * (r / DOT_R) : 0} />
              </g>
            );
          })}
        </g>
        {isSel && reference && lod !== "minimal" && <text className="fu-ref-lbl" x={colX(k) + 4} y={cy + 3.5}>{reference.label}</text>}
      </Moving>
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
        onMouseMove={(ev) => tip(ev, g.label, [`${plural(a.rows, "row")}${it.collapsed ? " (collapsed)" : ""}`, `contributors: ${a.contributors} distinct`, `membership mass: ${fmt(a.mass)} — ${overlap}`])}
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
  const liveRows = lay.items.filter((it): it is Extract<Placed, { kind: "row" }> => it.kind === "row");
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
              <marker id="fu-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
                <path d="M0,0L6,3L0,6z" fill="var(--ink-3)" />
              </marker>
            </defs>
            <g className="bar-lbl">
              <rect x={PAD} y={4} width={14} height={9} rx={2} className="fu-bar-out" />
              <text x={PAD + 19} y={12}>contributors</text>
              <rect x={PAD + 88} y={4} width={14} height={9} rx={2} className="fu-bar-in" />
              <text x={PAD + 107} y={12}>mass</text>
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
                  ? [`${plural(p.query!.agg.rows, "combination")} match`, `contributors: ${p.query!.agg.contributors} distinct`, `membership mass: ${fmt(p.query!.agg.mass)} — ${mode === "inclusive" ? "sum of row masses (rows overlap)" : "sum of row masses"}`]
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
