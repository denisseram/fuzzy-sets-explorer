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
- One **column** per selected set: its name and the histogram of all its memberships > 0 (τ_i marked in threshold
  mode), membership 0 left to 1 right.
- **Circles** (one size) joined by a **connector** mark the sets of a row. They only identify the combination and
  never encode membership. Sets outside the row are light empty dots.
- **Summary bars** left of the matrix, on one shared axis "elements", growing leftward: the outline is the number of
  **contributors**, the solid bar the **membership mass** in the active mode. Mass ≤ contributors, since each
  contributor adds at most 1; their ratio is the mean contribution. The axis range is adjustable (section 11.6); by
  default it is the largest inclusive row (fixed across modes), so bars can be compared when switching.
- **Points and half violins**: in each cell of a set in the row, above the circle (section 4).

The panel ends with the dataset's size, notes and attribution. **ⓘ** next to the title summarises this guide.

## 4. Points and half violins

In each cell of a set *i* in row *T*, the row's **contributors'** **original** memberships in *i* (not minima, not
components, not thresholded values):

- **Population**, the same for every set of the row: inclusive mode, elements with `inclusiveMembership(x, T) > 0`;
  additive mode, elements with `component(x, T) > 0`; in threshold mode decided with *m'*.
- **Y**: membership, 0 at the bottom of the plot area, 1 at the top; light gridlines at 0.2, 0.4, 0.6, 0.8; "0" and
  "1" once per row, left of the first cell. A thin vertical axis line per cell.
- **Points**: one per contributor, at its membership, in a 22 px jitter strip left of the axis (radius 2.5 px). The
  horizontal offset is a hash of the element's index: the same in every cell of the row and across mode, τ and
  selection changes. Above **200 contributors** a row draws a fixed sample, the same elements in every cell: the 200
  contributors with the lowest sampling priority (a second hash of the element index, independent of the jitter),
  plus each cell's lowest and highest membership, plus the reference element (section 6). The priority is one global
  order, so an element sampled in one row tends to be sampled in other rows and after a change of mode or τ. The
  violin always summarises every contributor; its tooltip says when the points are a sample.
- **Half violin**, right of the axis, up to 72 px wide: smoothed counts

      f(y) = 0.2 × Σ_k [ K_h(y − v_k) + K_h(y + v_k) + K_h(y − (2 − v_k)) ]

  with a Gaussian kernel K_h, h = 0.06, reflected at 0 and 1 so no mass leaves [0, 1], evaluated at y = 0, 0.02,
  …, 1. f reads as "elements per 0.2 of membership" (its integral over [0, 1] is 0.2 · n); it is not a probability
  density. The values are linearly binned at 0.01 first (within 0.4 % of the direct sum). One horizontal scale for
  every violin: the largest f over **all filtered rows** (member and ring cells) is the full width, so a row's violins
  do not change when scrolling, with the fish-eye or when its level of detail changes. The cell tooltip states the
  scale ("violin width 72 px = X elements per 0.2").
- No contributors: only the axis.
- The circles and the connector sit in a strip at the bottom of the row, under the axes, so they never overlap points
  or violins.
- Threshold mode: a short tick marks τ (τ_i) on the axis and [0, τ) is shaded very lightly across the cell.

## 5. Threshold sidebar and rings

The sidebar (only in threshold mode) holds:

- **Threshold τ**: 0.05–0.95, step 0.05, default 0.5.
- **Ring level β**: ⅓, ½ (default), ¾. Memberships from β·τ up to τ count as "below τ but near".
- **Ring share**: 10 %, 20 % (default), 33 % of a row's contributors.

**Rings.** In a row, a set outside the combination gets a ring instead of the light dot when at least the ring share
of the row's contributors have β·τ ≤ m < τ in it (original values). The ring is a grey disc with a white hole that
shrinks as the mean of those memberships approaches τ. Above it (Full rows), a grey half violin of those memberships
on the same scale; in Compact rows a grey strip. Rings never enter masses, counts or the reference line.
Tooltip: "2 of 3 contributors have 0.25 ≤ C < 0.50; mean 0.41".

## 6. Reference element

The reference shows **one** element: not an aggregate, not a mean or a threshold. Choose it in the field, or click
one of its points: that element becomes the reference (the field follows) and its row is selected. Clicking the same
point again, Escape or ✕ clears it.

For the reference element *x* and the selected row *T* (Full rows):

- **Profile**: a red curve (2 px) through *x*'s points in the cells of *T*, left to right. Each step is one cubic
  Bézier segment with control points (xm, y0) and (xm, y1), xm the midpoint: it leaves and enters each point
  horizontally and never leaves the range of the two points it joins, so the profile's lowest point is *x*'s minimum.
  The curve is drawn under the points; *x*'s points are larger and red. A one-set row has no curve.
- **Dashed line** at `referenceValue = min over i ∈ T of m(x, i)` (original values, also in threshold mode), across
  the cells of *T*, with the label right of the matrix, e.g. "E1: min(A, B) = 0.70". Its tooltip adds *x*'s
  memberships and metadata. Compact rows: a red tick across each strip.
