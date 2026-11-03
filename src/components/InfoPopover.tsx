import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A small "i" button that opens a popover with longer help text; Escape or a click outside closes it. */
export default function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => (document.removeEventListener("keydown", onKey), document.removeEventListener("mousedown", onDown));
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button className="info-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx={8} cy={8} r={7} fill="none" stroke="currentColor" strokeWidth={1.4} />
          <circle cx={8} cy={4.8} r={1} fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="info-pop panel-note" id={id} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  );
}
