import { color } from "d3-color";

/** Text color for a label drawn on a filled background: whichever of ink / white contrasts more. */
export function inkOn(bg: string): string {
  const c = color(bg)?.rgb();
  if (!c) return "var(--ink)";
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const inkL = 0.0116; // #16191D
  return (1.05 / (L + 0.05)) > ((L + 0.05) / (inkL + 0.05)) ? "#fff" : "var(--ink)";
}
