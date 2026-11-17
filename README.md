# Fuzzy Sets Explorer

One UpSet plot for fuzzy sets. Rows are all combinations of up to 6 selected sets; membership distributions are drawn
inside the combination matrix. Live: https://denisseram.github.io/fuzzy-sets-explorer/

## The model

Each element $x$ has a membership $m(x, i) \in [0, 1]$ in each set $i$. Memberships are independent (no normalisation).
$K$ = the selected sets. At membership level $\alpha \in (0, 1]$, $x$ belongs crisply to $\{ i \in K : m(x, i) \ge \alpha \}$.
Both modes are the crisp UpSet integrated over $\alpha$.

**Inclusive intersections** (default). Sets outside $T$ are unrestricted:

$$\mathrm{inc}(x, T) = \min_{i \in T} m(x, i), \qquad \mathrm{incMass}(T) = \sum_x \mathrm{inc}(x, T)$$

**Additive contributions.** The length of the $\alpha$ range in which $x$'s crisp pattern is exactly $S$:

$$c(x, S) = \max\Big(0,\ \min_{i \in S} m(x, i) - \max_{j \in K \setminus S} m(x, j)\Big) \quad (\max \emptyset = 0)$$

Identities, per element and per mass:

$$\mathrm{inc}(x, T) = \sum_{S \supseteq T} c(x, S), \qquad \sum_S c(x, S) = \max_{i \in K} m(x, i)$$

**Contributors** of a row: elements with a value $> 0$ in it. Bars: outline = contributors, solid = membership mass,
on one axis (mass ≤ contributors).

**Threshold mode** (optional): $m'(x, i) = m(x, i)$ if $m(x, i) \ge \tau$, else $0$; everything above uses $m'$.
A **ring** marks a set outside a row when at least a share (20 % by default) of the row's contributors have
$\beta\tau \le m < \tau$ in it.

**Histograms** show the contributors' original memberships in each set of the row, in five bins of width 0.2.

See [docs/guide.md](docs/guide.md) for the full definitions and the correctness fixture.

## Run locally

```sh
npm ci
npm run dev          # http://localhost:4321/?dataset=fixture
npm test             # Vitest
npm run build
npx astro check
```

Calculations: [src/lib/fuzzyDecomposition.ts](src/lib/fuzzyDecomposition.ts) (pure, tested in
[src/lib/fuzzyDecomposition.test.ts](src/lib/fuzzyDecomposition.test.ts)).
