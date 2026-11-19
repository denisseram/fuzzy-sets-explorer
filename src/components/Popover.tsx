import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A controls button that opens a popover (the dataset popover's style, .ds-pop); Escape or a click outside closes it.
 * side: opens to the right of the button with fixed positioning, so a scrolling side panel does not clip it.
 */
export default function Popover({ label, badge, title, children, wide = false, side = false }: {
  label: string;
  /** Shown after the label when something is active (e.g. "3"). */
  badge?: string | null;
  title?: string;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => (document.removeEventListener("keydown", onKey), document.removeEventListener("mousedown", onDown));
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !side) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const w = Math.min(wide ? 460 : 300, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.right + 8, window.innerWidth - w - 16));
      const top = Math.max(8, Math.min(r.top, window.innerHeight - 160));
      setPos({ position: "fixed", left, top, maxHeight: window.innerHeight - top - 8, overflowY: "auto" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => (window.removeEventListener("resize", place), window.removeEventListener("scroll", place, true));
  }, [open, side, wide]);
  return (
    <div className="pop" ref={ref}>
      <button ref={btn} className="fc-btn" aria-haspopup="dialog" aria-expanded={open} aria-pressed={!!badge} title={title} onClick={() => setOpen(!open)}>
        {label}{badge ? <span className="fc-badge">{badge}</span> : null} <span aria-hidden="true">{side ? "▸" : "▾"}</span>
      </button>
      {open && (!side || pos) && (
        <div className={`ds-pop fu-pop${wide ? " fu-pop-wide" : ""}`} role="dialog" aria-label={label} style={side ? pos! : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
