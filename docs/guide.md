# Fuzzy Sets Explorer: a guide to the plot, its parameters and encodings

The page shows one UpSet plot for fuzzy sets. Every number comes from `src/lib/fuzzyDecomposition.ts`.

## 1. Concepts

An **element** *x* (a movie, a cell) has a **membership** `m(x, i)` between 0 and 1 in every **set** *i* (a genre, a
cell type). Memberships are independent: they need not sum to 1 and are never normalised.

- **graded** sets: memberships anywhere in 0–1 (MovieLens: the Tag Genome relevance of the genre's tag);
- **crisp** sets: memberships 0 or 1 only (UpSet movies). The threshold then has no effect and is disabled.

*K* is the set of currently **selected sets** (at most 6). All calculations are relative to *K*.

**Membership levels.** At a level α in (0, 1], *x* belongs crisply to `{ i ∈ K : m(x, i) ≥ α }`. Both modes below are
the crisp UpSet plot integrated over all α. α is the explanation only; it is not a control.

### Inclusive intersections (default)

For a combination *T*, sets outside *T* are unrestricted:

    inclusiveMembership(x, T) = min over i ∈ T of m(x, i)
    inclusiveMass(T)          = Σₓ inclusiveMembership(x, T)
    inclusiveCount(T)         = number of distinct x with inclusiveMembership(x, T) > 0

`inclusiveMembership(x, T)` is the length of the α range in which *x* is in every set of *T*. An element contributes
to many rows. Inclusive values do not depend on *K*.

### Additive contributions

For a combination *S*:

    insideMinimum   = min over i ∈ S of m(x, i)
    outsideMaximum  = max over j ∈ K \ S of m(x, j)   (0 when S = K)
    component(x, S) = max(0, insideMinimum − outsideMaximum)
    componentMass(S)  = Σₓ component(x, S)
    componentCount(S) = number of distinct x with component(x, S) > 0

`component(x, S)` is the length of the α range in which *x*'s crisp pattern is **exactly** *S*: membership above the
element's memberships in the other selected sets. Components depend on *K*.

Components are not disjoint groups of elements. Per element, the nonzero components form a nested chain of at most
|K| combinations (sort the memberships; each step down adds the next set). So one element contributes to up to |K|
rows, and additive counts do not sum to the number of elements.

**Identities** (tested for every element and every mass):

    inclusiveMembership(x, T) = Σ over S ⊇ T of component(x, S)
    inclusiveMass(T)          = Σ over S ⊇ T of componentMass(S)
    Σ over all S of component(x, S) = max over i ∈ K of m(x, i)

So the additive masses sum to the sigma-count of the fuzzy union of *K*. With 0/1 memberships, inclusive mode gives
the crisp inclusive intersections and additive mode the crisp exclusive ("distinct") intersections.

A component is **not** `min(min over S, 1 − max over K \ S)` (a t-norm with the complement): that does not reconstruct
the inclusive values.

### Threshold mode

Off by default. Memberships below τ are replaced by 0, the others kept:

    m'(x, i) = m(x, i) if m(x, i) ≥ τ, else 0

Everything above (contributors, masses, counts, identities) then uses *m'*. A membership equal to τ reaches it
(compared with a tolerance of 1e-12, because the slider gives values such as 0.15000000000000002).

## 2. Data and validation

Datasets use the fz-1 format (`scripts/fz.py`, `src/lib/loadFz.ts`): `meta.json` plus `membership.bin` (float32, N × L).
Each element has a stable unique identifier (`obs_ids`); categories and numerical attributes are optional metadata,
shown in the reference element's tooltip.

On load, before any calculation, a missing, non-numeric, NaN or out-of-range membership, and an identifier used more
than once, are errors. The element is excluded, never set to 0 (with a duplicated identifier, every element using it
is excluded). One note above the plot says how many were excluded; its tooltip lists the details. If no valid element
remains, the error is shown instead of the plot.

float32 values are read as the shortest decimal that rounds to the same float32 (stored 0.7 = 0.699999988… → 0.7), so
a stored 0.7 reaches τ = 0.7.

## 3. Layout

A navy title bar holds the dataset button (datasets and their sources). Below it, one panel:

**Controls**

- **Mode**: Inclusive intersections | Additive contributions. Switching updates the same chart.
- **Reference element**: a searchable field (type to filter); it offers the contributors of the selected row.
- **Threshold**: turns threshold mode on and opens the sidebar. Disabled for crisp data.
- **Sets**: one chip per set; at most 6, at least 1. Default: the 4 sets with the largest sigma-count (sum of
  memberships), in dataset order.

**The plot** (transposed UpSet)

- One **row** per nonempty combination of the selected sets (2^|K| − 1, also those with value 0). Order: number of
  sets ascending, then lexicographic by column order. The order never changes with the mode or τ.
- One **column** per selected set, named at the top, with the 0–1 axis of its histograms under the name (and τ, in
  threshold mode).
- **Circles** (one size) joined by a **connector** mark the sets of a row. They only identify the combination and
  never encode membership. Sets outside the row are light empty dots.
- **Summary bars** left of the matrix, on one shared axis "elements", growing leftward: the outline is the number of
  **contributors**, the solid bar the **membership mass** in the active mode. Mass ≤ contributors, since each
  contributor adds at most 1; their ratio is the mean contribution. The axis is fixed across modes (the inclusive
  maximum), so bars can be compared when switching.
- **Histograms**: in each cell of a set in the row, right of the circle.

The panel ends with the dataset's size, notes and attribution. **ⓘ** next to the title summarises this guide.

## 4. Membership histograms

In each cell of a set *i* in row *T*, a histogram of the row's **contributors'** **original** memberships in *i*
(not minima, not components, not thresholded values):

- **Population**, the same for every set of the row: inclusive mode, elements with `inclusiveMembership(x, T) > 0`;
  additive mode, elements with `component(x, T) > 0`; in threshold mode decided with *m'*.
- **X**: membership, 0 at the left edge, 1 at the right edge; 72 px for every histogram.
- **Bins**: [0, 0.2), [0.2, 0.4), [0.4, 0.6), [0.6, 0.8), [0.8, 1.0], by explicit edges (not floor(v / 0.2), which
  puts 0.6 in the wrong bin and 1.0 in a sixth). Binning is display only.
- **Y**: number of elements per bin, bars growing up from the row's baseline, plus a monotone curve through the bin
  centres (no overshoot) with a light fill. One count scale for every histogram on screen (mode, sets and τ fixed).
- No contributors: only the baseline.
- Each histogram sits on an opaque background drawn over the connector, so the connector visibly runs from circle to
  circle and is interrupted by the distributions. Histogram axes are thin and light grey.
- Threshold mode: a short tick marks τ on the axis and [0, τ) is shaded very lightly.

## 5. Threshold sidebar and rings

The sidebar (only in threshold mode) holds:

- **Threshold τ**: 0.05–0.95, step 0.05, default 0.5.
- **Ring level β**: ⅓, ½ (default), ¾. Memberships from β·τ up to τ count as "below τ but near".
- **Ring share**: 10 %, 20 % (default), 33 % of a row's contributors.

**Rings.** In a row, a set outside the combination gets a ring instead of the light dot when at least the ring share
of the row's contributors have β·τ ≤ m < τ in it (original values). The ring is a grey disc with a white hole that
shrinks as the mean of those memberships approaches τ. Next to it, a mini histogram of those memberships in the
lighter ring colour, on the same axis and count scale. Rings never enter masses, counts or the reference line.
Tooltip: "2 of 3 contributors have 0.25 ≤ C < 0.50; mean 0.41".

## 6. Reference element

The reference line shows the intersection minimum of **one** element: not an aggregate, not a mean or a threshold.

For the selected element *x* and the selected row *T*: `referenceValue = min over i ∈ T of m(x, i)` (original values,
also in threshold mode). A dashed red vertical line at that value is drawn in the histograms of every set of *T*, and
a label right of the matrix reads, e.g., "E1: min(A, B) = 0.70". The line's tooltip adds *x*'s membership in that set
and its metadata.

In additive mode the line still shows the inclusive minimum. A red band from `outsideMaximum` to `insideMinimum` is
shaded on the histograms: its width is exactly `component(x, T)` (with *m'* in threshold mode).

Rules: the field offers only the contributors of the selected row in the active mode (and τ). No reference by
default. When the row, mode, sets or τ change, the element is kept if it still contributes, otherwise cleared.

## 7. Interaction

- No row is selected initially. Clicking a row (bars or matrix) selects it; clicking it again deselects it. The
  selected row is tinted, its connector is thicker, and the other rows fade.
- The selected row persists across mode and τ changes; it is cleared when one of its sets is deselected.
- Everything is recalculated when the selected sets, the mode or τ change.
- Tooltips: bars (contributors, mass, mean), histogram bins (range and count), circles and rings, the reference line.

## 8. Correctness fixture

Bundled as the dataset "Correctness fixture" (`?dataset=fixture`, written by `scripts/export_fixture.mjs`) and used
in the unit tests:

| | A | B | C |
|---|---|---|---|
| E1 | 0.8 | 0.7 | 0.5 |
| E2 | 0.2 | 0.9 | 0.4 |
| E3 | 0.0 | 0.0 | 0.0 |
| E4 | 0.6 | 0.6 | 0.0 |

Without threshold, component masses (contributors): A 0.1 (E1) · B 0.5 (E2) · C 0 · AB 0.8 (E1, E4) · AC 0 ·
BC 0.2 (E2) · ABC 0.7 (E1, E2).

Inclusive A ∩ B: mass 1.5, contributors E1, E2, E4; histograms A [0.8, 0.2, 0.6], B [0.7, 0.9, 0.6]; with E1 as
reference, the line is at 0.7 in both. Additive AB: mass 0.8, contributors E1, E4; E1's band runs from 0.5 to 0.7.

Threshold τ = 0.5, β = ½, share 20 % (E1's C = 0.5 reaches τ):

- Inclusive: A 1.4 (E1, E4) · B 2.2 (E1, E2, E4) · C 0.5 (E1) · AB 1.3 (E1, E4) · AC 0.5 · BC 0.5 · ABC 0.5 (E1).
- Additive: A 0.1 (E1) · B 0.9 (E2) · C 0 · AB 0.8 (E1, E4) · AC 0 · BC 0 · ABC 0.5 (E1).
- Rings: row B rings set C in both modes (E2: C = 0.4). E2's A = 0.2 is below β·τ = 0.25: no ring.

## 9. Colours and sizes

- Navy (#282C5F): bars and histograms. Ink (#16191D): circles and connector. Light grey (#E4E5EA): empty dots.
  Grey (#8C9099): rings and their histograms. Red (#E4002B): the reference line, band and label.
- Row height 30 px (histogram plot 21 px tall), histogram 72 px wide, circles of radius 6.5 px.

## 10. Caveats

- **One count scale.** A row with many contributors sets the scale for all; histograms of small rows can be almost
  flat (MovieLens, additive mode). Hover the bins for exact counts.
- **Many tiny memberships.** Without a threshold any membership above 0 makes an element a contributor; with Tag
  Genome scores almost every movie contributes to every inclusive row. Threshold mode removes those.
- **Scalability.** At most 6 sets (63 rows) in this version.
