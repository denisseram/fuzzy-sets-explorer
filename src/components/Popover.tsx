import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A controls-bar button that opens a popover (the dataset popover's style, .ds-pop); Escape or a click outside closes
 * it.
 */
export default function Popover({ label, badge, title, children, wide = false }: {
  label: string;
  /** Shown after the label when something is active (e.g. "3"). */
  badge?: string | null;
  title?: string;
  children: ReactNode;
  wide?: boolean;
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
  return (
    <div className="pop" ref={ref}>
      <button className="fc-btn" aria-haspopup="dialog" aria-expanded={open} aria-pressed={!!badge} title={title} onClick={() => setOpen(!open)}>
        {label}{badge ? <span className="fc-badge">{badge}</span> : null} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`ds-pop fu-pop${wide ? " fu-pop-wide" : ""}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
