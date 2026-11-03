// The app's data colours, built on the brand palette: navy #282C5F, green #2E6550, amber #EAAA40.
// Interface colours (page, panels, ink, accents) are CSS tokens in styles/theme.css.

import { interpolateViridis } from "d3-scale-chromatic";

/**
 * Categories, in fixed order: brightened brand hues first (indigo, amber, green), then companions. Checked with the
 * dataviz validator on the page colour #F7F7F8, every pair (scatters show all categories at once): lightness,
 * chroma and normal-vision separation pass; terracotta vs green is a CVD warning (ΔE 7.4, protan), so categories
 * always come with a legend and hover names. Past the 8th, categories are grey.
 */
export const PALETTE = ["#4A57B0", "#E0A030", "#2F8A68", "#C0603A", "#7FB0F0", "#E08DAE", "#823953", "#A264B0"];
export const OTHER = "#9A9A9A";

/** Attribute heatmap, low (0, light) → high (1, dark): viridis, reversed so light still means low. */
export const attrRamp = (t: number) => interpolateViridis(1 - t);
