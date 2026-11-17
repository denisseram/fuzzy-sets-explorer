import { area, curveMonotoneX, line, scaleLinear } from "d3";
import { holeRadius } from "../lib/fuzzyUpset";
import { binLabel, N_BINS, type Mode, type Row, type Threshold } from "../lib/fuzzyDecomposition";

/** Row height: the smallest that keeps a histogram readable (plot height ROW_H − 9 = 21 px). */
export const ROW_H = 30;
/** Width of every membership histogram (membership 0 at the left edge, 1 at the right edge). */
export const HIST_W = 72;
/** Circles: one size for every set slot; a ring is the same disc in grey with a white hole. */
const DOT_R = 6.5, HOLE_MIN = 1.5, HOLE_MAX = 5;
/** Matrix cell: the circle at the left, then the histogram. */
const CELL_W = 112, CIRCLE_X = 12, HIST_X = 28;
/** Summary bars, left of the matrix, growing leftward from its edge (as in the old flipped layout). */
const PAD = 22, BAR_W = 150, BAR_H = 12, GAP = 14;
const HEAD = 62;
/** Room right of the matrix for the reference label. */
const LABEL_W = 210;

/** One set slot: a member (black disc), out (light grey disc) or ring (grey disc with a white hole of radius `hole`). */
export function Dot({ cx, cy, member, hole = 0 }: { cx: number; cy: number; member: boolean; hole?: number }) {
  if (member) return <circle cx={cx} cy={cy} r={DOT_R} fill="var(--ink)" />;
  return (
    <>
      <circle cx={cx} cy={cy} r={DOT_R} fill={hole > 0 ? "var(--near-ring)" : "var(--rule)"} />
      {hole > 0 && <circle cx={cx} cy={cy} r={hole} fill="var(--panel)" />}
    </>
  );
}

export type Tip = (ev: React.MouseEvent, title: string, lines: string[]) => void;

/** The selected element's reference in the selected row. */
export type RefMark = {
  /** The element's display name. */
  who: string;
  label: string;
  value: number;
  /** Additive mode: the band from the outside maximum to the inside minimum (its width is the component). */
  band: { from: number; to: number; component: number } | null;
  /** Per set of the dataset: the element's original membership. */
  membership: (set: number) => number;
};

const fmt = (v: number) => v.toFixed(2);

