import { useEffect, useRef, useState } from "react";
import type { Dataset } from "../lib/dataset";

export type DatasetOption = { key: string; label: string };

/** The dataset button's icon (public/dataset_icon.svg), under the site's base path. */
const ICON = `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}dataset_icon.svg`;

/**
 * Slim title bar: a slot for the logo, the dataset button (a popover to pick the dataset, with its source), and the
 * theme switch (dark theme not built yet, so it is disabled).
 */
export default function TitleBar({ datasets, which, onWhich, current }: {
  datasets: DatasetOption[];
  which: string;
  onWhich: (key: string) => void;
  /** The loaded dataset (its source is shown in the popover), or null while loading. */
  current: Dataset | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => (document.removeEventListener("keydown", onKey), document.removeEventListener("mousedown", onDown));
  }, [open]);
  const opt = datasets.find((d) => d.key === which);

  return (
    <header className="titlebar">
      <h1 className="sr-only">Fuzzy Sets Explorer</h1>
      <div id="logo-slot" className="logo-slot" aria-hidden="true" />
      <div className="ds" ref={ref}>
        <button className="ds-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
          {/* public/dataset_icon.svg, drawn as a mask so it takes the button's text colour */}
          <span className="ds-icon" aria-hidden="true" style={{ ["--icon" as string]: `url(${ICON})` }} />
          <span className="ds-name">{opt?.label ?? "Dataset"}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="ds-pop" role="dialog" aria-label="Choose a dataset">
            <p className="panel-title">Dataset</p>
            <div className="ds-list" role="radiogroup">
              {datasets.map((d) => (
                <label key={d.key} className="ds-opt">
                  <input type="radio" name="dataset" checked={d.key === which} onChange={() => (setOpen(false), onWhich(d.key))} />
                  {d.label}
                </label>
              ))}
            </div>
            {current && <p className="panel-note ds-desc">{current.source}</p>}
          </div>
        )}
      </div>
      <button className="theme-btn" disabled title="Dark theme coming soon" aria-label="Dark theme (coming soon)">
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor" />
        </svg>
      </button>
    </header>
  );
}
