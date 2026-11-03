import { useEffect, useState } from "react";
import { DatasetContext, type Dataset } from "../lib/dataset";
import { loadFz } from "../lib/loadFz";
import InfoPopover from "./InfoPopover";
import TitleBar, { type DatasetOption } from "./TitleBar";
import Upset from "./Upset";

/** The bundled datasets: public/data/<key>/ in the fz-1 format (scripts/export_*.py). */
const DATASETS: DatasetOption[] = [
  { key: "movielens", label: "MovieLens genres (graded)" },
  { key: "movies", label: "UpSet movies (crisp)" },
  { key: "iris", label: "Iris species, kNN (graded)" },
  { key: "integration", label: "Integration cell types, kNN (graded)" },
];

/** Picks the dataset (?dataset=<key> or the first), loads it and hands it to the explorer. */
export default function App() {
  const [which, setWhich] = useState(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("dataset") : null;
    return DATASETS.some((d) => d.key === q) ? q! : DATASETS[0].key;
  });
  const [cache, setCache] = useState<Record<string, Dataset>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ds = cache[which] ?? null;
  const error = errors[which] ?? null;

  useEffect(() => {
    if (cache[which] || errors[which]) return;
    loadFz(which)
      .then((d) => setCache((c) => ({ ...c, [which]: d })))
      .catch((e: Error) => setErrors((p) => ({ ...p, [which]: e.message })));
  }, [which, cache, errors]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("dataset", which);
    window.history.replaceState(null, "", url);
  }, [which]);

  const bar = <TitleBar datasets={DATASETS} which={which} onWhich={setWhich} current={ds} />;
  return (
    <div className={`app${import.meta.env.DEV ? " dev" : ""}`}>
      {bar}
      {ds ? (
        <Explorer key={ds.id} ds={ds} />
      ) : (
        <main className="cols">
          <section className="col col-upset">{error && <p className="panel-note">Could not load the data: {error}</p>}</section>
        </main>
      )}
      {!ds && !error && (
        <div className="loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Loading the dataset…
        </div>
      )}
    </div>
  );
}

function Explorer({ ds }: { ds: Dataset }) {
  const [mapEl, setMapEl] = useState<HTMLElement | null>(null);
  const [vizEl, setVizEl] = useState<HTMLElement | null>(null);
  return (
    <DatasetContext.Provider value={ds}>
      <main className="cols">
        <section className="col col-upset panel" id="upset">
          <p className="panel-title">
            Fuzzy UpSet
            <InfoPopover label="About this view">
              <strong>What it shows.</strong> Which combinations of {ds.sets.title} the {ds.obsWord} belong to, and how
              strongly. Every {ds.obsWord.replace(/s$/, "")} has a membership from 0 to 1 in each of the {ds.sets.title}; it
              belongs to every one whose membership reaches τ, and its strength is the lowest of those memberships. It is
              <em> near</em> (almost belongs to) a set when its membership is from the near level (τ/2 by default) up to τ.
              Each column is one combination: the solid bar is its fuzzy size (sum of strengths), the outline its number
              of {ds.obsWord}. Below: the dot matrix, with a grey ring where enough of the column is near that
              set (▸ under a bar splits the column by what its {ds.obsWord} are near, those near 3 or more sets pooled as
              "mixed"), the composition by other variables and numerical attributes. Clicking a column highlights
              its {ds.obsWord} on the map (Esc or "Clear selection" to undo).
              {ds.sets.kind === "crisp" && (
                <>
                  <br /><br />
                  <strong>Crisp sets</strong>: memberships are 0 or 1 (the limiting case of a fuzzy set), so τ has no
                  effect and every strength is 1.
                </>
              )}
            </InfoPopover>
          </p>
          <Upset mapEl={mapEl} vizEl={vizEl} />
          <p className="panel-note data-note">
            {ds.N} {ds.obsWord}. {ds.notes} <span className="data-src">Data: {ds.attribution}</span>
          </p>
        </section>
        <section className="col col-map" ref={setMapEl} aria-label="Map" />
        <section className="col col-viz" ref={setVizEl} aria-label="Memberships and τ barcode" />
      </main>
    </DatasetContext.Provider>
  );
}
