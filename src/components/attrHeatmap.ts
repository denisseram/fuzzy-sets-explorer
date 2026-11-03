// Numerical-attribute heatmap under the UpSet columns (Upset.tsx): each cell shows the column's
// median or mean (the user picks) as a number and is colored by that value on the attribute's own fixed scale — one hue, light = low,
// dark = high (viridis, reversed) — spanning the 5th–95th percentile of all observations (values outside clamp to the ends).

import type { NumericAttr } from "../lib/dataset";
import { attrRamp } from "../lib/palette";

export const attrColor = attrRamp;

/** Which summary a cell shows. */
export type AttrStat = "median" | "mean";

/** The chosen summary, on the attribute's own scale (log10 for log attributes, like the scale). */
export const statOf = (s: { median: number; mean: number }, stat: AttrStat) => (stat === "mean" ? s.mean : s.median);

export type AttrScale = { lo: number; hi: number };

/** Per attribute, the 5th–95th percentile of all observations (on a log10 scale for log attributes); a density
 *  attribute spans its full range instead, so no observation falls off the plot. */
export function attrScales(attrs: NumericAttr[]): AttrScale[] {
  return attrs.map((a) => {
    const v = Float64Array.from({ length: a.values.length }, (_, i) => (a.log ? Math.log10(a.values[i]) : a.values[i])).sort();
    const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))];
    return a.plot === "density" ? { lo: v[0], hi: v[v.length - 1] } : { lo: q(0.05), hi: q(0.95) };
  });
}

export const DENS_BINS = 40;

/** Gaussian kernel density of the observations idx over the scale, at DENS_BINS points from lo to hi, normalised to
 *  sum 1 (so the densities of a selection and of all observations share one axis). Bandwidth: 1/20 of the range. */
export function attrDensity(a: NumericAttr, idx: ArrayLike<number>, s: AttrScale): Float64Array | null {
  if (!idx.length) return null;
  const span = Math.max(s.hi - s.lo, 1e-12), h = span / 20, step = span / (DENS_BINS - 1);
  const d = new Float64Array(DENS_BINS);
  for (let c = 0; c < idx.length; c++) {
    const v = a.log ? Math.log10(a.values[idx[c]]) : a.values[idx[c]];
    // the kernel is negligible beyond 3 bandwidths
    const b0 = Math.max(0, Math.ceil((v - 3 * h - s.lo) / step)), b1 = Math.min(DENS_BINS - 1, Math.floor((v + 3 * h - s.lo) / step));
    for (let b = b0; b <= b1; b++) {
      const z = (s.lo + b * step - v) / h;
      d[b] += Math.exp(-0.5 * z * z);
    }
  }
  const sum = d.reduce((t, v) => t + v, 0);
  if (sum > 0) for (let b = 0; b < DENS_BINS; b++) d[b] /= sum;
  return d;
}

/** Position of v on the scale, 0 (light) … 1 (dark). */
export const attrT = (s: AttrScale, v: number) => Math.max(0, Math.min(1, (v - s.lo) / Math.max(s.hi - s.lo, 1e-12)));

/** Full value for tooltips (v on the attribute's own scale, log10 for log attributes). */
export function fmtAttr(a: NumericAttr, v: number): string {
  const x = a.log ? 10 ** v : v;
  const s = a.log ? Math.round(x).toLocaleString("en") : x.toFixed(a.digits);
  return a.unit === "%" ? `${s}%` : a.unit ? `${s} ${a.unit}` : s;
}

/** Short value that fits in a cell: 3.6 · 51 · .93 · 6.7k · '95. */
export function shortAttr(a: NumericAttr, v: number): string {
  const x = a.log ? 10 ** v : v;
  if (a.log || x >= 10000) return x >= 1000 ? `${(x / 1000).toFixed(x < 9950 ? 1 : 0)}k` : String(Math.round(x));
  if (a.digits === 0 && x >= 1000) return `'${String(Math.round(x)).slice(-2)}`; // a year
  if (a.unit === "%" || a.digits === 0) return String(Math.round(x));
  return Math.abs(x) < 0.995 ? x.toFixed(2).replace(/^(-?)0\./, "$1.") : x.toFixed(1); // .99, then 1.0
}

/** Row label with the scale's range, e.g. "mean rating 2.7–4.1", "rated ≥ 4★ 18–77%", "release year 1959–2007". */
export function attrLabel(a: NumericAttr, s: AttrScale): string {
  const end = (v: number) => (!a.log && a.digits === 0 && v >= 1000 ? String(Math.round(v)) : shortAttr(a, v));
  return `${a.title} ${end(s.lo)}–${end(s.hi)}${a.unit === "%" ? "%" : ""}`;
}