/** A small histogram: bars per 0.2-wide bin plus a monotone curve through the bin centres (no overshoot). */
function Hist({ x, base, h, counts, maxC, color, tint }: { x: number; base: number; h: number; counts: number[]; maxC: number; color: string; tint: number }) {
  const bw = HIST_W / N_BINS;
  const y = (c: number) => base - (maxC > 0 ? (c / maxC) * h : 0);
  const pts = counts.map((c, b) => [x + (b + 0.5) * bw, y(c)] as [number, number]);
  const any = counts.some((c) => c > 0);
  return (
    <g pointerEvents="none">
      {any && counts.map((c, b) => c > 0 && (
        <rect key={b} x={x + b * bw + 0.75} y={y(c)} width={bw - 1.5} height={base - y(c)} fill={color} fillOpacity={tint} />
      ))}
      {any && <path d={area<[number, number]>().x((p) => p[0]).y0(base).y1((p) => p[1]).curve(curveMonotoneX)(pts) ?? ""} fill={color} fillOpacity={0.08} />}
      {any && <path d={line().curve(curveMonotoneX)(pts) ?? ""} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
    </g>
  );
}

/**
 * The fuzzy UpSet as one SVG, one row per combination of the selected sets K, one column per set. Left: the summary
 * bars (outline = contributors, solid = membership mass, one shared "elements" axis). Matrix: a fixed-size circle per
 * set of the row, joined by a connector; right of each circle the histogram of the row's contributors' ORIGINAL
 * memberships in that set, on an opaque background that interrupts the connector. In threshold mode a set outside
 * the row gets a ring (with a mini histogram of the below-τ memberships) when enough contributors are near it.
 */
export default function UpsetMatrix({
  names, K, rows, mode, maxCount, maxBin, threshold, selected, reference, onSelect, tip, onLeave,
}: {
  names: string[];
  K: number[];
  rows: Row[];
  mode: Mode;
  /** Top of the shared bar axis (fixed across modes, so bars are comparable when switching). */
  maxCount: number;
  /** Shared count scale of every histogram on screen. */
  maxBin: number;
  threshold: Threshold | null;
  selected: string | null;
  reference: RefMark | null;
  onSelect: (key: string) => void;
  tip: Tip;
  onLeave: () => void;
}) {
  const barR = PAD + BAR_W;
  const mx = barR + GAP;
  const colX = (c: number) => mx + c * CELL_W;
  const W = colX(K.length) + LABEL_W;
  const H = HEAD + rows.length * ROW_H + 6;
  const xb = scaleLinear().domain([0, Math.max(1, maxCount)]).range([0, BAR_W]);
  const ticks = xb.ticks(3).filter((t) => Number.isInteger(t));
  const hx = (c: number, v: number) => colX(c) + HIST_X + v * HIST_W;
  const rowName = (T: number[]) => T.map((i) => names[i]).join(" ∩ ");
  const modeName = mode === "inclusive" ? "inclusive intersection" : "additive contribution";
  const plural = (n: number) => `${n} ${n === 1 ? "element" : "elements"}`;

  return (
    <svg width={W} height={H} role="img" aria-label={`Fuzzy UpSet, ${modeName}s of ${K.map((i) => names[i]).join(", ")}`} onMouseLeave={onLeave}>
      {/* bar key and axis */}
      <g className="bar-lbl">
        <rect x={PAD} y={6} width={14} height={9} rx={2} className="fu-bar-out" />
        <text x={PAD + 19} y={14}>contributors</text>
        <rect x={PAD + 88} y={6} width={14} height={9} rx={2} className="fu-bar-in" />
        <text x={PAD + 107} y={14}>membership mass</text>
      </g>
      <text className="bar-hd" x={barR - BAR_W / 2} y={32} textAnchor="middle">elements</text>
      <line x1={barR - BAR_W} x2={barR} y1={HEAD - 6} y2={HEAD - 6} className="fu-axis" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={barR - xb(t)} x2={barR - xb(t)} y1={HEAD - 9} y2={HEAD - 6} className="fu-axis" />
          <text className="bar-lbl" x={barR - xb(t)} y={HEAD - 12} textAnchor="middle">{t}</text>
        </g>
      ))}
      {/* column headers: set name, and the 0–1 membership axis of its histograms */}
      {K.map((i, c) => (
        <g key={i}>
          <text className="fu-set" x={hx(c, 0.5)} y={30} textAnchor="middle">
            <title>{names[i]}</title>
            {names[i].length > 16 ? names[i].slice(0, 15) + "…" : names[i]}
          </text>
          <text className="bar-hd" x={hx(c, 0)} y={HEAD - 8} textAnchor="middle">0</text>
          <text className="bar-hd" x={hx(c, 1)} y={HEAD - 8} textAnchor="middle">1</text>
          {threshold && (
            <text className="bar-hd" x={hx(c, threshold.tau)} y={HEAD - 8} textAnchor="middle">τ</text>
          )}
        </g>
      ))}

      {rows.map((r, ri) => {
        const a = r[mode];
        const y = HEAD + ri * ROW_H, cy = y + ROW_H / 2;
        const base = y + ROW_H - 5, hh = ROW_H - 9;
        const isSel = selected === r.key;
        const dim = selected && !isSel ? 0.45 : 1;
        const cols = r.sets.map((i) => K.indexOf(i));
        const cxs = cols.map((c) => colX(c) + CIRCLE_X);
        const rings = new Map(a.rings.map((g) => [g.set, g]));
        const n = a.contributors.length;
        const bg = isSel ? "var(--accent-bg)" : "var(--panel)";
        const name = rowName(r.sets);
        const barTip = (ev: React.MouseEvent) => tip(ev, name, [
          modeName,
          `contributors: ${n}`,
          `membership mass: ${fmt(a.mass)}${n ? ` (mean ${fmt(a.mass / n)} per contributor)` : ""}`,
        ]);
        return (
          <g key={r.key} className="fu-row" onClick={() => onSelect(r.key)} aria-label={name}>
            <rect x={PAD} y={y} width={W - PAD} height={ROW_H} fill={bg} className="fu-row-bg" />
            <line x1={PAD} x2={W - LABEL_W} y1={y + ROW_H} y2={y + ROW_H} stroke="var(--rule-2)" />
            {/* summary bars on one shared axis: mass ≤ contributors because each contributes at most 1 */}
            <g onMouseMove={barTip}>
              <rect x={PAD} y={y} width={BAR_W} height={ROW_H} fill="transparent" />
              <rect className="fu-bar fu-bar-out" x={barR - xb(n)} y={cy - BAR_H / 2} width={xb(n)} height={BAR_H} rx={2} opacity={n ? 1 : 0} />
              <rect className="fu-bar fu-bar-in" x={barR - xb(a.mass)} y={cy - BAR_H / 2} width={xb(a.mass)} height={BAR_H} rx={2} opacity={a.mass > 0 ? 1 : 0} />
            </g>
            <g opacity={dim}>
              {/* light empty dots, then the connector, then the opaque histogram cells and the circles over it */}
              {K.map((i, c) => !r.sets.includes(i) && !rings.has(i) && <Dot key={i} cx={colX(c) + CIRCLE_X} cy={cy} member={false} />)}
              {cxs.length > 1 && (
                <line x1={Math.min(...cxs)} x2={Math.max(...cxs)} y1={cy} y2={cy} stroke="var(--ink)" strokeWidth={isSel ? 3.5 : 2.5} />
              )}
            </g>
            {K.map((i, c) => {
              const member = r.sets.includes(i);
              const ring = rings.get(i);
              if (!member && !ring) return null;
              const x0 = colX(c) + HIST_X;
              const p = r.sets.indexOf(i);
              const counts = member ? a.hists[p] : ring!.hist;
              const color = member ? "var(--accent)" : "var(--near-ring)";
              return (
                <g key={i}>
                  <rect x={x0 - 4} y={y + 1.5} width={HIST_W + 8} height={ROW_H - 3} fill={bg} />
                  {threshold && member && <rect x={x0} y={base - hh} width={threshold.tau * HIST_W} height={hh} fill="var(--ink)" fillOpacity={0.03} />}
                  <line x1={x0} x2={x0 + HIST_W} y1={base} y2={base} className="fu-hist-axis" />
                  {threshold && <line x1={x0 + threshold.tau * HIST_W} x2={x0 + threshold.tau * HIST_W} y1={base} y2={base + 3} className="fu-hist-tick" />}
                  <g opacity={dim}>
                    {isSel && reference?.band && member && (
                      <rect
                        x={x0 + reference.band.from * HIST_W} y={base - hh} width={(reference.band.to - reference.band.from) * HIST_W} height={hh}
                        fill="var(--select)" fillOpacity={0.14}
                      />
                    )}
                    <Hist x={x0} base={base} h={hh} counts={counts} maxC={maxBin} color={color} tint={member ? 0.3 : 0.35} />
                  </g>
                  {/* hover targets per bin */}
                  {counts.map((k, b) => (
                    <rect
                      key={b} x={x0 + (b * HIST_W) / N_BINS} y={y + 2} width={HIST_W / N_BINS} height={ROW_H - 4} fill="transparent"
                      onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${name} · ${names[i]}`, member
                        ? [`${names[i]} membership in ${binLabel(b)}: ${plural(k)}`, `of ${plural(n)} contributing (${modeName})`]
                        : [`below τ but near ${names[i]}: ${binLabel(b)}: ${plural(k)}`, "not counted in masses or contributors"]))}
                    />
                  ))}
                  {isSel && reference && member && (
                    <g>
                      <line
                        x1={x0 + reference.value * HIST_W} x2={x0 + reference.value * HIST_W} y1={y + 2} y2={base}
                        stroke="var(--select)" strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none"
                      />
                      <rect
                        x={x0 + reference.value * HIST_W - 3} y={y + 2} width={6} height={base - y - 2} fill="transparent"
                        onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, reference.label, [
                          `${reference.who}: ${names[i]} = ${fmt(reference.membership(i))}`,
                          ...(reference.band ? [`component band ${fmt(reference.band.from)}–${fmt(reference.band.to)} (width ${fmt(reference.band.component)})`] : []),
                        ]))}
                      />
                    </g>
                  )}
                </g>
              );
            })}
            {/* circles and rings over the connector: they only identify the combination */}
            <g opacity={dim}>
              {K.map((i, c) => {
                const member = r.sets.includes(i);
                const ring = rings.get(i);
                if (!member && !ring) return null;
                const cx = colX(c) + CIRCLE_X;
                return (
                  <g
                    key={i}
                    onMouseMove={(ev) => (ev.stopPropagation(), tip(ev, `${name} · ${names[i]}`, ring
                      ? [`${ring.values.length} of ${ring.contributors} contributors have ${fmt(threshold!.beta * threshold!.tau)} ≤ ${names[i]} < ${fmt(threshold!.tau)}; mean ${fmt(ring.mean)}`]
                      : [`${names[i]} is in this combination`]))}
                  >
                    <circle cx={cx} cy={cy} r={DOT_R + 3} fill="transparent" />
                    <Dot cx={cx} cy={cy} member={member} hole={ring ? holeRadius(ring.mean, threshold!.tau, HOLE_MIN, HOLE_MAX) : 0} />
                  </g>
                );
              })}
            </g>
            {isSel && reference && (
              <text className="fu-ref-lbl" x={colX(K.length) + 4} y={cy + 3.5}>{reference.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

