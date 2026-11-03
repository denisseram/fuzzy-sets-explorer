"""UpSet "movies" example → fz-1 export (public/data/movies/).

The classic example dataset of UpSet (Lex et al. 2014): 3,883 movies of MovieLens 1M with 17 listed genres
(binary), release year, average rating and number of ratings ("Watches"), curated by Alsallakh. It is the table
shown at upset.multinet.app (workspace "Upset Examples", table "movies"); visdesignlab/upset2 ships the same rows.
Genres stay crisp: membership is 0 or 1, the limiting case of a fuzzy set, so the app's τ has no effect.

  conda run -n multiverse python scripts/export_movies.py [--raw data-raw/upset-movies/movies.csv]

Source (save into data-raw/upset-movies/, which is git-ignored):
  https://raw.githubusercontent.com/visdesignlab/upset/master/data/movies/movies.csv

The values are kept as in the source: Animation is not among the genres, 2 movies have no genre, and the 177
movies with no ratings carry a placeholder average rating of 3.5801.
Map: PCA (exact SVD) of the z-scored [17 genres, release year, average rating, log(1 + watches)]; the attributes
keep the 843 Drama-only movies from collapsing onto one point.

Writes public/data/movies/, which is committed. Data: MovieLens 1M (GroupLens; Harper & Konstan 2015), research
use with attribution.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/visdesignlab/upset/master/data/movies/movies.csv"
SHA256 = "9455a6ad150ac5ad532d982f94e5b688eb4956b58aaa69acca5c7094347f44ea"
GENRES = ["Action", "Adventure", "Children", "Comedy", "Crime", "Documentary", "Drama", "Fantasy", "Noir", "Horror",
          "Musical", "Mystery", "Romance", "SciFi", "Thriller", "War", "Western"]  # names as UpSet shows them


def log(msg: str, t0: float) -> None:
    print(f"[{time.perf_counter() - t0:6.1f}s] {msg}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "data-raw" / "upset-movies" / "movies.csv"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data" / "movies"))
    a = ap.parse_args()
    raw, out = Path(a.raw), Path(a.out)
    t0 = time.perf_counter()

    if not raw.exists():
        sys.exit(f"{raw} not found; download it from {URL}")
    if (h := hashlib.sha256(raw.read_bytes()).hexdigest()) != SHA256:
        sys.exit(f"{raw}: sha256 {h}, expected {SHA256} (the UpSet file from {URL})")
    df = pd.read_csv(raw, sep=";")
    assert list(df.columns) == ["Name", "ReleaseDate", *GENRES, "AvgRating", "Watches"], list(df.columns)
    N = len(df)
    log(f"{N} movies, {len(GENRES)} genres", t0)

    # ---- sets: crisp genre membership, most common first (they get the palette's colors) ----------------------
    B = df[GENRES].to_numpy(np.float32)
    order = np.argsort(-B.sum(0), kind="stable")
    gnames = [GENRES[o] for o in order]
    M = B[:, order]
    year = df.ReleaseDate.to_numpy()
    dec_names = ["before 1970", "1970s", "1980s", "1990s", "2000"]  # the movielens bins; the data end in 2000
    dec = np.clip((year - 1960) // 10, 0, 4)

    # ---- the map ---------------------------------------------------------------------------------------------
    X = np.column_stack([M, year, df.AvgRating, np.log1p(df.Watches)]).astype(np.float64)
    X = (X - X.mean(0)) / X.std(0)
    P = PCA(2, svd_solver="full").fit_transform(X)
    log("PCA", t0)

    total = write_fz(
        out,
        title="UpSet movies (genres)",
        source="UpSet movies example (visdesignlab/upset; Lex et al. 2014), from MovieLens 1M (GroupLens; Harper & Konstan 2015)",
        attribution="MovieLens 1M, GroupLens Research (Harper & Konstan 2015), via the UpSet example data (Lex et al. 2014). Research use with attribution.",
        notes="Genres are listed, not scored (membership 0 or 1), so τ has no effect. Animation is not among them and "
              "2 movies have none. Movies never rated show the source's placeholder average rating (3.58).",
        obs_ids=[str(i) for i in range(N)],
        obs_word="movies",
        obs_names=df.Name.tolist(),
        sets_title="genres",
        set_names=gnames,
        membership=M,
        kind="crisp",
        categories={"decade": {"title": "decade", "names": dec_names, "codes": dec.astype(int).tolist()}},
        numeric=[
            {"key": "avg_rating", "title": "average rating", "unit": "★", "digits": 2, "values": df.AvgRating.round(4).tolist()},
            {"key": "watches", "title": "times watched", "unit": "", "digits": 0, "log": True, "values": df.Watches.astype(int).tolist()},
            {"key": "year", "title": "release year", "unit": "", "digits": 0, "plot": "density", "values": year.astype(int).tolist()},
        ],
        map_xy=P,
        map_name="PCA · genres + attributes",
        map_description="PCA of the z-scored genres, release year, average rating and log watches.",
    )
    log(f"exported {N} movies to {out} ({total / 1e6:.1f} MB)", t0)


if __name__ == "__main__":
    main()
