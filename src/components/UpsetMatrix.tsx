import type { Category, NumericAttr, SetFamily } from "../lib/dataset";
import { holeRadius, nearMarked, type NearGroup, type summarise } from "../lib/fuzzyUpset";
import { inkOn } from "../lib/colors";
import type { DegreeSummary } from "../lib/upsetModel";
import { OTHER } from "../lib/palette";
import { attrColor, attrLabel, attrT, DENS_BINS, fmtAttr, shortAttr, statOf, type AttrScale, type AttrStat } from "./attrHeatmap";
import { compFill } from "./upsetPatterns";
import type { BelowMode } from "./UpsetControls";

const COL = 26, BAR_H = 110, DOT_ROW = 20, COMP_H = 40, ATTR_H = 14;
/** Height of a density attribute row. */
const DENS_H = 40;
/** Every slot of the dot matrix is a disc of radius DOT_R. A ring is the same disc in grey with a white hole whose
 *  radius (HOLE_MIN to HOLE_MAX) shrinks as the column's mean membership in the set rises towards τ. */
const DOT_R = 6.5, HOLE_MIN = 1.5, HOLE_MAX = 5;
/** Width of the set bars, left of the set names. */
const SET_W = 72;
/** Space before the summary columns. */
const GAP = 14;
/** At most this many of a summary's columns are listed when it is expanded. */
export const LIST_MAX = 30;

/** One slot of the dot matrix: a member (black disc), out (light grey disc) or near (a grey disc with a white hole of
 *  radius `hole`). */
function Dot({ cx, cy, member, hole = 0 }: { cx: number; cy: number; member: boolean; hole?: number }) {
  if (member) return <circle cx={cx} cy={cy} r={DOT_R} fill="var(--ink)" />;
  return (
    <>
      <circle cx={cx} cy={cy} r={DOT_R} fill={hole > 0 ? "var(--near-ring)" : "var(--rule)"} />
      {hole > 0 && <circle cx={cx} cy={cy} r={hole} fill="var(--panel)" />}
    </>
  );
}

/** One slot of a summary column: a grey disc filled from the bottom in proportion to `share` (the share of the
 *  summary's observations whose column contains the set). */
function PartialDot({ cx, cy, share }: { cx: number; cy: number; share: number }) {
  const r = DOT_R, s = Math.min(1, Math.max(0, share));
  const yc = cy + r - 2 * r * s, w = Math.sqrt(Math.max(0, r * r - (yc - cy) ** 2));
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="var(--rule)" />
      {s >= 0.999 ? <circle cx={cx} cy={cy} r={r} fill="var(--ink)" />
        : s > 0 && <path d={`M${cx - w},${yc} A${r},${r} 0 ${s > 0.5 ? 1 : 0} 0 ${cx + w},${yc} Z`} fill="var(--ink)" />}
      <circle cx={cx} cy={cy} r={r - 0.4} fill="none" stroke="var(--ink-3)" strokeWidth={0.8} />
    </>
  );
}

type Summary = ReturnType<typeof summarise>;
/** One drawn column: a combination of sets, or one sub-column of an expanded column. */
export type Column = {
  key: string;
  labels: number[];
  n: number;
  /** Observations near at least one set outside the column. */
  nBorder: number;
  fuzzy: number;
  /** For a sub-column: its column and what its observations are near. */
  sub: { parent: string; kind: NearGroup["kind"]; near: number[] } | null;
  /** For a summary column: the columns of one degree it pools. */
  summary: DegreeSummary | null;
  /** For a column listed under an expanded summary: that summary's key. */
  listedIn: string | null;
  /** Has borderline observations, so it can be split into sub-columns. */
  expandable: boolean;
  expanded: boolean;
};
/** Per drawn column: its observations, mean membership and share near each set, typical observations, attribute
 *  summaries and (for a column) its sub-column groups. */
export type ColumnInfo = { idx: number[]; mean: number[]; near: number[]; typical: number[]; attr: Summary[]; dens: (Float64Array | null)[]; groups: NearGroup[] | null };
export type Comp = { cat: Category; comp: Map<string, number[]> };
export type Tip = (ev: React.MouseEvent, title: string, lines: string[]) => void;

