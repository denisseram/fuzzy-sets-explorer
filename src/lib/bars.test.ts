import { describe, expect, it } from "vitest";
import { validateMemberships } from "./fuzzyDecomposition";
import { renderMatrix } from "./testPlot";

const FIXTURE = [["E1", 0.8, 0.7, 0.5], ["E2", 0.2, 0.9, 0.4], ["E3", 0.0, 0.0, 0.0], ["E4", 0.6, 0.6, 0.0]] as const;
const fx = validateMemberships(FIXTURE.map((r) => r[0]), FIXTURE.flatMap((r) => r.slice(1) as number[]), 3).data;
/** The markup of one row (from its group to the next row). */
const rowOf = (svg: string, label: string) => {
  const at = svg.indexOf(`aria-label="${label}"`);
  const end = svg.slice(at + 10).search(/class="fu-row( fu-row-pat)?"/);
  return end < 0 ? svg.slice(at) : svg.slice(at, at + 10 + end);
};

describe("horizon wraps as texture", () => {
  it("each wrap is a hatched layer in the measure's colour (45°, then 135°); no darker colours", () => {
    // range 1: row A has 3 contributors (2 wraps) and mass 1.6 (1 wrap)
    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", null, null, false, new Set(), 1);
    const a = rowOf(svg, "A");
    expect(a.match(/fill="url\(#fu-hatch-dark-a\)"/g)).toHaveLength(1);
    expect(a.match(/fill="url\(#fu-hatch-dark-b\)"/g)).toHaveLength(1);
    expect(a.match(/fill="url\(#fu-hatch-light-a\)"/g)).toHaveLength(1);
    expect(a).not.toMatch(/fu-hatch-light-b|fu-hatch-[a-z]+-x/);
    expect(svg).not.toMatch(/color-mix\([^)]*black/);
    // the wrap layers of the light bar have no fill of their own (stacked tints would darken them)
    expect(a.match(/class="fu-bar fu-bar-out" style="fill-opacity:0"/g)).toHaveLength(2);
    // the patterns are defined once, and the legend explains them
    for (const id of ["dark-a", "dark-b", "dark-x", "light-a", "light-b", "light-x"]) expect(svg.match(new RegExp(`id="fu-hatch-${id}"`, "g"))).toHaveLength(1);
    expect(svg).toContain(">wrap</text>");
  });
  it("beyond 3 wraps: the cross-hatch layer and the break slashes", () => {
    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", null, null, false, new Set(), 0.5);
    const a = rowOf(svg, "A"); // 3 contributors = 6 ranges of 0.5: broken
    expect(a).toContain("url(#fu-hatch-dark-x)");
    expect(a).toContain('class="fu-break"');
  });
  it("no wrap at the default range: no hatch and no legend swatch", () => {
    const svg = renderMatrix(fx, ["A", "B", "C"], "inclusive", null, null);
    expect(svg).not.toMatch(/fill="url\(#fu-hatch/);
    expect(svg).not.toContain(">wrap</text>");
  });
});
