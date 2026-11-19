import { useEffect, useMemo, useState } from "react";
import { type Dataset } from "../lib/dataset";
import { validateMemberships } from "../lib/fuzzyDecomposition";
import { loadFz } from "../lib/loadFz";
import FuzzyUpset from "./FuzzyUpset";
import InfoPopover from "./InfoPopover";
import TitleBar, { type DatasetOption } from "./TitleBar";

/** The bundled datasets: public/data/<key>/ in the fz-1 format (scripts/export_*.py, scripts/export_fixture.mjs). */
const DATASETS: DatasetOption[] = [
  { key: "movielens", label: "MovieLens genres (graded)" },
  { key: "movies", label: "UpSet movies (crisp)" },
  { key: "iris", label: "Iris species, kNN (graded)" },
  { key: "integration", label: "Integration cell types, kNN (graded)" },
  { key: "deconv_sim", label: "Spatial deconvolution, simulated (graded)" },
  { key: "fixture", label: "Correctness fixture (4 elements)" },
];

/** Picks the dataset (?dataset=<key> or the first), loads it and hands it to the plot. */
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

  return (
    <div className={`app${import.meta.env.DEV ? " dev" : ""}`}>
      <TitleBar datasets={DATASETS} which={which} onWhich={setWhich} current={ds} />
      <main className="cols">
        {ds ? <Explorer key={ds.id} ds={ds} /> : (
          <section className="col col-upset panel">{error && <p className="panel-note">Could not load the data: {error}</p>}</section>
        )}
      </main>
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
  // validation before any calculation: invalid elements are excluded, never set to 0
  const { data, issues } = useMemo(() => validateMemberships(ds.ids, ds.sets.P, ds.sets.names.length, { float32: true }), [ds]);
  return (
    <section className="col col-upset panel" id="upset">
      <p className="panel-title">
        Fuzzy UpSet
        <InfoPopover label="About this view">
          <strong>Rows</strong> are the combinations of the selected {ds.sets.title} (up to 20) with a membership mass
          above 0; black circles joined by a line mark the sets of a row (they only identify it). Every{" "}
          {ds.obsWord.replace(/s$/, "")} has a membership from 0 to 1 in each set. Add sets from the shelf above the plot
          (click or drag into the header row); drag a header out to remove it.
          <br /><br />
          <strong>Inclusive intersections</strong>: an element counts in a row with the smallest of its memberships in the
          row's sets (other sets unrestricted), so it can count in many rows.{" "}
          <strong>Additive contributions</strong>: it counts with how far that smallest membership exceeds its largest
          membership in the other selected sets. These parts add up: summed over every row containing a combination they
          give its inclusive value, and summed over all rows they give the element's largest membership.
          <br /><br />
          <strong>Bars</strong>: outline = contributors (elements with a value above 0 in the row), solid = membership mass
          (the sum of their values), on one axis. <strong>Cells</strong>: one point per contributor at its original
          membership in that set (0 bottom, 1 top), and a half violin of the same values (smoothed counts, one scale for
          all). <strong>Reference element</strong>: click a point (or pick it in the field) to draw that element's
          profile across the row and a dashed line at its minimum over the row's sets; in additive mode the shaded band
          is its contribution. <strong>Patterns</strong>: ribbons between neighbouring set axes show how the
          memberships combine (thickness = elements); ▸ on a row splits it into pattern rows (both high, one high, both
          low, about equal) that add up to the row.
          <br /><br />
          <strong>Threshold</strong>: memberships below τ count as 0. A grey ring marks a set outside the row that enough
          contributors nearly reach (from β·τ up to τ); its hole shrinks as their mean approaches τ.
          <br /><br />
          <strong>Many rows</strong>: Filters, Group by, Sort and Query work as in UpSet. Rows shrink to fit (Rows: points
          and violins, grayscale strips, or circles only; the selected row stays full); Fish-eye enlarges the rows around the hovered one; with a row
          selected, Neighbourhood keeps the rows within 1–3 set changes. The scale above the bars sets their range
          (longer bars wrap). Snapshot stores the ranking to compare it with later settings (e.g. another τ).
          {ds.sets.kind === "crisp" && (
            <><br /><br /><strong>Crisp sets</strong>: memberships are 0 or 1, so the threshold has no effect.</>
          )}
        </InfoPopover>
      </p>
      {data.N === 0 ? (
        <p className="fu-excl fu-error">No valid {ds.obsWord}: {issues.length} problems ({issues.slice(0, 3).map((s) => `${s.id}: ${s.detail}`).join("; ")}).</p>
      ) : (
        <FuzzyUpset ds={ds} data={data} issues={issues} />
      )}
      <p className="panel-note data-note">
        {data.N} {ds.obsWord}. {ds.notes} <span className="data-src">Data: {ds.attribution}</span>
      </p>
    </section>
  );
}
