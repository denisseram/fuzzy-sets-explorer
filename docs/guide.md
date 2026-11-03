# Fuzzy Sets Explorer: a guide to every view, parameter and encoding

This guide explains what the page shows, how every number is computed and how to read every mark. You can read
it without the code. The definitions live in `src/lib/fuzzyUpset.ts` and `src/lib/fuzzyViews.ts`.

## 1. Concepts

An **observation** is one data point (a movie). A **set** is one of the dataset's categories (a genre). Every
observation *i* has a **membership** `P[i, l]` in every set *l*, between 0 and 1:

- **graded** sets: memberships anywhere in 0–1 (MovieLens: the Tag Genome relevance of the genre's tag);
- **crisp** sets: memberships 0 or 1 only, the limiting case of a fuzzy set (the UpSet movies' listed genres).
  τ then changes nothing and every strength is 1.

With a threshold **τ** (default 0.5, slider 0.05–0.95):

- **Combination (column)** of an observation: the sets whose membership reaches τ, `A(i) = { l : P[i, l] ≥ τ }`.
  An observation is in exactly one column: a movie with Comedy and Romance ≥ τ is in "Comedy & Romance", **not**
  in "Comedy". If no set reaches τ, it is in **no column** ("in no set at τ").
- **Strength** `s(i)`: the smallest membership among the sets of its column, i.e. how firmly it belongs to *all*
  of them.
- **Fuzzy size** of a column: the sum of its observations' strengths. It is never more than the number of
  observations; a column of 10 movies each with strength 0.5 has fuzzy size 5.
- **Near** a set: a membership from the **near level** (τ/2 by default; ⅓ τ or ¾ τ in Display options) up to τ,
  i.e. the observation *almost* belongs to it, such as the "little bit of Romance" of a movie in the Comedy column.
  Memberships below the near level count as **out**. Every membership is thus **in**, **near** or **out**.
- **Pure / borderline**: an observation is *pure* when it is near no set outside its column, *borderline* otherwise.
  A borderline observation near 3 or more other sets is **mixed** ("a bit of everything").

Example (MovieLens, τ = 0.5): 1,465 of 1,500 movies have at least one genre, giving 186 columns.

## 2. Layout

A navy title bar holds the dataset button, whose popover lists the datasets and the source of the current one.
Below it are three columns:

1. **Fuzzy UpSet** (left), with its controls, the chart, the composition tray, the legend and the dataset's notes
   and attribution.
2. **Map** (middle).
3. **Membership | Barcode** (right), with tabs and **⤢ Enlarge**, which opens the view large over the page.

## 3. The fuzzy UpSet

### Controls

- **Sets**: the set family, how many sets it has, and whether they are graded or crisp.
- **Threshold τ**: disabled for crisp sets.
- **⇄ Flip**: turns the chart so each combination is a row, with the sets across the top (names slanted at 45°), the
  bars growing sideways and the attributes as columns on the right. Press it again to go back.
- **Display options** (popover; a dot marks settings that differ from the defaults):
  - **Sort by**: fuzzy size (default) or number of observations;
  - **Draw individually**: the largest columns (in the sort order) are drawn one by one until they hold 60 %, 80 %
    (default), 90 % or all of the observations in some set; the others are summarised (see *Summaries* below);
  - **Min observations to draw a column**: smaller columns go to the summaries instead (default 2);
  - **Attributes**: median (default) or mean;
  - **Near a set from**: ⅓ τ, ½ τ (default) or ¾ τ;
  - **Mark near sets from**: 10 %, 20 % (default) or 33 % of a column near a set, or none;
  - **single-set columns**: on by default; switch it off to keep only combinations.

At most 50 columns are drawn individually; the summary line says "showing x of y columns (z % of the observations
in them) + r in k summaries" and how many observations are in no set. Drawn columns and summaries together hold every
observation in some set (except single-set columns, when they are switched off).

### The chart, top to bottom

**Bars.** The solid bar is the column's **fuzzy size**. The outline bar behind it is its **number of
observations**. Both share one axis, so the gap shows how weakly the observations belong. The tooltip also gives how
many are pure and how many borderline. With a selection, a thin red bar inside shows how many selected observations
the column holds.

**Set bars.** Left of each set's name, two bars use the same encoding for the set as a whole. The **outline** is how
many observations reach τ in the set, in *any* column that holds it (so "Comedy" here counts Comedy-only and Comedy &
Romance movies alike, unlike the Comedy column). The **solid** bar is the sum of those observations' memberships in
the set, never less than τ times their number. The set bars have their own scale (the largest set fills the
strip). Hover for exact values and the mean membership. Flipped, they stand above the set names.

**Sub-columns.** A column with borderline observations has a **▸** under its bar; click it to
split the column into sub-columns, drawn right after it on a tinted background: the pure observations, then one
sub-column per set (or pair of sets) they are near, largest first, then **mixed** (near 3 or more other sets, marked
◇) and **other** (patterns of a single observation, marked …). The sub-columns add up to the column. One column is
split at a time; **▾** folds it. A sub-column can be clicked and selected like a column.

**Summaries.** After a gap and a thin divider come the **summary columns**: the columns not drawn individually,
pooled by their number of sets (1-set, 2-set, 3-set and 4+-set combinations, on a grey background). Their bars are the
pooled fuzzy size and number of observations. The axis fits the individual columns, so a taller summary bar is cut
by two white slashes, with its number printed on top. In the dot matrix, each set is a **partially filled disc**: it
fills from the bottom with the share of the summary's observations whose column contains the set (half full = half
of them). There is no joining line and no near rings. Composition and attributes are drawn as for any column. A
summary can be clicked and selected; **▸** under its bar lists its columns (the 30 largest) right after it, each
selectable like a column; **▾** folds them. The tooltip lists its three largest columns.

