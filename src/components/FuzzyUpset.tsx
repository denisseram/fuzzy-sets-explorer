import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { obsLabel, type Dataset } from "../lib/dataset";
import {
  defaultSets, isCrisp, issueSummary, MAX_SETS, maxBinCount, reference, upsetRows, type Issue, type Memberships, type Mode, type Threshold,
} from "../lib/fuzzyDecomposition";
import { tipStyle } from "../lib/tip";
import UpsetMatrix, { type RefMark } from "./UpsetMatrix";
import "../styles/fuzzy-upset.css";

/** τ slider range and step. */
export const TAU_MIN = 0.05, TAU_MAX = 0.95, TAU_STEP = 0.05;
const BETAS = [[1 / 3, "⅓"], [0.5, "½"], [0.75, "¾"]] as const;
const SHARES = [[0.1, "10 %"], [0.2, "20 %"], [0.33, "33 %"]] as const;

type Hover = { x: number; y: number; title: string; rows: string[] };

const short = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Metadata of one observation (categories and numerical attributes), for tooltips. */
function metaLine(ds: Dataset, i: number): string[] {
  const parts = [
    ...ds.categories.map((c) => (c.codes[i] >= 0 ? `${c.title} ${c.names[c.codes[i]]}` : "")),
    ...ds.numeric.map((a) => (Number.isFinite(a.values[i]) ? `${a.title} ${(+a.values[i]).toFixed(a.digits)}${a.unit ? " " + a.unit : ""}` : "")),
  ].filter(Boolean);
  return parts.length ? [parts.slice(0, 4).join(" · ")] : [];
}

/**
 * One fuzzy UpSet plot with its controls (mode, sets, reference element, Threshold) and, while threshold mode is on,
 * the threshold sidebar. All numbers come from lib/fuzzyDecomposition.ts.
 */