/**
 * The fuzzy UpSet as one SVG: per column (combination of sets) the fuzzy-size bar (solid) over the number of observations
 * (outline); the dot matrix, with a grey ring where enough of the column is near that set (the smaller its white
 * hole, the higher the column's mean membership in it); one composition row per category and the attribute heatmap. ▸ under a bar
 * splits the column into sub-columns by what its observations are near. After a gap come the summary columns, one per
 * degree, pooling the columns not drawn individually: a partially filled disc per set, ▸ to list their columns.
 * `flip` transposes it: one row per combination, the sets across the top.
 */
export default function UpsetMatrix({
  sets, setSize, shown, info, comps, attrs, attrAll, scales, belowMode, minShare, tau, flip, stat, activeKey, pickedKeys, selCounts, selLabels,
  obsWord, title, colName, onSelect, onToggle, tip, onLeave,
}: {
  sets: SetFamily;
  /** Per set: observations reaching τ (outline bar) and the sum of their memberships (solid bar). */
  setSize: { n: number[]; fuzzy: number[] };
  shown: Column[];
  info: Map<string, ColumnInfo>;
  comps: Comp[];
  attrs: NumericAttr[];
  attrAll: Summary[];
  scales: AttrScale[];
  belowMode: BelowMode;
  /** A near set is marked when at least this share of a column is near it. */
  minShare: number;
  /** The threshold: a ring's hole shows the mean membership on 0 → τ. */
  tau: number;
  /** One row per combination: everything is drawn as usual inside a transpose (x <-> y), text kept upright. */
  flip: boolean;
  stat: AttrStat;
  /** The clicked column. */
  activeKey: string | null;
  /** The column (and sub-column) of the observation marked on the map. */
  pickedKeys: Set<string>;
  /** Per column, how many of the selected observations it holds; null without a selection. */
  selCounts: Map<string, number> | null;
  /** Sets of the columns that hold selected observations (the other rows fade); null without a selection. */
  selLabels: Set<number> | null;
  obsWord: string;
  title: (i: number) => string;
  colName: (key: string) => string;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  tip: Tip;
  onLeave: () => void;
}) {
  const L = sets.names.length;
  // flipped, an attribute cell spans the row's height, so it gets more room for its value
  const aH = flip ? 30 : ATTR_H;
  /** Position of a text drawn inside the (maybe transposed) chart: flipped, a second transpose cancels the first, so
   *  the text stays upright at (y, x); `rot` slants it 45° to read up and to the right (for labels over a narrow track). */
  const at = (x: number, y: number, rot = false) =>
    flip ? { x: 0, y: 0, transform: `translate(${x} ${y}) matrix(0 1 1 0 0 0)${rot ? " rotate(-45)" : ""}` } : { x, y };
  /** The anchor of a margin label: flipped, it reads up and away from the chart. */
  const side = flip ? "start" : "end";
  const nameW = Math.min(230, Math.max(90, ...sets.names.map((n) => n.length * 6.5), ...attrs.map((a, r) => attrLabel(a, scales[r]).length * 6)));
  // the set bars just left of the set names (the margin is also sized for the longer attribute labels)
  const setNameW = Math.max(...sets.names.map((n) => n.length * 6.5));
  const LEFT = Math.max(nameW + 16, 4 + SET_W + 8 + setNameW + 25);
  const setR = LEFT - 25 - setNameW - 8, setMax = Math.max(1, ...setSize.n);
  // flipped, the slanted labels of the last columns stick out to the right by up to nameW · cos 45°
  const slantPad = flip ? Math.ceil(nameW * Math.SQRT1_2) : 0;
  const yBase = 14 + BAR_H;
  const yDots = yBase + 12;
  const yComp = yDots + L * DOT_ROW + 10;
  const yAttr = yComp + comps.length * (COMP_H + 8);
  // attribute rows: a heatmap cell, or a taller density plot
  const rowH = attrs.map((a) => (a.plot === "density" ? DENS_H : aH));
  const rowY = rowH.map((_, r) => yAttr + rowH.slice(0, r).reduce((t, h) => t + h, 0));
  const H = yAttr + (attrs.length ? rowH.reduce((t, h) => t + h, 0) + 6 : 0);
  // column positions: a gap before the first summary
  const firstSum = shown.findIndex((it) => it.summary);
  const xOf = (i: number) => LEFT + i * COL + (firstSum >= 0 && i >= firstSum ? GAP : 0);
  const W = xOf(Math.max(shown.length, 1)) + 8;
  // the axis fits the individual columns; a taller summary bar is cut with a break mark
  const main = shown.filter((it) => !it.summary);
  const maxBar = Math.max(1, ...(main.length ? main : shown).map((it) => it.n));
  const yOf = (v: number) => yBase - (Math.min(v, maxBar) / maxBar) * BAR_H;
  const setsOf = (ls: number[]) => ls.map((l) => sets.names[l]).join(" & ");
  const pctOf = (v: number) => (v > 0 && v < 0.005 ? "<1" : String(Math.round(v * 100)));
  const groupName = (g: NearGroup) =>
    g.kind === "mixed" ? "mixed (near 3+ sets)" : g.kind === "other" ? "other" : `near ${setsOf(g.near)}`;

  return (
    <svg width={flip ? H + slantPad : W} height={flip ? W : H} role="img" aria-label={`Fuzzy UpSet of the ${sets.title}`} onMouseLeave={onLeave}>
      <g transform={flip ? "matrix(0 1 1 0 0 0)" : undefined}>
      <line x1={LEFT - 4} x2={LEFT - 4} y1={yBase - BAR_H} y2={yBase} className="fu-axis" />
      {[0, maxBar / 2, maxBar].map((t) => (
        <text key={t} className="bar-lbl" {...at(LEFT - 8, flip ? yOf(t) : yOf(t) + 3)} textAnchor={flip ? "middle" : "end"}>
          {t >= 10 || Number.isInteger(t) ? Math.round(t) : t.toFixed(1)}
        </text>
      ))}
      <text className="bar-hd" {...(flip ? at(LEFT - 34, yBase - BAR_H / 2) : at(LEFT - 40, yBase - BAR_H / 2 - 6))} textAnchor={flip ? "middle" : "end"}>fuzzy size</text>
      <text className="bar-hd" {...(flip ? at(LEFT - 23, yBase - BAR_H / 2) : at(LEFT - 40, yBase - BAR_H / 2 + 5))} textAnchor={flip ? "middle" : "end"}>{obsWord}</text>
      <text className="bar-lbl" {...(flip ? at(setR - SET_W / 2, yDots - 6) : at(setR, yDots - 3))} textAnchor="end">{obsWord} ≥ τ</text>
      {sets.names.map((n, l) => (
        <g key={n} opacity={selLabels && !selLabels.has(l) ? 0.3 : 1}>
          {l % 2 === 0 && <rect x={LEFT} y={yDots + l * DOT_ROW} width={W - LEFT - 8} height={DOT_ROW} fill="var(--rule-2)" opacity={0.6} />}
          <rect x={LEFT - 19} y={yDots + l * DOT_ROW + 5} width={10} height={10} rx={2} fill={sets.colors[l] ?? OTHER} />
          <text className="bar-lbl" {...at(LEFT - 25, yDots + l * DOT_ROW + 14, true)} textAnchor={side}>{n}</text>
          <g
            onMouseMove={(ev) => tip(ev, n, [
              `${setSize.n[l]} ${obsWord} reach τ ${tau.toFixed(2)} (in any column holding ${n})`,
              `sum of their memberships ${setSize.fuzzy[l].toFixed(1)}${setSize.n[l] ? ` (mean ${(setSize.fuzzy[l] / setSize.n[l]).toFixed(2)})` : ""}`,
            ])}
          >
            <rect x={setR - SET_W} y={yDots + l * DOT_ROW + 2} width={SET_W} height={DOT_ROW - 4} fill="transparent" />
            {setSize.n[l] > 0 && (
              <rect
                x={setR - (setSize.n[l] / setMax) * SET_W} y={yDots + l * DOT_ROW + 4.5} width={(setSize.n[l] / setMax) * SET_W} height={11}
                rx={2} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" strokeWidth={1}
              />
            )}
            {setSize.fuzzy[l] > 0 && (
              <rect
                x={setR - (setSize.fuzzy[l] / setMax) * SET_W} y={yDots + l * DOT_ROW + 4.5} width={(setSize.fuzzy[l] / setMax) * SET_W} height={11}
                rx={2} fill="var(--accent)"
              />
            )}
          </g>
        </g>
      ))}
      {firstSum >= 0 && (
        <line x1={xOf(firstSum) - GAP / 2} x2={xOf(firstSum) - GAP / 2} y1={0} y2={H} stroke="var(--rule)" strokeWidth={1.5} />
      )}
      {comps.map((c, r) => (
        <text key={c.cat.key} className="bar-hd" {...at(LEFT - 8, yComp + r * (COMP_H + 8) + COMP_H / 2 + 3, true)} textAnchor={side}>by {c.cat.title}</text>
      ))}
      {attrs.map((a, r) => (
        <text key={a.key} className="bar-lbl" {...at(LEFT - 8, rowY[r] + rowH[r] / 2 + 3, true)} textAnchor={side}>{attrLabel(a, scales[r])}</text>
      ))}

      {shown.map((it, i) => {
        const x = xOf(i), cx = x + COL / 2;
        const sm = it.summary;
        const cut = it.n > maxBar;
        const nObs = it.n, nPure = it.n - it.nBorder;
        // one axis for both bars: a column's fuzzy size never exceeds its number of observations (strengths are <= 1)
        const topF = yOf(it.fuzzy), rrF = Math.min(3, (yBase - topF) / 2);
        const topN = yOf(nObs), rrN = Math.min(3, (yBase - topN) / 2), bw = 14;
        const barPath = (t: number, r: number) => `M${cx - bw / 2},${yBase}V${t + r}q0,${-r} ${r},${-r}H${cx + bw / 2 - r}q${r},0 ${r},${r}V${yBase}Z`;
        const ys = it.labels.map((l) => yDots + l * DOT_ROW + DOT_ROW / 2);
        const inf = info.get(it.key)!;
        const nSel = selCounts?.get(it.key) ?? null;
        const dim = activeKey && activeKey !== it.key ? 0.45 : 1;
        const head = colName(it.key);
        const lines = [
          `${nObs} ${obsWord} · fuzzy size ${it.fuzzy.toFixed(1)}`,
          ...(sm ? [
            `${sm.combos.length} ${sm.combos.length === 1 ? "column" : "columns"} not drawn individually; largest:`,
            ...sm.combos.slice(0, 3).map((c) => `  ${setsOf(c.labels)} ${c.n}`),
          ] : []),
          `${nPure} pure · ${it.nBorder} borderline`,
          ...(inf.groups && it.nBorder > 0
            ? [`borderline: ${inf.groups.filter((g) => g.kind !== "pure").map((g) => `${groupName(g)} ${g.idx.length}`).join(" · ")}`]
            : []),
          ...(nSel !== null ? [`selected: ${nSel} of ${nObs}`] : []),
          ...(sm ? [] : [it.labels.map((l) => `${sets.names[l]} ${Math.round(inf.mean[l] * 100)}%`).join(" · ")]),
          ...comps.flatMap((c) => {
            const f = c.comp.get(it.key);
            if (!f) return [];
            const top = f.map((v, g) => [v, g] as const).filter(([v]) => v > 0.05).sort((p, q) => q[0] - p[0]).slice(0, 3);
            return top.length ? [`${c.cat.title}: ${top.map(([v, g]) => `${c.cat.names[g]} ${Math.round(v * 100)}%`).join(" · ")}`] : [];
          }),
          `e.g. ${inf.typical.map(title).join("; ")}`,
          ...(sm ? [it.expanded ? "▾ under the bar: fold its columns" : `▸ under the bar: list its columns${sm.combos.length > LIST_MAX ? ` (the ${LIST_MAX} largest)` : ""}`]
            : it.expandable ? [it.expanded ? "▾ under the bar: fold the sub-columns" : "▸ under the bar: split by what they are near"] : []),
        ];
        return (
          <g
            key={it.key} style={{ cursor: "pointer" }} onClick={() => onSelect(it.key)} opacity={nSel === 0 ? 0.35 : 1}
            onMouseMove={(ev) => tip(ev, head, lines)}
          >
            <rect
              x={x} y={0} width={COL} height={H}
              fill={sm ? "var(--rule-2)" : it.sub || it.listedIn ? "var(--accent-bg)" : "transparent"} opacity={it.sub || it.listedIn ? 0.55 : 1}
            />
            {activeKey === it.key && (
              <rect x={x + 1} y={2} width={COL - 2} height={H - 4} rx={3} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
            )}
            {pickedKeys.has(it.key) && (
              <path d={`M${cx - 4.5},1 L${cx + 4.5},1 L${cx},8 Z`} fill="var(--accent)" pointerEvents="none" />
            )}
            {nObs > 0 && <path d={barPath(topN, rrN)} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" strokeWidth={1} opacity={dim} />}
            {it.fuzzy > 0 && <path d={barPath(topF, rrF)} fill="var(--accent)" opacity={dim} />}
            {cut && (
              <g pointerEvents="none">
                <path d={`M${cx - bw / 2 - 2},${topN + 13} l${bw + 4},-4 M${cx - bw / 2 - 2},${topN + 17} l${bw + 4},-4`} stroke="var(--panel)" strokeWidth={2.5} />
                <text className="bar-lbl" {...(flip ? at(cx + 3, topN - 2) : at(cx, topN - 2))} textAnchor={flip ? "end" : "middle"}>{nObs}</text>
              </g>
            )}
            {it.sub?.kind === "mixed" && (
              <path d={`M${cx},${topN - 10} l4,4 l-4,4 l-4,-4 Z`} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.2} pointerEvents="none" />
            )}
            {it.sub?.kind === "other" && (
              <text className="bar-lbl" {...(flip ? at(cx + 3, topN - 3) : at(cx, topN - 3))} textAnchor={flip ? "end" : "middle"} pointerEvents="none">…</text>
            )}
            {nSel !== null && nSel > 0 && (() => {
              const ts = yOf(nSel);
              return <rect x={cx - 4} y={ts} width={8} height={Math.max(yBase - ts, 1)} rx={1.5} fill="var(--select)" stroke="var(--panel)" strokeWidth={1} pointerEvents="none" />;
            })()}
            {it.expandable && (
              <g onClick={(ev) => (ev.stopPropagation(), onToggle(it.key))}>
                <rect x={x} y={yBase + 1} width={COL} height={10} fill="transparent" />
                <path
                  d={it.expanded !== flip ? `M${cx - 3.5},${yBase + 3} L${cx + 3.5},${yBase + 3} L${cx},${yBase + 9} Z` : `M${cx - 2.5},${yBase + 2.5} L${cx + 3},${yBase + 6} L${cx - 2.5},${yBase + 9.5} Z`}
                  fill="var(--accent)"
                />
              </g>
            )}
            {/* a summary: one partially filled disc per set */}
            {sm && sets.names.map((n, l) => {
              const cy = yDots + l * DOT_ROW + DOT_ROW / 2;
              return (
                <g
                  key={l} opacity={selLabels && !selLabels.has(l) ? 0.3 : 1}
                  onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${head} · ${n}`, [
                    `${n} in the column of ${pctOf(sm.share[l])}% of its ${obsWord}`,
                    `mean membership ${pctOf(inf.mean[l])}%`,
                  ]))}
                >
                  <PartialDot cx={cx} cy={cy} share={sm.share[l]} />
                </g>
              );
            })}
            {/* plain grey discs first, then the line joining the column's sets, then the rings and black dots over it */}
            {!sm && [false, true].map((front) => (
              <g key={String(front)}>
                {front && ys.length > 1 && (
                  <line x1={cx} x2={cx} y1={Math.min(...ys)} y2={Math.max(...ys)} stroke="var(--ink)" strokeWidth={3} pointerEvents="none" />
                )}
            {sets.names.map((n, l) => {
              const member = it.labels.includes(l);
              const share = inf.near[l], k = Math.round(share * inf.idx.length);
              // a grey ring where enough of the column is near (almost belongs to) the set; its hole shrinks with the mean
              const hole = !member && belowMode === "rings" && nearMarked(share, minShare) ? holeRadius(inf.mean[l], tau, HOLE_MIN, HOLE_MAX) : 0;
              if ((member || hole > 0) !== front) return null;
              const cy = yDots + l * DOT_ROW + DOT_ROW / 2;
              return (
                <g
                  key={l} opacity={selLabels && !selLabels.has(l) ? 0.3 : 1}
                  onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${head} · ${n}`, [
                    ...(member ? [] : [`${k} of ${inf.idx.length} near ${n} (${pctOf(share)}%)`]),
                    `mean membership ${pctOf(inf.mean[l])}%`,
                  ]))}
                >
                  <Dot cx={cx} cy={cy} member={member} hole={hole} />
                </g>
              );
            })}
              </g>
            ))}
            {comps.map((c, r) => {
              const f = c.comp.get(it.key);
              if (!f) return null;
              let acc = 0;
              const y0 = yComp + r * (COMP_H + 8);
              return (
                <g key={c.cat.key}>
                  {f.map((v, g) => {
                    if (v <= 0) return null;
                    const h = v * COMP_H;
                    const el = <rect key={g} x={x + 4} y={y0 + acc + 1} width={COL - 8} height={Math.max(h - 2, 0.6)} fill={compFill(g, r)} />;
                    acc += h;
                    return el;
                  })}
                </g>
              );
            })}
            {attrs.map((a, r) => {
              const s = inf.attr[r];
              const all = attrAll[r];
              if (!s || !all) return null;
              const d = inf.dens[r];
              if (a.plot === "density" && d) {
                // one solid density of the column's values, scaled to its own peak: the value runs up the row (flipped,
                // left to right) and the density grows from a baseline at the left (flipped, at the bottom)
                const y0 = rowY[r] + 2, h = rowH[r] - 4, base = flip ? x + COL - 2 : x + 2, w = (COL - 4) * (flip ? -1 : 1);
                const vy = (t: number) => (flip ? y0 + t * h : y0 + h - t * h);
                const peak = Math.max(...d, 1e-12);
                const path = `M${base},${vy(0)}` + Array.from(d, (v, b) => `L${base + (v / peak) * w},${vy(b / (DENS_BINS - 1))}`).join("") + `L${base},${vy(1)}Z`;
                return (
                  <g
                    key={a.key}
                    onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${head} · ${a.title}`, [
                      `median ${fmtAttr(a, s.median)} (middle half ${fmtAttr(a, s.q1)}–${fmtAttr(a, s.q3)})`,
                      `all ${obsWord}: median ${fmtAttr(a, all.median)}`,
                    ]))}
                  >
                    <rect x={x + 1} y={rowY[r]} width={COL - 2} height={rowH[r] - 1} rx={1.5} fill="var(--rule-2)" opacity={0.6} />
                    <path d={path} fill="var(--accent)" />
                  </g>
                );
              }
              const bg = attrColor(attrT(scales[r], statOf(s, stat)));
              return (
                <g
                  key={a.key}
                  onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${head} · ${a.title}`, [`${stat} ${fmtAttr(a, statOf(s, stat))} (all: ${fmtAttr(a, statOf(all, stat))})`]))}
                >
                  <rect x={x + 1} y={rowY[r]} width={COL - 2} height={rowH[r] - 1} rx={1.5} fill={bg} />
                  <text className="fu-attr-val" {...(flip ? at(cx + 3, rowY[r] + rowH[r] / 2) : at(cx, rowY[r] + rowH[r] / 2 + 2.5))} textAnchor="middle" fill={inkOn(bg)}>
                    {shortAttr(a, statOf(s, stat))}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      </g>
    </svg>
  );
}

