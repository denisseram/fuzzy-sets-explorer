import { N_BINS } from "../lib/fuzzyDecomposition";

/** Bars of a 5-bin membership histogram (0 left, 1 right) in an SVG group; `tau` marks a threshold. */
export function HistBars({ x, y, w, h, counts, max, tau = null, color = "var(--accent)" }: {
  x: number; y: number; w: number; h: number; counts: readonly number[]; max: number; tau?: number | null; color?: string;
}) {
  const bw = w / N_BINS;
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x + w} y1={y + h} y2={y + h} className="fu-hist-axis" />
      {counts.map((c, b) => c > 0 && (
        <rect key={b} x={x + b * bw + 0.5} y={y + h - (max > 0 ? (c / max) * h : 0)} width={bw - 1} height={max > 0 ? (c / max) * h : 0} fill={color} fillOpacity={0.35} />
      ))}
      {tau !== null && <line x1={x + tau * w} x2={x + tau * w} y1={y - 1} y2={y + h + 2} className="fu-tau-line" />}
    </g>
  );
}

/** A small standalone histogram (shelf chips). */
export default function MiniHist({ counts, max, w = 40, h = 14, tau = null }: { counts: readonly number[]; max: number; w?: number; h?: number; tau?: number | null }) {
  return (
    <svg className="mini-hist" width={w} height={h + 1} aria-hidden="true">
      <HistBars x={0} y={0} w={w} h={h} counts={counts} max={max} tau={tau} />
    </svg>
  );
}

/**
 * A τ slider drawn over the histogram of the memberships it cuts: the histogram spans 0–1 and the slider's thumb
 * (12 px, see .tau-sl in fuzzy-upset.css) sits exactly over τ.
 */
export function TauSlider({ id, value, min, max, step, onChange, counts, countMax, label, width = 150 }: {
  id?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
  counts: readonly number[]; countMax: number; label: string; width?: number;
}) {
  const thumb = 12;
  return (
    <div className="tau-sl" style={{ width }}>
      <svg width={width} height={26} aria-hidden="true">
        <HistBars x={0} y={2} w={width} h={18} counts={counts} max={countMax} tau={value} />
      </svg>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ left: min * width - thumb / 2, width: (max - min) * width + thumb }}
      />
    </div>
  );
}
