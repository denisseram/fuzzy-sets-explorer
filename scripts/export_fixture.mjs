// Writes the correctness fixture (docs/guide.md, src/lib/fuzzyDecomposition.test.ts) as a bundled fz-1 dataset:
//   node scripts/export_fixture.mjs   ->  public/data/fixture/{meta.json, membership.bin}
import { mkdirSync, writeFileSync } from "node:fs";

const rows = [
  ["E1", 0.8, 0.7, 0.5],
  ["E2", 0.2, 0.9, 0.4],
  ["E3", 0.0, 0.0, 0.0],
  ["E4", 0.6, 0.6, 0.0],
];
const out = new URL("../public/data/fixture/", import.meta.url);
mkdirSync(out, { recursive: true });
const P = Float32Array.from(rows.flatMap((r) => r.slice(1)));
writeFileSync(new URL("membership.bin", out), Buffer.from(P.buffer));
const meta = {
  schema: "fz-1.0.0",
  title: "Correctness fixture",
  source: "Hand-made fixture with known inclusive and additive values (see docs/guide.md, section 8).",
  attribution: "hand-made",
  notes: "Four elements in three sets; every value in the plot can be checked by hand.",
  n: rows.length,
  obs_ids: rows.map((r) => r[0]),
  obs_names: rows.map((r) => r[0]),
  obs_word: "elements",
  sets: { title: "sets", names: ["A", "B", "C"], kind: "graded", file: "membership.bin" },
  categories: {},
  numeric_attributes: [],
  map: null,
};
writeFileSync(new URL("meta.json", out), JSON.stringify(meta, null, 1) + "\n");
console.log("wrote", out.pathname);
