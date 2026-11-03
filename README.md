# Fuzzy Sets Explorer

An interactive view of **fuzzy set data**: observations that belong to several sets at once, each with a membership
between 0 and 1. For example, a movie that is 0.9 Comedy, 0.6 Romance and 0.1 Drama. The main view is a **fuzzy
UpSet plot**, linked to a 2D map of the observations, a membership strip and a τ barcode.

The site is static (Astro + React + d3). Everything is computed in the browser from three small files per dataset.

## The views

- **Fuzzy UpSet**: an observation belongs to every set whose membership reaches the threshold **τ**, and each
  combination of sets is one column. The solid bar is the column's *fuzzy size* (the sum of each observation's
  weakest qualifying membership); the outline bar is its number of observations. A membership from the near level
  (τ/2) up to τ counts as *near*; ▸ splits a column into sub-columns by what its observations are near. Below the bars:
  - the dot matrix, with a coloured ring where at least 20 % of the column is near a set;
  - the composition by other variables (decade, …);
  - a heatmap of numerical attributes (median or mean per column).
- **Map**: one 2D layout of the observations. It shows where a selected column lies; drag a rectangle to select
  points, or click one to mark its column.
- **Membership**: per column, its observations' mean memberships, including the share outside the column.
  Expand a column to see one bar per observation.
- **τ barcode**: for every combination, the range of τ over which it exists. Long bands are robust to τ.

Selections are linked: a column, a map selection or a marked observation shows up in every view.
[docs/guide.md](docs/guide.md) explains every encoding.

## Datasets

| key | observations | sets | kind |
|---|---|---|---|
| `movielens` | the 1,500 most-rated movies of MovieLens 32M | 18 genres, scored by the Tag Genome 2021 (0–1) | graded |
| `movies` | 3,883 movies of MovieLens 1M (the UpSet example dataset) | 17 listed genres (0 or 1) | crisp |

Pick one with the dataset button, or open `?dataset=<key>`.

## Data format (`fz-1`)

A dataset is a folder `public/data/<key>/` with three files:

| file | content |
|---|---|
| `meta.json` | title, source, attribution, notes, `n`, `obs_ids`, optional `obs_names`, `obs_word` (e.g. "movies"), `sets` (title, names, kind `graded` or `crisp`), `categories` (crisp variables: title, names, one code per observation), `numeric_attributes` (key, title, unit, digits, optional `log`, values), and optionally `map` (name, description) |
| `membership.bin` | float32 little-endian, N × L, row-major: the membership of observation *i* in set *l*, 0–1 |
| `map.bin` | float32 little-endian, N × 2: one 2D map, in the unit square (optional: without it the map is the PCA of the memberships) |

`scripts/fz.py` writes and validates this format (`write_fz`); `src/lib/loadFz.ts` reads it. The same three files
are what a future "load your own dataset" option would produce from a CSV: an id column, one 0–1 column per set,
and optional category, numeric and x, y columns.

### Adding a dataset

1. Write an export script that calls `write_fz(...)` (see `scripts/export_movies.py` for a short example).
2. Add `{ key, label }` to `DATASETS` in `src/components/App.tsx`.

## Development

```sh
npm install
npm run dev        # http://localhost:4321
npm test           # unit tests (vitest)
npm run build      # static site in dist/
```

Re-creating the exports needs the raw data in `data-raw/` (git-ignored) and Python with numpy, pandas and
scikit-learn:

```sh
cd scripts
python export_movielens.py   # data-raw/ml-32m/, data-raw/tag-genome-2021/
python export_movies.py      # data-raw/upset-movies/movies.csv
```

The GitHub Pages workflow (`.github/workflows/deploy.yml`) tests, builds and deploys every push to `main` under
`/fuzzy-sets-explorer/`. The pages ask search engines not to index them (`robots.txt`, `noindex`).

## License

The code is released under the [MIT License](LICENSE).

The MovieLens data are **not** covered by the MIT License. The export in `public/data/movielens/` is derived from:

- MovieLens ml-32m, GroupLens Research (F. M. Harper and J. A. Konstan, "The MovieLens Datasets: History and
  Context", ACM TiiS 5(4), 2015);
- Tag Genome 2021 (Kotkov et al. 2021), CC BY-NC 3.0.

They may be used for non-commercial research only. The export in `public/data/movies/` is the UpSet movies example
(visdesignlab/upset; Lex et al. 2014), from MovieLens 1M (GroupLens; Harper & Konstan 2015), used for research with
attribution.
