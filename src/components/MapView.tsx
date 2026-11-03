import { memo, useMemo, useState } from "react";
import { obsLabel, useDataset, type Point2D } from "../lib/dataset";
import { OTHER } from "../lib/palette";
import { pointsInRect } from "../lib/selection";

const W = 220, H = 220, PAD = 8;

const X = (v: number) => PAD + v * (W - 2 * PAD);
const Y = (v: number) => H - PAD - v * (H - 2 * PAD);
const radius = (n: number) => (n > 2500 ? 0.9 : n > 600 ? 1.2 : 1.8);

/** The points (memoised, so moving the pointer only redraws the hover ring); highlighted ones on top, the others
 *  keep their colour but fade. */
const Points = memo(function Points({ pts, fill, highlight }: { pts: Point2D[]; fill: (i: number) => string; highlight: Set<number> | null }) {
  const order = useMemo(() => {
    const idx = Array.from({ length: pts.length }, (_, i) => i);
    return highlight ? idx.sort((a, b) => Number(highlight.has(a)) - Number(highlight.has(b))) : idx;
  }, [pts, highlight]);
  const r = radius(pts.length);
  return (
    <>
      {order.map((i) => {
        const on = highlight?.has(i) ?? false;
        return (
          <circle
            key={i} cx={X(pts[i][0])} cy={Y(pts[i][1])} r={on ? r + 0.6 : r}
            fill={fill(i)}
            stroke={on ? "var(--ink)" : "none"} strokeWidth={0.4} opacity={highlight && !on ? 0.15 : 0.9}
          />
        );
      })}
    </>
  );
});

/**
 * The dataset's 2D map of its observations, next to the UpSet: it shows where the selected column (or any
 * selection) lies. Points are coloured by their strongest set or by a category. Drag a rectangle to select the
 * points inside it (Shift adds); click a point to mark it in the UpSet.
 */
