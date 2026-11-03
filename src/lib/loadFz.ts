// Reads a dataset in the fz-1 format (written by scripts/fz.py):
//   meta.json       observations, sets, categories, numerical attributes, map name
//   membership.bin  float32 little-endian, N × L, 0–1
//   map.bin         float32 little-endian, N × 2 (optional: without it the map is the PCA of the memberships)

import type { Dataset, NumericAttr, Point2D } from "./dataset";
import { strongestSet } from "./fuzzyUpset";
import { jacobi } from "./linalg";
import { OTHER, PALETTE } from "./palette";

export const SCHEMA_MAJOR = "fz-1.";

export type FzMeta = {
  schema: string;
  title: string;
  source: string;
  attribution: string;
  notes?: string;
  n: number;
  obs_ids: string[];
  obs_names?: string[] | null;
  /** What the observations are called, plural ("movies"); defaults to "observations". */
  obs_word?: string;
  sets: { title: string; names: string[]; kind: "graded" | "crisp"; file: string };
  categories: Record<string, { title: string; names: string[]; codes: number[] }>;
  numeric_attributes: NumericAttr[];
  map?: { name: string; description: string; file: string } | null;
};

const colors = (names: string[]) => names.map((_, i) => PALETTE[i] ?? OTHER);

/** 2D PCA of the memberships (centred), scaled into the unit square: the map when a dataset ships none. */
export function pcaMap(P: Float32Array, N: number, L: number): Point2D[] {
  const mean = new Float64Array(L);
  for (let i = 0; i < N; i++) for (let l = 0; l < L; l++) mean[l] += P[i * L + l] / N;
  // covariance L × L, then its top two eigenvectors
  const C = Array.from({ length: L }, () => new Array<number>(L).fill(0));
  for (let i = 0; i < N; i++)
    for (let a = 0; a < L; a++) {
      const da = P[i * L + a] - mean[a];
      for (let b = a; b < L; b++) C[a][b] += da * (P[i * L + b] - mean[b]);
    }
  for (let a = 0; a < L; a++) for (let b = 0; b < a; b++) C[a][b] = C[b][a];
  const { vectors } = jacobi(C, L);
  const pts: Point2D[] = Array.from({ length: N }, (_, i) =>
    [0, 1].map((c) => (vectors[c] ? vectors[c].reduce((s, w, l) => s + w * (P[i * L + l] - mean[l]), 0) : 0)) as Point2D,
  );
  return unitSquare(pts);
}

/** Shifted and scaled (aspect kept) into [0, 1]². */
export function unitSquare(pts: Point2D[]): Point2D[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const s = Math.max(x1 - x0, y1 - y0, 1e-12);
  return pts.map(([x, y]) => [(x - x0) / s, (y - y0) / s]);
}

/** A Dataset from the parsed meta and the raw binary files (pure: no fetching). */
export function buildDataset(id: string, meta: FzMeta, membership: ArrayBuffer, map: ArrayBuffer | null): Dataset {
  if (!meta.schema?.startsWith(SCHEMA_MAJOR)) throw new Error(`${id}: schema ${meta.schema}, expected ${SCHEMA_MAJOR}x`);
  const N = meta.n, L = meta.sets.names.length;
  const P = new Float32Array(membership);
  if (P.length !== N * L) throw new Error(`${id}: membership.bin holds ${P.length} values, expected ${N} × ${L}`);
  let pts: Point2D[];
  if (map) {
    const xy = new Float32Array(map);
    if (xy.length !== N * 2) throw new Error(`${id}: map.bin holds ${xy.length} values, expected ${N} × 2`);
    pts = Array.from({ length: N }, (_, i) => [xy[2 * i], xy[2 * i + 1]]);
  } else pts = pcaMap(P, N, L);
  return {
    id,
    title: meta.title,
    N,
    sets: { title: meta.sets.title, names: meta.sets.names, colors: colors(meta.sets.names), kind: meta.sets.kind, P, top: strongestSet(P, L) },
    categories: Object.entries(meta.categories ?? {}).map(([key, c]) => ({ key, title: c.title ?? key, names: c.names, codes: c.codes, colors: colors(c.names) })),
    numeric: meta.numeric_attributes ?? [],
    obsNames: meta.obs_names ?? null,
    obsWord: meta.obs_word ?? "observations",
    map: map && meta.map
      ? { name: meta.map.name, description: meta.map.description, pts }
      : { name: "PCA · memberships", description: `PCA of the memberships in the ${meta.sets.title}.`, pts },
    source: meta.source,
    attribution: meta.attribution,
    notes: meta.notes ?? "",
  };
}

/** Fetches public/data/<id>/ (under the site's base path) and builds the dataset. */
export async function loadFz(id: string): Promise<Dataset> {
  const base = `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}data/${id}/`;
  const get = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${base}${f}: HTTP ${r.status}`);
    return r;
  };
  const meta = (await (await get("meta.json")).json()) as FzMeta;
  const [membership, map] = await Promise.all([
    get(meta.sets.file).then((r) => r.arrayBuffer()),
    meta.map ? get(meta.map.file).then((r) => r.arrayBuffer()) : Promise.resolve(null),
  ]);
  return buildDataset(id, meta, membership, map);
}
