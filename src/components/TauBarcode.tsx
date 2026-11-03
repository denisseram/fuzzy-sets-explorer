import { useEffect, useRef, useState } from "react";
import { tipStyle } from "../lib/tip";

const AXIS = 18;

/**
 * Persistence barcode of the combinations of sets over τ (after persistence barcodes in topological data
 * analysis, and α-cuts of fuzzy sets): x = τ, one row per combination; the band is drawn wherever the combination
 * exists at that τ, its thickness ∝ the number of observations with exactly that combination. Long bands survive any
 * reasonable τ; short ones exist only around one. Clicking the track sets τ for the whole dashboard; clicking a name
 * selects the combination at the current τ.
 */
export default function TauBarcode({
  keys, count, taus, tau, onTau, nodeName, nodeColors, selectedKey, onSelectKey, picked, title, note, unit = "observations", large = false,
}: {
  keys: string[];
  /** count[k][t]: observations with exactly set keys[k] at τ = taus[t]. */
  count: number[][];
  taus: number[];
  tau: number;
  onTau: (t: number) => void;
  nodeName: (key: string) => string;
  nodeColors: (key: string) => string[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  /** For the observation picked elsewhere: its set at each τ (null where it has none). */
  picked: (string | null)[] | null;
  title: string;
  note: string;
  /** What the observations are called (tooltips). */
  unit?: string;
  /** Large view: taller rows, more sets, narrower name column. */
  large?: boolean;
}) {
  const ROW = large ? 26 : 18, NAME_W = large ? 0.2 : 0.36, MAX_ROWS = large ? 80 : 40, NAME_CH = large ? 40 : 22;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; rows: string[] } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rows: the sets that persist most (area under their size curve) first
  const order = keys.map((_, k) => k).sort((a, b) => count[b].reduce((x, y) => x + y, 0) - count[a].reduce((x, y) => x + y, 0));
  const shown = order.slice(0, MAX_ROWS);
  const maxC = Math.max(1, ...shown.flatMap((k) => count[k]));
  const x0 = Math.round(w * NAME_W), x1 = w - 6;
  const lo = taus[0], hi = taus[taus.length - 1];
  const X = (t: number) => x0 + ((t - lo) / (hi - lo || 1)) * (x1 - x0);
  const step = (x1 - x0) / Math.max(taus.length - 1, 1);
  const H = AXIS + shown.length * ROW + 4;
  const nearest = (px: number) => {
    let best = 0;
    taus.forEach((t, i) => Math.abs(X(t) - px) < Math.abs(X(taus[best]) - px) && (best = i));
    return best;
  };
  const ticks = [lo, lo + (hi - lo) / 4, lo + (hi - lo) / 2, lo + (3 * (hi - lo)) / 4, hi];
  const fmt = (v: number) => v.toFixed(v < 1 ? 2 : 1);

  return (
    <div className="tb" ref={ref}>
      <div className="ms-head">
        <div className="tb-title">
          <p className="panel-title"><span className="keep-case">τ</span> barcode · {title}</p>
        </div>
        <p className="sk-note">{note}</p>
      </div>
      <svg width={w} height={H} onMouseLeave={() => setHover(null)} role="img" aria-label={`Sets of ${title} across τ`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={AXIS - 4} y2={H} stroke="var(--rule-2)" />
            <text className="tb-axis" x={X(t)} y={AXIS - 7} textAnchor="middle">{fmt(t)}</text>
          </g>
        ))}
        {shown.map((k, r) => {
          const key = keys[k];
          const y = AXIS + r * ROW, cy = y + ROW / 2;
          const cs = nodeColors(key);
          const sel = selectedKey === key;
          return (
            <g key={key}>
              <text
                className={`tb-name${sel ? " tb-sel" : ""}`} x={2} y={cy + 3.5} onClick={() => onSelectKey(key)}
                onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, title: nodeName(key), rows: ["click: select this set at the current τ"] })}
              >
                {nodeName(key).length > NAME_CH ? `${nodeName(key).slice(0, NAME_CH - 1)}…` : nodeName(key)}
              </text>
              <rect
                x={x0} y={y} width={x1 - x0} height={ROW} fill="transparent" style={{ cursor: "pointer" }}
                onClick={(ev) => onTau(taus[nearest(ev.clientX - (ev.currentTarget.ownerSVGElement!.getBoundingClientRect().left))])}
                onMouseMove={(ev) => {
                  const t = nearest(ev.clientX - ev.currentTarget.ownerSVGElement!.getBoundingClientRect().left);
                  const alive = count[k].map((c, i) => [c, i] as const).filter(([c]) => c > 0);
                  setHover({ x: ev.clientX, y: ev.clientY, title: nodeName(key), rows: [
                    `${count[k][t]} ${unit} at τ = ${fmt(taus[t])}`,
                    alive.length ? `exists for τ ${fmt(taus[alive[0][1]])} – ${fmt(taus[alive[alive.length - 1][1]])}` : "never",
                    "click: set τ here",
                  ] });
                }}
              />
              {count[k].map((c, t) => {
                if (!c) return null;
                const h = Math.max(1.5, (c / maxC) * (ROW - 4));
                const sh = h / cs.length;
                return cs.map((col, s) => (
                  <rect key={`${t}-${s}`} x={X(taus[t]) - step / 2} y={cy - h / 2 + s * sh} width={step + 0.3} height={sh} fill={col} pointerEvents="none" />
                ));
              })}
              {picked?.map((pk, t) => (pk === key ? <circle key={t} cx={X(taus[t])} cy={cy} r={1.6} fill="var(--accent)" pointerEvents="none" /> : null))}
              {sel && <rect x={x0 - 2} y={y + 1} width={x1 - x0 + 4} height={ROW - 2} fill="none" stroke="var(--ink)" strokeWidth={1.2} rx={2} pointerEvents="none" />}
            </g>
          );
        })}
        <line x1={X(tau)} x2={X(tau)} y1={AXIS - 4} y2={H} stroke="var(--accent)" strokeWidth={1.5} pointerEvents="none" />
        <text className="tb-axis tb-now" x={X(tau)} y={H - 1} textAnchor="middle">τ</text>
      </svg>
      {order.length > MAX_ROWS && <p className="sk-note">{order.length - MAX_ROWS} smaller combinations not shown.</p>}
      {hover && (
        <div className="dot-tip" style={tipStyle(hover.x, hover.y)}>
          <div className="dot-tip-hd">{hover.title}</div>
          {hover.rows.map((r) => <div key={r}>{r}</div>)}
        </div>
      )}
    </div>
  );
}