/** The UpSet's legend: bars, selection, near sets, attributes and composition swatches. */
export function UpsetLegend({ belowMode, minShare, tau, stat, hasAttrs, comps, obsWord }: {
  belowMode: BelowMode; minShare: number; tau: number; stat: AttrStat; hasAttrs: boolean; comps: Comp[]; obsWord: string;
}) {
  return (
    <section className="legend-box" aria-label="Legend">
      <p className="legend-title">Legend</p>
      <div className="legend-grid">
        <div className="lg">
          <span className="lg-hd">Bars</span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true"><rect x={3} y={2} width={8} height={12} rx={2} fill="var(--accent)" /></svg>
            solid: fuzzy size (sum of strengths)
          </span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true">
              <rect x={3.5} y={1.5} width={7} height={11} rx={2} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" />
            </svg>
            outline: number of {obsWord}
          </span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true">
              <rect x={1.5} y={3.5} width={11} height={7} rx={2} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" />
              <rect x={5} y={3.5} width={7.5} height={7} rx={2} fill="var(--accent)" />
            </svg>
            left of each set: {obsWord} reaching τ in it (outline) and the sum of their memberships (solid)
          </span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true"><path d="M4.5,3.5 L10,7 L4.5,10.5 Z" fill="var(--accent)" /></svg>
            ▸ under a bar: split it by what they are near
          </span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true"><path d="M7,2.5 l4,4 l-4,4 l-4,-4 Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.2} /></svg>
            mixed: near 3 or more other sets
          </span>
        </div>
        <div className="lg">
          <span className="lg-hd">Summaries (after the gap)</span>
          <span className="lg-row">
            <svg width={62} height={16} aria-hidden="true">
              {[0.25, 0.5, 0.9].map((f, i) => <PartialDot key={i} cx={8 + i * 20} cy={8} share={f} />)}
            </svg>
            the columns not drawn individually, one summary per number of sets; a disc fills with the share of its {obsWord} in the set
          </span>
          <span className="lg-row">
            <svg width={14} height={14} aria-hidden="true">
              <rect x={3} y={1} width={8} height={13} rx={2} fill="var(--accent)" />
              <path d="M1,8 l12,-3 M1,11 l12,-3" stroke="var(--panel)" strokeWidth={1.8} />
            </svg>
            cut bar: taller than the axis, its number on top
          </span>
        </div>
        <div className="lg">
          <span className="lg-hd">Selection</span>
          <span className="lg-row">
            <svg width={10} height={14} aria-hidden="true"><rect x={1} y={1} width={8} height={12} rx={1.5} fill="var(--select)" /></svg>
            selected {obsWord} in each column; columns and sets without any fade
          </span>
        </div>
        <div className="lg">
          <span className="lg-hd">Near a set (almost belongs)</span>
          <span className="lg-row">
            <svg width={62} height={16} aria-hidden="true">
              {[0.1, 0.5, 0.9].map((f, i) => (
                <Dot key={i} cx={8 + i * 20} cy={8} member={false} hole={belowMode === "rings" ? holeRadius(f * tau, tau, HOLE_MIN, HOLE_MAX) : 0} />
              ))}
            </svg>
            {belowMode === "rings"
              ? `grey ring: at least ${Math.round(minShare * 100)}% of the column's ${obsWord} are near the set; the smaller the hole, the higher their mean membership in it (0 → τ ${tau.toFixed(2)})`
              : "not shown (Display options → Near)"}
          </span>
        </div>
        {hasAttrs && (
          <div className="lg">
            <span className="lg-hd">Attributes · {stat} per column</span>
            <span className="lg-row">
              <svg width={66} height={12} aria-hidden="true">
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => <rect key={i} x={i * 13} y={1} width={12} height={10} rx={1.5} fill={attrColor(t)} />)}
              </svg>
              low → high, on each row's own scale (5th–95th percentile)
            </span>
          </div>
        )}
        {comps.map((c, r) => (
          <div key={c.cat.key} className="lg lg-wide">
            <span className="lg-hd">Composition · {c.cat.title}</span>
            <span className="lg-row lg-swatches">
              {c.cat.names.map((n, g) => (
                <span key={n}>
                  <svg width={12} height={12} aria-hidden="true"><rect width={12} height={12} rx={2} fill={compFill(g, r)} /></svg>
                  {n}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