export default function FuzzyUpset({ ds, data, issues }: { ds: Dataset; data: Memberships; issues: Issue[] }) {
  const names = ds.sets.names;
  const crisp = useMemo(() => isCrisp(data), [data]);
  const [K, setK] = useState<number[]>(() => defaultSets(data));
  const [mode, setMode] = useState<Mode>("inclusive");
  const [thOn, setThOn] = useState(false);
  const [tauLive, setTauLive] = useState(0.5);
  const tau = useDeferredValue(tauLive);
  const [beta, setBeta] = useState(0.5);
  const [share, setShare] = useState(0.2);
  const [selected, setSelected] = useState<string | null>(null);
  const [refX, setRefX] = useState<number | null>(null);
  const [refText, setRefText] = useState("");
  const [hover, setHover] = useState<Hover | null>(null);

  const threshold: Threshold | null = thOn && !crisp ? { tau, beta, share } : null;
  const rows = useMemo(() => upsetRows(data, K, threshold), [data, K, threshold?.tau, threshold?.beta, threshold?.share]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxBin = useMemo(() => Math.max(1, maxBinCount(rows, mode)), [rows, mode]);
  // the bar axis is fixed across modes: a row's additive contributors are a subset of its inclusive ones
  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.inclusive.contributors.length)), [rows]);
  const selRow = rows.find((r) => r.key === selected) ?? null;
  const contributors = selRow ? selRow[mode].contributors : [];
  const contribSet = useMemo(() => new Set(contributors), [contributors]);

  // the selected row disappears when one of its sets is deselected; the reference element when it stops contributing
  useEffect(() => { if (selected && !selRow) setSelected(null); }, [selected, selRow]);
  useEffect(() => { if (refX !== null && !contribSet.has(refX)) (setRefX(null), setRefText("")); }, [refX, contribSet]);

  const optLabel = (x: number) => {
    const nm = obsLabel(ds, data.src[x]);
    return nm === data.ids[x] ? nm : `${nm} — ${data.ids[x]}`;
  };
  const byLabel = useMemo(() => new Map(contributors.map((x) => [optLabel(x), x])), [contributors]); // eslint-disable-line react-hooks/exhaustive-deps

  let refMark: RefMark | null = null;
  if (selRow && refX !== null && contribSet.has(refX)) {
    const T = selRow.sets;
    const r = reference(data, refX, T, K, threshold ? threshold.tau : null);
    const who = short(obsLabel(ds, data.src[refX]), 24);
    refMark = {
      who,
      label: `${who}: min(${T.map((i) => names[i]).join(", ")}) = ${r.value.toFixed(2)}`,
      value: r.value,
      band: mode === "additive" ? { from: r.outside, to: r.inside, component: r.component } : null,
      membership: (i) => data.P[refX * data.L + i],
    };
  }

  const toggleSet = (i: number) =>
    setK((k) => (k.includes(i) ? (k.length > 1 ? k.filter((j) => j !== i) : k) : k.length < MAX_SETS ? [...k, i].sort((a, b) => a - b) : k));
  const tip = (ev: React.MouseEvent, title: string, lines: string[]) => setHover({ x: ev.clientX, y: ev.clientY, title, rows: lines });
  const note = issues.length ? issuesNote(issues, ds.obsWord) : null;

  return (
    <div className="fu">
      <div className="fc">
        <div className="fc-row">
          <div className="fc-item">
            <span className="fc-lbl">Mode</span>
            <div className="seg" role="group" aria-label="Mode">
              <button aria-pressed={mode === "inclusive"} onClick={() => setMode("inclusive")} title="Membership in every set of the row (min); other sets unrestricted">
                Inclusive intersections
              </button>
              <button aria-pressed={mode === "additive"} onClick={() => setMode("additive")} title="Membership above the element's memberships in the other selected sets; the masses add up">
                Additive contributions
              </button>
            </div>
          </div>
          <div className="fc-item">
            <label className="fc-lbl" htmlFor="fu-ref">Reference element</label>
            <input
              id="fu-ref" className="fu-ref" list="fu-ref-list" value={refText} disabled={!selRow || !contributors.length}
              placeholder={!selRow ? "select a row first" : contributors.length ? `search ${contributors.length} contributors` : "no contributors"}
              onChange={(e) => {
                setRefText(e.target.value);
                const x = byLabel.get(e.target.value);
                setRefX(x ?? null);
              }}
            />
            <datalist id="fu-ref-list">
              {contributors.map((x) => <option key={x} value={optLabel(x)} />)}
            </datalist>
            {refText && <button className="fu-link" aria-label="Clear the reference element" onClick={() => (setRefX(null), setRefText(""))}>✕</button>}
          </div>
          <button
            className="fc-btn" aria-pressed={thOn && !crisp} disabled={crisp} onClick={() => setThOn(!thOn)}
            title={crisp ? "Crisp memberships (0 or 1): τ has no effect" : thOn ? "Turn threshold mode off" : "Count only memberships that reach τ"}
          >
            Threshold{thOn && !crisp ? ` τ = ${tauLive.toFixed(2)}` : ""}
          </button>
        </div>
        <div className="fc-row">
          <div className="fc-item fc-sets">
            <span className="fc-lbl">Sets ({K.length} of max {MAX_SETS})</span>
            <div className="fu-chips" role="group" aria-label={`Selected ${ds.sets.title}`}>
              {names.map((n, i) => {
                const on = K.includes(i);
                const full = !on && K.length >= MAX_SETS;
                return (
                  <button
                    key={n} className="chip" aria-pressed={on} disabled={full || (on && K.length === 1)} onClick={() => toggleSet(i)}
                    title={full ? `At most ${MAX_SETS} sets` : on && K.length === 1 ? "At least one set" : undefined}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {note && <p className="fu-excl" title={note.detail}>⚠ {note.text}</p>}
      <div className="fu-body">
        <div className="fu-scroll">
          <UpsetMatrix
            names={names} K={K} rows={rows} mode={mode} maxCount={maxCount} maxBin={maxBin} threshold={threshold}
            selected={selected} reference={refMark} tip={tip} onLeave={() => setHover(null)}
            onSelect={(key) => setSelected((s) => (s === key ? null : key))}
          />
        </div>
        {thOn && !crisp && (
          <aside className="th-side" aria-label="Threshold">
            <p className="panel-title">Threshold</p>
            <div className="ctrl">
              <label htmlFor="fu-tau">Threshold <span className="keep-case">τ</span></label>
              <div className="ctrl-row">
                <input type="range" id="fu-tau" min={TAU_MIN} max={TAU_MAX} step={TAU_STEP} value={tauLive} onChange={(e) => setTauLive(parseFloat(e.target.value))} />
                <span className="val">{tauLive.toFixed(2)}</span>
              </div>
            </div>
            <div className="ctrl">
              <label>Ring level <span className="keep-case">β</span></label>
              <div className="seg" role="group" aria-label="Ring level β">
                {BETAS.map(([v, t]) => (
                  <button key={t} aria-pressed={beta === v} onClick={() => setBeta(v)} title={`β·τ = ${(v * tauLive).toFixed(2)}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="ctrl">
              <label>Ring share</label>
              <div className="seg" role="group" aria-label="Ring share">
                {SHARES.map(([v, t]) => <button key={t} aria-pressed={share === v} onClick={() => setShare(v)}>{t}</button>)}
              </div>
            </div>
            <p className="panel-note th-note">
              Memberships below τ are not counted (they become 0). A ring marks a set outside the row where at least {Math.round(share * 100)} % of
              the contributors have {(beta * tauLive).toFixed(2)} ≤ membership &lt; {tauLive.toFixed(2)}.
            </p>
          </aside>
        )}
      </div>
      {hover && (
        <div className="dot-tip" style={tipStyle(hover.x, hover.y)}>
          <div className="dot-tip-hd">{hover.title}</div>
          {hover.rows.map((r, k) => <div key={k}>{r}</div>)}
          {hover.title === refMark?.label && refX !== null && metaLine(ds, data.src[refX]).map((r, k) => <div key={`m${k}`} className="dot-tip-hint">{r}</div>)}
        </div>
      )}
    </div>
  );
}

function issuesNote(issues: Issue[], word: string) {
  const detail = issues.slice(0, 20).map((s) => `${s.id}: ${s.detail}`).join("\n") + (issues.length > 20 ? `\n… and ${issues.length - 20} more` : "");
  return { text: issueSummary(issues, word)!, detail };
}
