// A dataset = observations, their membership in a family of (fuzzy) sets, optional crisp categories and numerical
// attributes, and one 2D map of the observations. Built from the fz-1 files by lib/loadFz.ts; every view reads only
// this.

import { createContext, useContext } from "react";

export type Point2D = [number, number];

/** The sets the UpSet is about, and every observation's membership in each. */
export type SetFamily = {
  title: string;
  names: string[];
  colors: string[];
  /** "graded": memberships anywhere in 0–1; "crisp": 0 or 1 only (τ has no effect). */
  kind: "graded" | "crisp";
  /** Flat [N * L] memberships, row-major: P[i * L + l]. */
  P: Float32Array;
  /** Each observation's strongest set (map colour); -1 when it has none. */
  top: Int32Array;
};

/** One crisp label per observation (e.g. decade): composition rows and map colour. */
export type Category = {
  key: string;
  title: string;
  names: string[];
  codes: ArrayLike<number>;
  colors: string[];
};

/** A per-observation number (e.g. a movie's mean rating), summarised per UpSet column. */
export type NumericAttr = {
  key: string;
  title: string;
  unit: string;
  digits: number;
  /** Compare on a log scale (counts spanning orders of magnitude). */
  log?: boolean;
  /** Draw a density plot per column instead of a heatmap cell (e.g. release year). */
  plot?: "density";
  values: ArrayLike<number>;
};

export type Dataset = {
  id: string;
  title: string;
  N: number;
  sets: SetFamily;
  categories: Category[];
  numeric: NumericAttr[];
  /** Per-observation display names (e.g. movie titles); otherwise observations are "#i". */
  obsNames: string[] | null;
  /** What the observations are called ("movies"). */
  obsWord: string;
  map: { name: string; description: string; pts: Point2D[] };
  source: string;
  attribution: string;
  notes: string;
};

/** "Toy Story (1995)" when the dataset names its observations, else "#12". */
export const obsLabel = (ds: Dataset, i: number) => ds.obsNames?.[i] ?? `#${i}`;

export const DatasetContext = createContext<Dataset | null>(null);

export function useDataset(): Dataset {
  const ds = useContext(DatasetContext);
  if (!ds) throw new Error("useDataset outside DatasetContext");
  return ds;
}