export default function MapView({
  highlight, picked, onPick, onBrush, onClear,
}: {
  /** Observations to highlight, or null when nothing is selected. */
  highlight: Set<number> | null;
  /** Observation picked by clicking a point (the UpSet marks its column), and the click handler. */
  picked: number | null;
  onPick: (i: number | null) => void;
  /** Points selected by dragging a rectangle (add = extend the current selection). */
  onBrush: (cells: number[], add: boolean) => void;
  /** Clears the selection; null when nothing is selected. */
  onClear: (() => void) | null;
}) {
  const ds = useDataset();
  const pts = ds.map.pts;
  /** "sets" or the key of a category. */
  const [colorBy, setColorBy] = useState("sets");
  const cat = ds.categories.find((c) => c.key === colorBy) ?? null;
  const names = cat ? cat.names : ds.sets.names;
  const colors = cat ? cat.colors : ds.sets.colors;
  const codes = cat ? cat.codes : ds.sets.top;
  const fill = useMemo(() => (i: number) => colors[codes[i]] ?? OTHER, [colors, codes]);
  const [hov, setHov] = useState<{ i: number; x: number; y: number } | null>(null);
  const r = radius(pts.length);

  // rectangle selection, in viewBox units; a press that hardly moves is a click (picks one point)
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number; moved: boolean; add: boolean } | null>(null);
  const toVb = (ev: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const k = W / rect.width;
    return [(ev.clientX - rect.left) * k, (ev.clientY - rect.top) * k] as const;
  };
  const unX = (vx: number) => (vx - PAD) / (W - 2 * PAD), unY = (vy: number) => (H - PAD - vy) / (H - 2 * PAD);
  const hovered = hov?.i ?? null;

  return (
    <div className="mv">
      <div className="mv-head">
        <div className="mv-head-row">
          <span className="legend-title" title={ds.map.description}>Map · {ds.map.name}</span>
          {onClear && (
            <button className="chip fu-clear" onClick={onClear} title="Clear the selection (Esc)">✕ Clear selection</button>
          )}
        </div>
        <div className="ctrl">
          <label>Colour by</label>
          <div className="seg" role="group" aria-label="Colour the points by">
            <button aria-pressed={!cat} onClick={() => setColorBy("sets")} title={`Each ${ds.obsWord.replace(/s$/, "")}'s strongest of the ${ds.sets.title}`}>
              strongest {ds.sets.title.replace(/s$/, "")}
            </button>
            {ds.categories.map((c) => (
              <button key={c.key} aria-pressed={colorBy === c.key} onClick={() => setColorBy(c.key)}>{c.title}</button>
            ))}
          </div>
        </div>
        <div className="legend mv-legend">
          {names.map((n, l) => (
            <span key={n}>
              <i style={{ background: colors[l] ?? OTHER }} />
              {n}
            </span>
          ))}
        </div>
      </div>
      <figure className="mv-panel">
        <figcaption>
          <span className="mv-count">{highlight ? `${highlight.size} of ${ds.N} ${ds.obsWord} selected` : `${ds.N} ${ds.obsWord}`}</span>
        </figcaption>
        <svg
          viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of the ${ds.obsWord}: ${ds.map.name}`}
          onPointerDown={(ev) => {
            if (ev.button !== 0) return;
            const [x, y] = toVb(ev);
            ev.currentTarget.setPointerCapture(ev.pointerId);
            setBrush({ x0: x, y0: y, x1: x, y1: y, moved: false, add: ev.shiftKey });
          }}
          onPointerMove={(ev) => {
            if (!brush) return;
            const [x, y] = toVb(ev);
            const moved = brush.moved || Math.hypot(x - brush.x0, y - brush.y0) > 4;
            setBrush({ ...brush, x1: x, y1: y, moved });
            if (moved) setHov(null);
          }}
          onPointerUp={() => {
            if (!brush) return;
            if (brush.moved) onBrush(pointsInRect(pts, unX(brush.x0), unY(brush.y0), unX(brush.x1), unY(brush.y1)), brush.add);
            else if (hovered != null) onPick(hovered === picked ? null : hovered);
            setBrush(null);
          }}
          onMouseMove={(ev) => {
            if (brush?.moved) return;
            const k = W / ev.currentTarget.getBoundingClientRect().width;
            const [mx, my] = toVb(ev);
            let best = -1, bd = (6 * k) ** 2;
            for (let i = 0; i < pts.length; i++) {
              const d = (X(pts[i][0]) - mx) ** 2 + (Y(pts[i][1]) - my) ** 2;
              if (d < bd) (bd = d), (best = i);
            }
            setHov(best < 0 ? null : { i: best, x: ev.clientX, y: ev.clientY });
          }}
          onMouseLeave={() => setHov(null)}
          style={{ cursor: hovered != null ? "pointer" : "crosshair", touchAction: "none" }}
        >
          <rect x={0} y={0} width={W} height={H} rx={3} fill="var(--panel)" />
          <Points pts={pts} fill={fill} highlight={highlight} />
          {picked != null && (
            <circle cx={X(pts[picked][0])} cy={Y(pts[picked][1])} r={r + 3.5} fill="none" stroke="var(--accent)" strokeWidth={1.6} pointerEvents="none" />
          )}
          {hovered != null && (
            <circle cx={X(pts[hovered][0])} cy={Y(pts[hovered][1])} r={r + 2.5} fill="none" stroke="var(--ink)" strokeWidth={1} pointerEvents="none" />
          )}
          {brush?.moved && (
            <rect
              x={Math.min(brush.x0, brush.x1)} y={Math.min(brush.y0, brush.y1)} width={Math.abs(brush.x1 - brush.x0)} height={Math.abs(brush.y1 - brush.y0)}
              fill="var(--select)" fillOpacity={0.08} stroke="var(--select)" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none"
            />
          )}
        </svg>
      </figure>
      <p className="panel-note mv-note">{ds.map.description} Drag to select (Shift adds); click a point to mark its column.</p>
      {hov && (
        <div className="dot-tip" style={{ left: hov.x + 12, top: hov.y + 12 }}>
          <div className="dot-tip-hd">{obsLabel(ds, hov.i)}</div>
          <div>{names[codes[hov.i]] ?? "—"}</div>
          <div className="dot-tip-hint">{hov.i === picked ? "click: unmark" : "click: show its column in the UpSet"}</div>
        </div>
      )}
    </div>
  );
}
