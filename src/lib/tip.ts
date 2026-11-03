// Position of a floating tooltip next to the pointer; near the right edge of the window it opens to the left, so it
// stays readable in the right-hand column.
export function tipStyle(x: number, y: number): React.CSSProperties {
  const flip = typeof window !== "undefined" && x > window.innerWidth - 340;
  return flip ? { left: x - 12, top: y + 12, transform: "translateX(-100%)" } : { left: x + 12, top: y + 12 };
}