**Dot matrix.** There is one row per set, with its colour swatch. Every slot is a disc of the same size. A black
disc means the set is in the column; the discs of a column are joined by a line. Grey discs are sets outside the
column. A darker grey **ring** replaces the grey disc when at least 20 % (Display options: 10 %, 33 %) of
the column's observations are near that set; a single observation near a set therefore draws nothing in a large
column. Every ring has the same size as the other discs; only its white hole changes. The hole shows the column's mean
membership in that set on a scale from 0 to τ: the lower the mean, the larger the hole (a thin ring), and as the mean
approaches τ the hole shrinks to a small dot (an almost solid ring). The line joining a column's sets passes over the plain grey discs and behind the rings.
The tooltip gives the count ("6 of 30 near Horror") and the column's mean
membership.

**Composition** (one row per category, "by decade"). This is a stacked bar of the share of the column's
observations in each category. Hue is reserved for the sets, so each composition row uses tints of one colour
family (navy, green, amber-brown, slate grey), each category with its own texture; categories past the 8th are
grey. Add rows from the **composition tray** under the chart (click, or drag onto the tray or the chart; up to 4
rows). Drag chips to reorder them; ✕ removes one.

**Numerical attributes** (heatmap). There is one row per attribute and one cell per column, holding the column's
median (or mean). The number is printed in short form (`3.6`, `50`, `.95`, `9.7k`, `'97`). The colour uses the
attribute's own scale, from the 5th to the 95th percentile of all observations and clamped outside, in reversed
viridis (light = low, dark = high). Log attributes (such as the number of ratings) use the median of log10
values.

### Interaction

- **Click a column** (or sub-column) to select its observations and highlight them on the map; click again to
  clear. A selected column follows τ: its observations are the ones in that column at the current τ.
- **Hover** anything for exact values. Column tooltips list the mean membership in each of the column's sets, the
  top categories of each composition row and three typical observations (the highest strength).
- **Esc** or **✕ Clear selection** removes the selection. Esc first closes the Display options or the large view.

## 4. The map

