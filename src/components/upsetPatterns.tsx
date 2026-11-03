// Fills for the UpSet's composition bars. Hue is reserved for the label being analysed (points, dot-matrix
// swatches), so the composition variables (sample, decade, ...) are drawn in tints of one colour family per row,
// each category with its own texture: categories stay distinguishable without colour (colour-vision deficiencies,
// print), and the rows are told apart by their family.

import { interpolateLab } from "d3-interpolate";
import { OTHER } from "../lib/palette";

const N_FILLS = 8;
/** One family per composition row, light → dark (brand navy, green, amber-brown, then slate grey). Each starts at a
 *  clearly coloured light tint (not near-white), so even the plain first fill reads as a colour. */
const FAMILIES: [string, string][] = [
  ["#A9B1DA", "#282C5F"],
  ["#A8CDBE", "#1F4A3A"],
  ["#E3C9A0", "#5C3A0C"],
  ["#C3C6CF", "#3A3D46"],
];
export const N_ROWS = FAMILIES.length;
const tint = (row: number, g: number) => interpolateLab(...FAMILIES[row % N_ROWS])(g / (N_FILLS - 1));
/** Texture strokes: the family's dark end on the lighter tints, white on the darker ones. */
const ink = (row: number, g: number) => (g < 3 ? FAMILIES[row % N_ROWS][1] : "#FFFFFF");
const SZ = 5;

function texture(row: number, g: number) {
  const c = ink(row, g), w = 0.9;
  switch (g) {
    case 1: return <path d={`M0,${SZ} L${SZ},0`} stroke={c} strokeWidth={w} />;
    case 2: return <path d={`M0,0 L${SZ},${SZ}`} stroke={c} strokeWidth={w} />;
    case 3: return <circle cx={SZ / 2} cy={SZ / 2} r={0.9} fill={c} />;
    case 4: return <path d={`M0,${SZ} L${SZ},0 M0,0 L${SZ},${SZ}`} stroke={c} strokeWidth={0.7} />;
    case 5: return <path d={`M0,${SZ / 2} H${SZ}`} stroke={c} strokeWidth={w} />;
    case 6: return <path d={`M${SZ / 2},0 V${SZ}`} stroke={c} strokeWidth={w} />;
    case 7: return <path d={`M0,${SZ / 2} H${SZ} M${SZ / 2},0 V${SZ}`} stroke={c} strokeWidth={0.7} />;
    default: return null; // 0: plain tint
  }
}

/** The pattern definitions; render once per page (patterns are referenced by id from any inline svg). */
export function CompositionDefs() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {FAMILIES.flatMap((_, row) =>
          Array.from({ length: N_FILLS }, (_, g) => (
            <pattern key={`${row}-${g}`} id={`comp-${row}-${g}`} width={SZ} height={SZ} patternUnits="userSpaceOnUse">
              <rect width={SZ} height={SZ} fill={tint(row, g)} />
              {texture(row, g)}
            </pattern>
          )),
        )}
      </defs>
    </svg>
  );
}

/** Fill of the g-th category of the composition variable in row `row`; past the 8th category, plain grey. */
export const compFill = (g: number, row = 0) => (g < N_FILLS ? `url(#comp-${row % N_ROWS}-${g})` : OTHER);
