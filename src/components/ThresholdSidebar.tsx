import { TauSlider } from "./MiniHist";

/** τ slider range and step. */
export const TAU_MIN = 0.05, TAU_MAX = 0.95, TAU_STEP = 0.05;
const BETAS = [[1 / 3, "⅓"], [0.5, "½"], [0.75, "¾"]] as const;
const SHARES = [[0.1, "10 %"], [0.2, "20 %"], [0.33, "33 %"]] as const;

/**
 * The threshold sidebar: τ over the histogram of every membership > 0 in the selected sets, or (per-set thresholds)
 * one τ_i per selected set over that set's histogram; the ring level β and the ring share.
 */
export default function ThresholdSidebar({
  names, cols, tau, onTau, perSet, onPerSet, taus, onSetTau, beta, onBeta, share, onShare, hist, setHists, histMax,
}: {
  names: string[];
  cols: number[];
  tau: number;
  onTau: (v: number) => void;
  perSet: boolean;
  onPerSet: (on: boolean) => void;
  /** τ_i per dataset set. */
  taus: readonly number[];
  onSetTau: (set: number, v: number) => void;
  beta: number;
  onBeta: (v: number) => void;
  share: number;
  onShare: (v: number) => void;
  /** Histogram of every membership > 0 in the selected sets, and per column of each set. */
  hist: number[];
  setHists: number[][];
  histMax: number;
}) {
  return (
    <aside className="th-side" aria-label="Threshold">
      <p className="panel-title">Threshold</p>
      <label className="th-check" title="One threshold τ_i per selected set; each truncates its own set and sets its own ring range">
        <input type="checkbox" checked={perSet} onChange={(e) => onPerSet(e.target.checked)} /> Per-set thresholds
      </label>
      {!perSet ? (
        <div className="ctrl">
          <label htmlFor="fu-tau">Threshold <span className="keep-case">τ</span> <span className="val">{tau.toFixed(2)}</span></label>
          <TauSlider
            id="fu-tau" value={tau} min={TAU_MIN} max={TAU_MAX} step={TAU_STEP} onChange={onTau} counts={hist} countMax={Math.max(1, ...hist)}
            label="Threshold τ"
          />
          <span className="th-hint">behind: all memberships &gt; 0 in the selected sets</span>
        </div>
      ) : (
        <div className="th-sets">
          {cols.map((i, c) => (
            <div className="ctrl" key={i}>
              <label title={names[i]}>
                <span className="th-set">{names[i]}</span> <span className="keep-case">τ</span><sub>i</sub> <span className="val">{taus[i].toFixed(2)}</span>
              </label>
              <TauSlider
                value={taus[i]} min={TAU_MIN} max={TAU_MAX} step={TAU_STEP} onChange={(v) => onSetTau(i, v)} counts={setHists[c]} countMax={histMax}
                label={`Threshold of ${names[i]}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="ctrl">
        <label>Ring level <span className="keep-case">β</span></label>
        <div className="seg" role="group" aria-label="Ring level β">
          {BETAS.map(([v, t]) => (
            <button key={t} aria-pressed={beta === v} onClick={() => onBeta(v)} title={perSet ? `β·τ_i` : `β·τ = ${(v * tau).toFixed(2)}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="ctrl">
        <label>Ring share</label>
        <div className="seg" role="group" aria-label="Ring share">
          {SHARES.map(([v, t]) => <button key={t} aria-pressed={share === v} onClick={() => onShare(v)}>{t}</button>)}
        </div>
      </div>
      <p className="panel-note th-note">
        Memberships below {perSet ? "their set's τ_i" : "τ"} are not counted (they become 0). A ring marks a set outside the row where at least{" "}
        {Math.round(share * 100)} % of the contributors have {perSet ? "β·τ_i" : (beta * tau).toFixed(2)} ≤ membership &lt; {perSet ? "τ_i" : tau.toFixed(2)}.
      </p>
    </aside>
  );
}