The map is one 2D layout of the observations. The dataset ships it (MovieLens: PCA of the z-scored Tag Genome
vectors; UpSet movies: PCA of the z-scored genres, year, rating and log watches). A dataset without a map gets the
PCA of its memberships. The map only shows *where* observations lie; it plays no part in the sets.

- **Colour by** the observation's strongest set, or by any category; a legend lists the colours.
- With a selection, the selected points are drawn on top with an ink outline, and the others fade but keep their
  colour.
- **Drag** a rectangle to select the points inside it; **Shift**-drag adds to the selection. The UpSet then shows
  how the selection spreads over its columns, and the columns and sets without any selected observations fade.
- **Click** a point to mark it: its column gets a navy triangle in the UpSet, and the summary line names it.

## 5. Membership (right panel)

This view is inspired by the admixture (STRUCTURE) plots of population genetics. There is one row per column, in
the UpSet's order. Columns not in the UpSet view are pooled into "other columns", and observations in no set get
their own row.

- **Summary bar**: the column's mean memberships, normalised to sum 1, in the set colours with the most common
  set first. The **grey bar** on the right is the share of membership outside the column's sets.
- **Click the name** to expand the column into one thin bar per observation, sorted from the most mixed to the
  purest. Hover a bar for the observation's memberships; click it to mark the observation.

## 6. τ barcode (right panel)

This view follows persistence barcodes in topological data analysis and α-cuts of fuzzy sets. The x axis is τ (19
values from 0.05 to 0.95), with one **row per combination**, longest-lived first (40 shown, 80 in the large view).
A **band** is drawn wherever the combination exists at that τ, and its **thickness** is ∝ the number of
observations with exactly that combination.

- A long, even band means the combination exists for any reasonable τ. A short band means it depends on τ.
- Crisp sets do not depend on τ, so every band runs the full width.
- A navy line marks the current τ. **Click the track** to set τ; **click a name** to select that column. A marked
  observation leaves a trail of navy dots (its combination at each τ).

## 7. Colours

- **Sets** take a categorical palette in fixed order: #4A57B0, #E0A030, #2F8A68, #C0603A, #7FB0F0, #E08DAE,
  #823953, #A264B0; past the 8th, grey #9A9A9A.
