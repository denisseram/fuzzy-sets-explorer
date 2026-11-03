import { useEffect, useMemo, useRef, useState } from "react";
import { tipStyle } from "../lib/tip";

/** A row of the view: a set (its labels), or a pooled row of several sets (labels null). */
export type StripGroup = { key: string; name: string; labels: number[] | null; idx: number[] };

/** Height of one observation's bar when a set is expanded. */
const ROW = 3;
/** Datasets this small start with every set expanded. */
const EXPAND_ALL_UP_TO = 200;

/**
 * Membership view (admixture-style), scaled by summarising: one row per set (in the UpSet's column order) with
 * the mean memberships of its observations (normalised to sum 1) and how much of that lies
 * outside the set ("below τ"). Clicking a set expands it into one thin bar per observation; the part of an
 * observation outside its set shows as a sliver at the end of its bar.
 */
export default function MembershipStrip({
  P, L, names, colors, groups, tau, title, note, active, picked, onPick, onSelectGroup, obsName,
}: {
  /** Flat [N * L] memberships (not necessarily summing to 1). */
  P: Float32Array;
  L: number;
  names: string[];
  colors: string[];
  groups: StripGroup[];
  /** Where τ falls on the bar, or null (the bars are normalised, so only for memberships that sum to 1). */
  tau: number | null;
  title: string;
  note: string;
  /** Observations of the current selection (the others are dimmed), or null. */
  active: Set<number> | null;
  picked: number | null;
  onPick: (i: number | null) => void;
  onSelectGroup: (key: string) => void;
  obsName: (i: number) => string;
}) {
  const N = groups.reduce((n, g) => n + g.idx.length, 0);
  const [open, setOpen] = useState<Set<string>>(() => (N <= EXPAND_ALL_UP_TO ? new Set(groups.map((g) => g.key)) : new Set()));
  const [hover, setHover] = useState<{ x: number; y: number; title: string; rows: string[] } | null>(null);
  const toggle = (key: string) => setOpen((o) => {
    const n = new Set(o);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  // CSS variables resolved for the canvases
  const resolved = useMemo(() => {
    const cs = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
    return colors.map((c) => (c.startsWith("var(") && cs ? cs.getPropertyValue(c.slice(4, -1)).trim() || "#9A9A9A" : c));
  }, [colors]);

  /** An observation's memberships normalised to sum 1 (zeros when it has none). */
  const norm = (i: number) => {
    let s = 0;
    for (let l = 0; l < L; l++) s += P[i * L + l];
    return Array.from({ length: L }, (_, l) => (s > 0 ? P[i * L + l] / s : 0));
  };
  // per set: mean normalised memberships, and the share of membership outside the set (the fuzzy remainder)
  const summary = useMemo(() => {
    const m = new Map<string, { mean: number[]; outside: number | null }>();
    for (const g of groups) {
      const mean = new Array(L).fill(0);
      for (const i of g.idx) norm(i).forEach((v, l) => (mean[l] += v));
      const n = Math.max(g.idx.length, 1);
      const mm = mean.map((v) => v / n);
      const inside = g.labels ? g.labels.reduce((a, l) => a + mm[l], 0) : 0;
      m.set(g.key, { mean: mm, outside: g.labels === null ? null : g.labels.length ? Math.max(0, 1 - inside) : 1 });
    }
    return m;
  }, [groups, P, L]);

  // small datasets: every set stays expanded when the sets change (τ)
  const groupSig = groups.map((g) => g.key).join("|");
  useEffect(() => {
    if (N <= EXPAND_ALL_UP_TO) setOpen(new Set(groups.map((g) => g.key)));
  }, [groupSig]);
  // the picked observation's set opens by itself
  useEffect(() => {
    if (picked == null) return;
    const g = groups.find((x) => x.idx.includes(picked));
    if (g && !open.has(g.key)) setOpen((o) => new Set(o).add(g.key));
  }, [picked, groups]);

  const pct = (v: number) => (v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);
  const top = (v: number[]) =>
    v.map((x, l) => [x, l] as const).filter(([x]) => x > 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([x, l]) => `${names[l]} ${pct(x)}`).join(" · ");

  return (
    <div className="ms">
      <div className="ms-head">
        <p className="panel-title">Membership · {title}</p>
        <p className="sk-note">{note}</p>
        <div className="ms-tools">
          <button className="fu-link" onClick={() => setOpen(new Set(groups.map((g) => g.key)))}>expand all</button>
          <button className="fu-link" onClick={() => setOpen(new Set())}>collapse all</button>
        </div>
      </div>
      <div className="ms-list" onMouseLeave={() => setHover(null)}>
        {groups.map((g) => {
          const sm = summary.get(g.key)!;
          const isOpen = open.has(g.key);
          const dim = active ? !g.idx.some((i) => active.has(i)) : false;
          return (
            <div key={g.key} className={`ms-group-row${dim ? " ms-dim" : ""}`}>
              <div className="ms-sum">
                <button className="ms-name" aria-expanded={isOpen} onClick={() => toggle(g.key)} title={`${g.name} · ${g.idx.length} — ${isOpen ? "collapse" : "show its observations"}`}>
                  <span className="ms-chev" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                  {g.name} <span className="ms-n">· {g.idx.length}</span>
                </button>
                <div
                  className="ms-bar" role="button" tabIndex={0}
                  onClick={() => onSelectGroup(g.key)}
                  onKeyDown={(e) => e.key === "Enter" && onSelectGroup(g.key)}
                  onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, title: `${g.name} · ${g.idx.length}`, rows: [
                    `mean memberships: ${top(sm.mean)}`,
                    ...(sm.outside != null ? [`outside the set: ${pct(sm.outside)}`, "click: select the set"] : ["several sets pooled"]),
                  ] })}
                >
                  {/* most common label first, as in the expanded bars */}
                  {sm.mean.map((v, l) => [v, l] as const).sort((x, y) => y[0] - x[0]).map(([v, l]) =>
                    v > 0 ? <span key={l} style={{ width: `${v * 100}%`, background: colors[l] }} /> : null)}
                  {tau != null && tau > 0 && tau < 1 && <i className="ms-tau" style={{ left: `${tau * 100}%` }} />}
                </div>
                <span className="ms-out" title="Share of the set's membership that lies outside its labels (below τ)">
                  {sm.outside != null && <span style={{ width: `${Math.min(1, sm.outside) * 100}%` }} />}
                </span>
              </div>
              {isOpen && (
                <ObsBars
                  g={g} norm={norm} L={L} mean={sm.mean} colors={resolved} tau={tau} active={active} picked={picked}
                  onHover={(i, ev) => setHover(i == null || !ev ? null : { x: ev.clientX, y: ev.clientY, title: obsName(i), rows: [
                    top(norm(i)), i === picked ? "click: unmark" : "click: mark it everywhere",
                  ] })}
                  onPick={(i) => onPick(i === picked ? null : i)}
                />
              )}
            </div>
          );
        })}
      </div>
      {hover && (
        <div className="dot-tip" style={tipStyle(hover.x, hover.y)}>
          <div className="dot-tip-hd">{hover.title}</div>
          {hover.rows.map((r) => <div key={r}>{r}</div>)}
        </div>
      )}
    </div>
  );
}

