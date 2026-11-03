import { useEffect, useRef, useState } from "react";
import type { SortKey } from "../lib/upsetModel";
import type { AttrStat } from "./attrHeatmap";

export type BelowMode = "rings" | "none";

export type Display = {
  sortKey: SortKey;
  minSize: number;
  stat: AttrStat;
  belowMode: BelowMode;
  showSingle: boolean;
  /** "Near" a set from nearFrac × τ up to τ. */
  nearFrac: number;
  /** A near set is marked when at least this share of a column's observations are near the set. */
  minShare: number;
  /** One row per combination (sets across the top) instead of one column per combination. */
  flip: boolean;
};

export const DEFAULT_DISPLAY: Display = {
  sortKey: "fuzzy", minSize: 2, stat: "median", belowMode: "rings", showSingle: true, nearFrac: 0.5, minShare: 0.2, flip: false,
};

/** τ range of the slider (and the barcode). */
export const TAU_MIN = 0.05, TAU_MAX = 0.95, TAU_STEP = 0.05;

/**
 * The UpSet's controls: the threshold τ, and the less-used settings behind "Display options". For crisp sets
 * (memberships 0 or 1) τ changes nothing, so its slider is disabled.
 */
export default function UpsetControls({
  setsTitle, nSets, crisp, tau, onTau, display, onDisplay, obsWord, hasAttrs,
}: {
  setsTitle: string;
  nSets: number;
  crisp: boolean;
  tau: number;
  onTau: (t: number) => void;
  display: Display;
  onDisplay: (d: Display) => void;
  obsWord: string;
  hasAttrs: boolean;
}) {
  const [popOpen, setPopOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopImmediatePropagation(), setPopOpen(false));
    const onDown = (e: MouseEvent) => popRef.current && !popRef.current.contains(e.target as Node) && setPopOpen(false);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => (document.removeEventListener("keydown", onKey, true), document.removeEventListener("mousedown", onDown));
  }, [popOpen]);
  const set = (patch: Partial<Display>) => onDisplay({ ...display, ...patch });
  // the Flip button lives outside the popover, so it is not a changed display option
  const changed = (Object.keys(DEFAULT_DISPLAY) as (keyof Display)[]).some((k) => k !== "flip" && display[k] !== DEFAULT_DISPLAY[k]);

  return (
    <div className="fc">
      <div className="fc-row">
        <div className="fc-item">
          <span className="fc-lbl">Sets</span>
          <span className="fc-sets">{setsTitle} ({nSets}){crisp ? " · crisp" : " · graded"}</span>
        </div>
        <div className="fc-item">
          <label className="fc-lbl" htmlFor="fu-tau">Threshold <span className="keep-case">τ</span></label>
          <input
            type="range" id="fu-tau" min={TAU_MIN} max={TAU_MAX} step={TAU_STEP} value={tau} disabled={crisp}
            title={crisp ? "Crisp sets (membership 0 or 1): τ has no effect" : "An observation belongs to every set whose membership reaches τ"}
            onChange={(e) => onTau(parseFloat(e.target.value))}
          />
          <span className="val">{crisp ? "—" : tau.toFixed(2)}</span>
          {crisp && <span className="fc-hint">crisp sets: τ has no effect</span>}
        </div>
        <button
          className="fc-btn" aria-pressed={display.flip} onClick={() => set({ flip: !display.flip })}
          title={display.flip ? "Flip the chart: one column per combination" : "Flip the chart: one row per combination"}
        >
          <span aria-hidden="true">⇄</span> Flip
        </button>
        <div className="fc-pop-wrap" ref={popRef}>
          <button className="fc-btn" aria-haspopup="dialog" aria-expanded={popOpen} onClick={() => setPopOpen(!popOpen)}>
            Display options{changed && <span className="fc-dot" title="Some settings differ from the defaults" />} <span aria-hidden="true">▾</span>
          </button>
          {popOpen && (
            <div className="fc-pop" role="dialog" aria-label="Display options">
              <div className="fc-grid">
                <div className="ctrl">
                  <label htmlFor="fu-sort">Sort by</label>
                  <select id="fu-sort" value={display.sortKey} onChange={(e) => set({ sortKey: e.target.value as SortKey })}>
                    <option value="fuzzy">fuzzy size</option>
                    <option value="n">number of {obsWord}</option>
                  </select>
                </div>
                <div className="ctrl">
                  <label htmlFor="fu-min">Min {obsWord} per column</label>
                  <input id="fu-min" type="number" min={0} step={1} value={display.minSize} onChange={(e) => set({ minSize: Math.max(0, +e.target.value) })} />
                </div>
                <div className="ctrl">
                  <label>Attributes</label>
                  <div className="seg" role="group" aria-label="Summarise the attributes by" title={hasAttrs ? undefined : "This dataset has no numerical attributes"}>
                    {(["median", "mean"] as const).map((v) => (
                      <button key={v} aria-pressed={display.stat === v} disabled={!hasAttrs} onClick={() => set({ stat: v })}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="ctrl">
                  <label>Near a set from</label>
                  <div className="seg" role="group" aria-label="Near a set from" title={crisp ? "Crisp sets: nothing is near a set" : "A membership from this level up to τ counts as near (almost belongs)"}>
                    {([[0.33, "⅓"], [0.5, "½"], [0.75, "¾"]] as const).map(([v, t]) => (
                      <button key={v} aria-pressed={display.nearFrac === v} disabled={crisp} onClick={() => set({ nearFrac: v })}>
                        {t} τ{crisp ? "" : ` (${(v * tau).toFixed(2)})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ctrl">
                  <label>Mark near sets from</label>
                  <div className="seg" role="group" aria-label="Mark a near set when this share of a column is near a set">
                    {([0.1, 0.2, 0.33] as const).map((v) => (
                      <button key={v} aria-pressed={display.belowMode === "rings" && display.minShare === v} onClick={() => set({ belowMode: "rings", minShare: v })}>
                        ≥ {Math.round(v * 100)}%
                      </button>
                    ))}
                    <button aria-pressed={display.belowMode === "none"} onClick={() => set({ belowMode: "none" })}>none</button>
                  </div>
                </div>
                <label className="fu-check">
                  <input type="checkbox" checked={display.showSingle} onChange={(e) => set({ showSingle: e.target.checked })} /> single-set columns
                </label>
              </div>
              {changed && (
                <button className="fu-link fc-reset" onClick={() => onDisplay({ ...DEFAULT_DISPLAY, flip: display.flip })}>Back to the defaults</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