- **Navy** (#282C5F) is the interface accent: bars, the selected tab, focus, and the marked observation.
- **Red** (#E4002B) marks the linked selection, unlike every data colour.
- **Composition** uses tints and textures of one family per row, and **attributes** use reversed viridis.

## 8. Caveats

- **τ is a choice.** Columns appear and disappear with τ; the barcode shows how much.
- **Genome genres are not curated genres.** The Tag Genome scores how strongly users associate a tag with a
  movie (Star Wars scores War 0.88).
- **Small columns.** Columns with few observations give noisy attribute values; check the count in the tooltip.
- **The map is one projection.** Distances on a 2D map are approximate; use it to locate a selection, not to
  measure it.

## 9. The mathematics

This section states, in standard fuzzy-set terms, what the app computes. Notation: *X* is the set of observations,
*A₁ … A_L* the fuzzy sets with membership functions μₗ : X → [0, 1]. The memberships are independent: nothing
requires Σₗ μₗ(x) = 1. (The MovieLens sums range from about 1.4 to 8.3.)

**α-cuts.** For the threshold τ, the (weak) α-cut of a set is the crisp set

    Aₗ^τ = { x ∈ X : μₗ(x) ≥ τ }

and the **signature** of an observation is the list of cuts it falls into, σ_τ(x) = { l : μₗ(x) ≥ τ }.

**Columns are exclusive intersections of α-cuts.** For a combination S of sets, the column is

    R_S^τ = ( ⋂_{l∈S} Aₗ^τ ) ∖ ( ⋃_{l∉S} Aₗ^τ ) = { x : σ_τ(x) = S }

a crisp, exclusive region, as in a Venn diagram. The columns partition the observations, together with those in no set
(σ = ∅). With the standard fuzzy intersection and union, μ_{A∩B} = min(μ_A, μ_B) and μ_{A∪B} = max(μ_A, μ_B),
α-cuts commute with both: (A ∩ B)^τ = A^τ ∩ B^τ and (A ∪ B)^τ = A^τ ∪ B^τ. Hence

    R_S^τ = ( ⋂_{l∈S} Aₗ )^τ ∖ ( ⋃_{l∉S} Aₗ )^τ

A column is the α-cut of the fuzzy intersection of its sets, minus the α-cut of the fuzzy union of all the others.
This holds for min and max only: with the product t-norm, (A · B)^τ ≠ A^τ ∩ B^τ in general, which is why the app uses
min.

**Strength, count and fuzzy size (column bars).** An observation's strength is its membership in the fuzzy intersection
of its column's sets:

    s_S(x) = min_{l∈S} μₗ(x) = μ_{⋂_{l∈S} Aₗ}(x)

The outline bar is the count n_S = |R_S^τ|. The solid bar is a **sigma-count** (the scalar cardinality Σₓ μ(x) of a
fuzzy set), taken over the column's observations only:

    F_S = Σ_{x ∈ R_S^τ} μ_{⋂_{l∈S} Aₗ}(x),   with   τ · n_S ≤ F_S ≤ n_S

because every strength in the column is at least τ.

**Set bars.** For each set, the outline is the size of its α-cut, nₗ = |Aₗ^τ|. The solid bar is the sigma-count over
that cut, Fₗ = Σ_{x ∈ Aₗ^τ} μₗ(x), with τ · nₗ ≤ Fₗ ≤ nₗ. The cut includes every column that holds the set, so
nₗ = Σ_{S ∋ l} n_S.

**Near: a band between two α-cuts.** With the near factor β (½ by default; ⅓ or ¾ in Display options),

    Nₗ = Aₗ^{βτ} ∖ Aₗ^τ = { x : βτ ≤ μₗ(x) < τ }

Every membership is thus **in** (≥ τ), **near** (in [βτ, τ)) or **out** (< βτ). This three-way split resembles
Pedrycz's shadowed sets, which turn a fuzzy set into {0, shadow, 1}; "near" is the shadow. An observation's near
pattern is { l ∉ σ_τ(x) : x ∈ Nₗ }, and the sub-columns group a column by it.

**Rings.** For a column S and a set l outside it, the dot matrix uses the share of the column in the band,
ρ = |R_S^τ ∩ Nₗ| / n_S (a ring appears when ρ reaches the "mark near sets" level), and the column's mean membership,
m = (1 / n_S) Σ_{x ∈ R_S^τ} μₗ(x), which sets the size of the ring's hole on 0 → τ.

**Barcode.** It plots n_S(τ) = |R_S^τ| over a grid of τ. This follows the decomposition (resolution) theorem: a fuzzy
set is described by the family of its α-cuts, A = ⋃_α α · A^α. The barcode shows that family for every combination.

**Summaries.** A summary column of degree d pools the columns with |S| = d (or ≥ 4) that are not drawn individually:
its count and fuzzy size are the sums of theirs. A set's partial disc shows Σ_{S ∋ l} n_S / Σ_S n_S over the pooled
columns.

**What the app does not compute.** A fully fuzzy version of a column would itself be a fuzzy set, using the fuzzy
complement 1 − μ:

    μ_{R_S}(x) = min( min_{l∈S} μₗ(x), min_{l∉S} (1 − μₗ(x)) )

Each observation would then belong partly to several columns. Take an observation with Comedy 0.9 and Romance 0.49 at
τ = 0.5:

| | The app | Fully fuzzy |
|---|---|---|
| Comedy only | the observation, strength 0.9 | min(0.9, 1 − 0.49) = 0.51 |
| Comedy & Romance | nothing | min(0.9, 0.49) = 0.49 |

The app keeps each observation in exactly one column, so columns can be counted, selected and linked to the map. It
records the 0.49 as **near Romance**, shown by the ring and the sub-column. The near encoding carries the information
the complement term would have carried. Fuzzy unions, other t-norms (product, Łukasiewicz) and the fully fuzzy regions
are not computed.