/** One expanded set: a canvas with one ROW-px bar per observation (strongest members first). */
function ObsBars({
  g, norm, L, mean, colors, tau, active, picked, onHover, onPick,
}: {
  g: StripGroup;
  /** The set's mean memberships: its most common label orders the rows and comes first in every bar. */
  mean: number[];
  norm: (i: number) => number[];
  L: number;
  colors: string[];
  tau: number | null;
  active: Set<number> | null;
  picked: number | null;
  onHover: (i: number | null, ev?: React.MouseEvent) => void;
  onPick: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(240);
  const H = g.idx.length * ROW;
  // labels from the set's most common to its least common: drawn in that order in every bar
  const labelOrder = useMemo(() => Array.from({ length: L }, (_, l) => l).sort((a, b) => mean[b] - mean[a]), [mean, L]);
  // rows from least to most of the most common label (the most mixed first, the purest last); ties by the second
  const rows = useMemo(() => {
    const [d0, d1] = labelOrder;
    const v = new Map(g.idx.map((i) => [i, norm(i)] as const));
    return [...g.idx].sort((a, b) => v.get(a)![d0] - v.get(b)![d0] || (d1 !== undefined ? v.get(b)![d1] - v.get(a)![d1] : 0));
  }, [g, labelOrder]);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    rows.forEach((i, r) => {
      const v = norm(i);
      ctx.globalAlpha = active && !active.has(i) ? 0.2 : 1;
      let x = 0;
      for (const l of labelOrder) {
        if (v[l] <= 0) continue;
        ctx.fillStyle = colors[l] ?? "#9A9A9A";
        ctx.fillRect(x, r * ROW, v[l] * w + 0.4, ROW - 0.5);
        x += v[l] * w;
      }
    });
    ctx.globalAlpha = 1;
    if (tau != null && tau > 0 && tau < 1) {
      ctx.strokeStyle = "rgba(22, 25, 29, .55)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tau * w + 0.5, 0);
      ctx.lineTo(tau * w + 0.5, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const r = picked != null ? rows.indexOf(picked) : -1;
    if (r >= 0) {
      ctx.strokeStyle = "#282C5F";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0.75, r * ROW - 1, w - 1.5, ROW + 1.5);
    }
  }, [rows, labelOrder, w, H, L, colors, tau, active, picked]);
  const at = (ev: React.MouseEvent) => {
    const r = Math.floor((ev.clientY - ev.currentTarget.getBoundingClientRect().top) / ROW);
    return rows[r] ?? null;
  };
  return (
    <div className="ms-obs">
      <canvas
        ref={ref} style={{ width: w, height: H, display: "block", cursor: "pointer" }}
        role="img" aria-label={`${g.idx.length} observations of ${g.name}`}
        onMouseMove={(ev) => onHover(at(ev), ev)}
        onMouseLeave={() => onHover(null)}
        onClick={(ev) => {
          const i = at(ev);
          if (i != null) onPick(i);
        }}
      />
    </div>
  );
}
