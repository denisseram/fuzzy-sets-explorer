# Fuzzy Sets Explorer: a guide to the plot, its parameters and encodings

The page shows one UpSet plot for fuzzy sets. Every number comes from `src/lib/fuzzyDecomposition.ts`.

## 1. Concepts

An **element** *x* (a movie, a cell) has a **membership** `m(x, i)` between 0 and 1 in every **set** *i* (a genre, a
cell type). Memberships are independent: they need not sum to 1 and are never normalised.

- **graded** sets: memberships anywhere in 0–1 (MovieLens: the Tag Genome relevance of the genre's tag);
- **crisp** sets: memberships 0 or 1 only (UpSet movies). The threshold then has no effect and is disabled.

*K* is the set of currently **selected sets** (at most 20). All calculations are relative to *K*.

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

    m'(x, i) = m(x, i) if m(x, i) ≥ τ_i, else 0

τ_i = τ for every set, unless **per-set thresholds** are on (section 11).

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

Under the title: "Showing 37 of 412 nonzero combinations" (section 11.2).

**Controls bar**

- Row 1: **Mode** (Inclusive intersections | Additive contributions); **Reference element** (a searchable field with
  the contributors of the selected row); **Threshold** (threshold mode and its sidebar; disabled for crisp data);
  **Snapshot** (section 11.11).
- Row 2: **Sort**, **Group by**, **Set order**, **Rows** (level of detail), **Fish-eye**, **Filters ▾**, **Query ▾**,
  and, while a row is selected, **Neighbourhood**.
- **Set shelf** above the plot: the sets not selected, as chips. At most 20 sets, at least 1. Default: the 4 sets
  with the largest sigma-count (sum of memberships), in dataset order.

**The plot** (transposed UpSet)

- One **row** per combination of the selected sets with membership mass > 0 in the active mode. Rows with zero mass
  are hidden unless **Show empty rows** (Filters) is on; that option is disabled above 10 selected sets. Default
  order: number of sets ascending, then lexicographic by column order.
- One **column** per selected set: its name, the histogram of all its memberships > 0 (τ_i marked in threshold
  mode), and the 0–1 axis of the histograms below.
- **Circles** (one size) joined by a **connector** mark the sets of a row. They only identify the combination and
  never encode membership. Sets outside the row are light empty dots.
- **Summary bars** left of the matrix, on one shared axis "elements", growing leftward: the outline is the number of
  **contributors**, the solid bar the **membership mass** in the active mode. Mass ≤ contributors, since each
  contributor adds at most 1; their ratio is the mean contribution. The axis range is adjustable (section 11.6); by
  default it is the largest inclusive row (fixed across modes), so bars can be compared when switching.
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

With the defaults (empty rows hidden), additive mode shows 5 rows: C and AC have component mass 0.

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
  Grey (#8C9099): rings and their histograms. Red (#E4002B): the reference line, band, label and τ marks.
- Compact strips: ink at opacity 0.1 + 0.85 · count / max (grayscale on the shared count scale).
- Rank changes: green #2E8540 (moved up), red #B91C1C (moved down); stubs #D5D7DD.
- Rows: Full 30 px (Auto: 28–30), Compact 18 px (Auto: 12–27), Minimal 9 px (Auto: 6–11). Group headers 18–22 px,
  stubs 5 px (a 3 px line). Histograms and strips 72 px wide; circles of radius 6.5 px (smaller in short rows).

## 10. Caveats

- **One count scale.** A row with many contributors sets the scale for all; histograms of small rows can be almost
  flat (MovieLens, additive mode). Hover the bins for exact counts.
- **Many tiny memberships.** Without a threshold any membership above 0 makes an element a contributor; with Tag
  Genome scores almost every movie contributes to every inclusive row. Threshold mode removes those.
- **Dense data, many sets.** When almost every element has every membership > 0 (MovieLens), inclusive mode has up to
  2^|K| − 1 nonzero rows; the enumeration then stops at the row budget (section 11.1). Raise the minimum mass, lower
  the maximum degree, or use threshold mode.

## 11. Scalability: up to 20 sets, hundreds of rows, 50,000 elements

Everything stays in one plot; features live in the plot, the controls bar, the threshold sidebar, or tooltips. The
calculations are in `src/lib/fuzzyDecomposition.ts`, the display logic in `src/lib/upsetView.ts` (both pure and
tested); the brute-force definitions are kept in `src/lib/bruteForce.ts` as test oracles only.

### 11.1 Computation without all 2^|K| combinations

**Additive: per-element chains.** For each element, its distinct positive values over *K* in descending order
v1 > v2 > … > vm (v(m+1) = 0) give the combinations S_j = { i ∈ K : m'(x, i) ≥ v_j } with
`component(x, S_j) = v_j − v(j+1)`; every other combination has component 0. Tied sets enter the same S_j.
O(|K| log |K|) per element.

**Inclusive: level-wise (Apriori) enumeration.** inclusiveMass and inclusiveCount are anti-monotone (T ⊆ T' ⇒
value(T') ≤ value(T)). Level 1: every set with mass ≥ minMass (minMass = 0 means > 0). Level k: unions of two kept
(k−1)-combinations sharing k−2 sets whose every (k−1)-subset was kept; their contributors are the intersection of the
parents' contributors. The enumeration stops at the maximum degree *d*, at an empty level, or before a level whose
candidates would exceed **10,000 rows** or **10 million stored contributor indices** (memory). Then the line under
the title says so ("enumeration stopped before degree k") and the total becomes "at least …".

Property tests compare both with the brute-force definitions on 1,000 random datasets (|K| ≤ 6, values from
{0, 0.5, 1, random}, random τ, random per-set τ): masses within 1e-9, identical contributor sets.

**Benchmark** (`npm run bench`, synthetic soft clustering: 50,000 elements, |K| = 20, 1–4 positive memberships each):
see the README for measured times. Targets: additive < 300 ms, inclusive (minMass = 0) < 1 s. Both are met on the
main thread, so no Web Worker is used.

### 11.2 Filters (Filters ▾)

- **Show empty rows** (off; disabled above 10 sets). Empty rows obey only the degree range.
- **Degree** from *i* to *d*: defaults 1 and the maximum nonzero degree (the largest number of sets in which one
  element has m' > 0; the same for both modes).
- **Minimum mass** (0 = "> 0") and **minimum contributors** (1).
- Filters apply after computation, except the minimum mass and *d*, which also prune the inclusive enumeration.
- "Showing X of Y nonzero combinations": X rows pass the filters; Y nonzero rows were found (a lower bound when the
  enumeration was pruned; its tooltip says why).

### 11.3 Aggregation (Group by)

None | Degree | Set | Pairs | Set → pairs. Group headers have a shaded framed background, ▸/▾ (click to collapse;
a collapsed group becomes one stub), the label at the left, and a summary bar along the bottom of the header:
mass = sum of the rows' masses (tooltip in inclusive mode: "sum of row masses (rows overlap)"), contributors =
distinct elements over the rows. No histograms in headers. Set and pair headers draw the grouping sets as dark circles
and the other sets as "may" (light circle with a dark dot). By set and by pairs repeat rows across groups. By pairs,
rows of one set form a last group "One set"; set → pairs nests "A, B", … and "A only" under "Contains A". Groups keep a
fixed order (degree ascending; sets in column order); sorting applies within groups. In additive mode, the pair group
{A, B} has mass `inclusiveMass(A ∩ B)` (tested).

### 11.4 Sorting and queries

**Sort**: Degree (default; ties by column order) | Membership mass | Contributors | Mean contribution (descending;
ties by degree order).

**Query ▾**: clauses with one state per selected set, cycled by clicking: may (light circle with a dark dot) → must
(dark disc) → not (light ring). OR between clauses; each clause is also written in words ("in A and B, not in C";
"in neither C nor D"; "any combination"). Matching rows get an accent mark at their left edge; the result is an
aggregate row pinned under the header (summary bar: sum of masses, distinct contributors). When nothing matches, the
pinned row says "no combination matches" and has no bar. Queries select combinations, not elements, among the rows
that pass the filters.

### 11.5 Level of detail (Rows)

Auto (default) | Full | Compact | Minimal. Auto picks the largest row height (at most 30 px) at which all rows fit in
the plot's visible height, never below 6 px; the level follows from the height: **Full** (≥ 28 px) the histogram with
its curve; **Compact** (12–27 px) a strip of the 5 bins as grayscale cells (darker = more elements, shared count
scale); **Minimal** (< 12 px) circles and connector only. The reference line becomes a red tick on the strip
(Compact) and is hidden (Minimal); rings stay rings. Only the rows near the visible part are drawn.

### 11.6 Adjustable scale and horizon bars

Above the bars, a top axis 0–N with labels **R** (largest row), **G** (largest group, when grouped) and **U** (N).
Clicking a label, or dragging along the top axis, sets the range of the lower axis used by the bars (shaded on the top
axis). A bar longer than the range wraps around: each wrap is drawn narrower (−24 % height) and darker over the
previous one, up to 3 wraps; beyond that a break symbol (two white slashes) marks the bar. Count and mass bars wrap
independently.

### 11.7 Fish-eye

Off by default. When on and the rows overflow, the hovered row (after 150 ms) or else the selected row and 3
neighbours on each side get Full height; the others share the rest of the height (never below 6 px); if that does not
fit, the rows farthest from the focus become stubs.

### 11.8 Lattice neighbourhood

While a row T is selected: Neighbourhood Off | 1 | 2 | 3 and "Supersets only". The distance between combinations is
|T Δ S| (sets added or removed). Rows within the distance stay; the others are replaced by stubs in place (the order
does not change). Supersets only keeps S ⊇ T: in additive mode these rows' components add up to T's inclusive mass.

### 11.9 Stubs

A 3 px light-grey line across the row's width, with a tooltip ("12 rows hidden: outside the neighbourhood"). Stubs
mark collapsed groups, rows outside the neighbourhood, and rows hidden only by the fish-eye; consecutive hidden rows
share one stub. When the selected row is scrolled out of view, "▲/▼ selected row" at the top or bottom edge scrolls
back to it.

### 11.10 Threshold sidebar, set shelf, set order

- The τ slider sits over the histogram of all memberships > 0 in the selected sets (bins of 0.2). **Per-set
  thresholds**: one slider per selected set over its own histogram (starting at the current τ); m' uses τ_i, rings use
  β·τ_i to τ_i. All identities hold with per-set thresholds (tested).
- **Set shelf**: the sets not selected, as chips (name + histogram of memberships > 0, τ marked). Click a chip, or drag
  it into the header row (highlighted while dragging), to select it; drag a column header out of the header row to
  deselect it. Adding beyond 20 sets is disabled (tooltip).
- **Set order**: Input order | Sigma-count (descending) | Similarity. Fuzzy Jaccard
  J(A, B) = Σ min(μA, μB) / Σ max(μA, μB) (0 when the denominator is 0), on the original memberships. Similarity order
  starts with the largest sigma-count and repeatedly appends the unplaced set with the highest J to the last placed
  set. A header's tooltip lists its 3 most similar sets (among all sets) with J.

### 11.11 Snapshots and rank comparison

**Snapshot** stores the ranking of the rows that pass the filters (key, rank, mass, count) with its settings (mode,
τ or τ_i, sort, filters); at most 2, a third replaces the oldest; ✕ removes one. Each is drawn right of the bars as a
narrow column of mini glyphs (one dot per selected set) in the snapshot's order, labelled "inclusive, τ = 0.3" or
"additive, τ off", with slope lines from the live rows (green: ranked higher now, red: lower, grey: same). A row
missing on one side gets a short arrow and a tooltip ("not in snapshot" / "not in the live chart"). After any change
of mode, τ, sort or filters, rows that moved up flash green and rows that moved down red (opacity 0.25 for one rank up
to 0.7 for 10 or more), fading over 2 s, while rows move to their new position (400 ms). Typical use: snapshot at
τ = 0.3, move τ to 0.6, compare.