- **Additive mode**: the line still shows the inclusive minimum; a red band from `outsideMaximum` to `insideMinimum`
  spans the cells of *T*: its height is exactly `component(x, T)` (with *m'* in threshold mode).
- **Open all its rows** (next to the field, on by default): every shown row where *x* contributes is Full (points
  and violins, in any Rows setting, not dimmed), with *x*'s points, curve and dashed line. Off: only the selected row.

Rules: the field offers only the contributors of the selected row in the active mode (and τ). No reference by
default. When the row, mode, sets or τ change, the element is kept if it still contributes, otherwise cleared.

## 6b. Joint patterns: ribbons and pattern rows

The violins show each set of a row separately. Two views show how a contributor's memberships **combine** in the
row's sets (original values, also in threshold mode), at a cost that does not grow with the number of elements.

**Ribbons** (Full rows). Between each pair of neighbouring set axes of the row (column order), one ribbon per pair of
display bins: from bin *i* of the left set to bin *j* of the right set, as thick as the number of contributors in
both (parallel sets; at most 25 per pair, computed from all contributors, never the point sample). Inside each bin
the ribbons are stacked without overlap and centred; at the left axis ordered by their target bin, at the right axis
by their source bin, so ribbons cross only when the memberships do. Scale per row: the row's largest bin fills its
0.2 band (the bars give absolute sizes). Example, MovieLens Comedy ∩ Drama: 114 movies run from Comedy 0.8–1 to
Drama 0–0.2 and 183 from Comedy 0–0.2 to Drama 0.8–1, so two thick ribbons cross; 16 run along the top.

**Pattern rows.** ▸ at a row's left edge opens it into pattern rows directly under it (▾ closes them); several rows
can stay open. **Patterns ▾** in the controls: **Open all** (the first 300 rows of two or more sets), **Close all**,
**High from** (cut *c*, default 0.5) and **Equal within** (ε, default 0.15). Each contributor of the row is in exactly
one pattern:

- **Equal**: max − min of its memberships in the row's sets ≤ ε; then **Equal, high** (mean ≥ c + 0.1), **Equal,
  low** (mean < c − 0.1) or **Equal, middle**.
- Otherwise by which sets reach the cut: **Both / All high**, a **mixed** pattern (e.g. "Comedy high · Drama low"),
  or **Both / All low**.
- Rows of 2 or 3 sets: all high, mixed (more high sets first, then column order), all low, equal high, middle, low.
  Empty patterns are omitted; above 12 rows the smallest mixed patterns merge into "Other mixed (n patterns)".
- **Rows of 4 or more sets** first split by the **number** of high sets: "High in all 10", "High in 9 of 10", …,
  "High in 1 of 10", "High in none (all low)", then the equal rows. Every contributor lands in one of them (no
  "Other"), so the split stays readable however many patterns exist: in MovieLens, the 10-set row of the 10 largest
  genres has 184 distinct patterns but only 8 count groups (none 74, one 433, two 448, three 309, four 173, five
  46, six 15, seven 2). A count group with more than one pattern has its own ▸ and opens into its patterns ("↳ High
  in Drama, Comedy", in the group's colour, as a share of the group); at most 12, the smallest merged into "Other (n
  patterns)". Count groups are coloured by their count, one hue from light (none) to dark (all high), so a group
  keeps its colour whatever other groups exist.

Pattern rows partition the row: their contributors add up to the row's, and their masses (the sum of each
contributor's value in the row: the inclusive minimum of m', or the component) add up to the row's mass. They use the
row design (bars, points, violins, ribbons, circles) in the pattern's colour, with a light tint and a colour mark at
the left edge; the circles show high sets as filled discs and low sets as rings (equal rows: half-tone discs); the
label right of the matrix reads, e.g., "Comedy high · Drama low — 372 (25 %)". In Auto the selected row's pattern
rows are Full. They are display only: sorting, filters, groups, queries and snapshots use the rows. Clicking a
pattern row selects its row; the reference element's profile is also drawn in the pattern row that contains it.

Fixture, inclusive A ∩ B: **A low · B high** (E2, mass 0.2) and **Equal, high** (E1 0.8/0.7, E4 0.6/0.6; mass 1.3).

## 7. Interaction

- No row is selected initially. Clicking a row (bars or matrix) selects it; clicking it again deselects it. The
  selected row is tinted, its connector is thicker, and the other rows fade.
- The selected row persists across mode and τ changes; it is cleared when one of its sets is deselected.
- Everything is recalculated when the selected sets, the mode or τ change.
- Tooltips: bars (contributors, mass, mean), violins ("A in A ∩ B: 1,240 contributors" and the count of the 0.2 bin
  under the pointer), points ("P12: A = 0.62"), the profile curve (the element's memberships in the row's sets),
  circles and rings, the reference line.

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

Inclusive A ∩ B: mass 1.5, contributors E1, E2, E4; points A [0.8, 0.2, 0.6], B [0.7, 0.9, 0.6]; clicking E1's point
draws its profile from (A, 0.8) to (B, 0.7) and the dashed line at 0.70. Additive AB: mass 0.8, contributors E1, E4 (points A [0.8, 0.6], B [0.7, 0.6]); E1's band runs from 0.5 to 0.7.

Threshold τ = 0.5, β = ½, share 20 % (E1's C = 0.5 reaches τ):

- Inclusive: A 1.4 (E1, E4) · B 2.2 (E1, E2, E4) · C 0.5 (E1) · AB 1.3 (E1, E4) · AC 0.5 · BC 0.5 · ABC 0.5 (E1).
- Additive: A 0.1 (E1) · B 0.9 (E2) · C 0 · AB 0.8 (E1, E4) · AC 0 · BC 0 · ABC 0.5 (E1).
- Rings: row B rings set C in both modes (E2: C = 0.4). E2's A = 0.2 is below β·τ = 0.25: no ring.

## 9. Colours and sizes

- Navy (#282C5F): bars, histograms, violins (fill 14 %) and points (55 %).
- Patterns (validated as adjacent pairs, every pattern row labelled): all high #eb6834, mixed #2a78d6, #1baf7a,
  #eda100 (further mixed patterns grey #9a9894), all low #6250d6, equal high / middle / low #a8325f, #d55181, #e99ab8.
  Count groups (4+ sets): #c2541f mixed with the panel from 35 % (no high set) to 100 % (all high).
  Ribbons: navy at 18 % in rows, the pattern colour at 35 % in pattern rows. Ink (#16191D): circles and connector. Light grey (#E4E5EA): empty dots.
  Grey (#8C9099): rings and their histograms. Red (#E4002B): the reference profile, line, band, label and τ marks.
- Horizon wraps (bars past the range): the measure's colour plus a hatch (ink lines at 45 % on the light bar, white
  lines on the solid bar), never a darker colour.
- Compact strips: ink at opacity 0.1 + 0.85 · count / max (grayscale on the shared count scale).
- Rank changes: green #2E8540 (moved up), red #B91C1C (moved down); stubs #D5D7DD.
- Rows: Full 86 px (Auto: 80–86; plot area 56 px over a 24 px circle strip), Compact 24 px (Auto: 12–79), Minimal
  9 px (Auto: 6–11). Group headers 18–22 px, stubs 5 px (a 3 px line). Cells 116 px: 22 px jitter strip, axis, violin
  up to 72 px. Compact half violins and strips 16 px wide. Circles of radius 6.5 px (smaller in short rows).

## 10. Caveats

- **One count scale.** The row with the most contributors in a bin (among all filtered rows, on screen or not) sets
  the scale for all; violins of small rows can be almost flat (MovieLens, additive mode). Hover a violin for exact
  counts. The scale does not change when scrolling.
- **Few points.** With a handful of contributors the violin is a sum of narrow bumps; read the points.
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

Auto (default) | Full | Compact | Minimal. Auto keeps the selected row, every row opened into pattern rows (▸) with its
pattern rows, and the fish-eye focus rows Full. The other rows get the largest height (at most 86 px) at which all
rows fit in the plot's visible height, never below 6 px, computed as if no row were open: opening a row adds Full rows
and the plot scrolls, but the other rows keep their height;
the level follows from the height: **Full** (≥ 80 px) points, half violins and profiles; **Compact** (12–79 px) per
cell, set by **Compact cells**: a small half violin (default; 16 px wide, transparent so the row's connector shows
through, its width scaled per cell: shape only) or a vertical strip of the 5 bins stacked bottom ([0, 0.2)) to top as
grayscale cells (darker = more elements; the darkest cell is the largest bin over all filtered rows, the same rows
that set the violin scale); **Minimal**
(< 12 px) circles and connector only. The reference becomes a red tick across the strip (Compact) and is hidden
(Minimal); rings stay rings. Only the rows near the visible part are drawn.

### 11.6 Adjustable scale and horizon bars

Above the bars, a top axis 0–N with labels **R** (largest row), **G** (largest group, when grouped) and **U** (N).
Clicking a label, or dragging along the top axis, sets the range of the lower axis used by the bars (shaded on the top
axis). The default range is the largest single-set count, widened to the largest group and the query result, so no bar
wraps until the user sets a smaller range. A bar longer than the range wraps around (UpSet's horizon bars): each further range is drawn over the previous
layer, narrower (−24 % height), in the **same colour** as its measure and marked by a **hatch**: 45° for the first
wrap, 135° for the second, both for the third. The colour keeps meaning the measure (light = contributors, solid =
mass); the texture means "past the range" (dark lines on the light bar, white lines on the solid bar). Beyond 3 wraps
a break symbol (two white slashes) marks the bar. Count and mass bars wrap independently. While the range is shorter
than the largest row, group or query, the legend shows a hatched swatch "wrap", and bar tooltips add, e.g., "longer than the
range (400): contributors 3 × range + 120, mass 1 × range + 40".

### 11.7 Fish-eye

Off by default. The hovered row (after 150 ms) or else the selected row and 3 neighbours on each side get Full
height: always with Rows = Auto, otherwise when the rows overflow; the others share the rest of the height (never below 6 px); if that does not
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
