"""MovieLens (ml-32m + Tag Genome 2021) → fz-1 export (public/data/movielens/).

Observations are movies. Their genres are *fuzzy*: the tag genome gives every movie a relevance score (0–1) for
18 genre tags ("comedy", "romance", "sci-fi", ...), predicted from users' tags, ratings and reviews (Tag Genome 2021,
regression scores `scores/glmer.csv`, the method of the original MovieLens genome). These scores are the
memberships; the app assigns a genre when its score reaches a threshold τ, so a movie can be Comedy only,
Comedy & Romance, ...

  conda run -n multiverse python scripts/export_movielens.py [--raw data-raw/ml-32m] [--genome data-raw/tag-genome-2021] [--n 1500]

Sources (unzip into data-raw/, which is git-ignored):
  ml-32m           https://grouplens.org/datasets/movielens/32m/         movies.csv, ratings.csv
  Tag Genome 2021  https://grouplens.org/datasets/movielens/tag-genome-2021/   scores/glmer.csv
Movie ids are shared (ml-32m movieId == Tag Genome item_id).

Movies: the N most-rated movies that have tag-genome scores and at least one listed genre.
Map: PCA of the z-scored genome vectors (all tags).
Categories: the genre a movie scores highest on, and its decade.
Numerical attributes per movie (summarised per UpSet column): mean rating, share of ratings >= 4 stars, rating
spread (SD), number of ratings, release year.

Writes public/data/movielens/, which is committed. Both sources allow redistribution of transformations for
non-commercial research use, with attribution (ml-32m: GroupLens usage license; Tag Genome 2021: CC BY-NC 3.0).
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
GENRE_TAGS = {  # listed genre -> genome tag (IMAX has no genome tag)
    "Drama": "drama", "Comedy": "comedy", "Action": "action", "Thriller": "thriller", "Adventure": "adventure",
    "Romance": "romance", "Crime": "crime", "Sci-Fi": "sci-fi", "Fantasy": "fantasy", "Mystery": "mystery",
    "Children": "children", "Horror": "horror", "Animation": "animation", "War": "war", "Musical": "musical",
    "Western": "western", "Film-Noir": "film noir", "Documentary": "documentary",
}


def log(msg: str, t0: float) -> None:
    print(f"[{time.perf_counter() - t0:6.1f}s] {msg}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "data-raw" / "ml-32m"))
    ap.add_argument("--genome", default=str(ROOT / "data-raw" / "tag-genome-2021"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data" / "movielens"))
    ap.add_argument("--n", type=int, default=1500)
    a = ap.parse_args()
    raw, scores, out, N = Path(a.raw), Path(a.genome) / "scores" / "glmer.csv", Path(a.out), a.n
    t0 = time.perf_counter()

    # ---- movies with genome scores and genres; ratings (one chunked pass, compact dtypes) -----------------
    movies = pd.read_csv(raw / "movies.csv")
    genome_ids = np.unique(pd.read_csv(scores, usecols=["item_id"], dtype={"item_id": np.int32}).item_id.values)
    items, vals = [], []
    for ch in pd.read_csv(raw / "ratings.csv", usecols=["movieId", "rating"],
                          dtype={"movieId": np.int32, "rating": np.float32}, chunksize=2_000_000):
        items.append(ch.movieId.values); vals.append(ch.rating.values)
    m, r = np.concatenate(items), np.concatenate(vals)
    del items, vals
    log(f"{len(r):,} ratings, {len(genome_ids):,} movies in the genome", t0)

    cnt = pd.Series(np.bincount(m)).rename("n")
    cand = movies[(movies.genres != "(no genres listed)") & movies.movieId.isin(genome_ids)].copy()
    cand["n"] = cnt.reindex(cand.movieId).fillna(0).values
    sel = cand.sort_values(["n", "movieId"], ascending=[False, True]).head(N).sort_values("movieId").reset_index(drop=True)
    ids = sel.movieId.values
    N = len(ids)
    log(f"selected {N} movies ({int(sel.n.min())}–{int(sel.n.max())} ratings each)", t0)

    # ---- rating summaries per movie -------------------------------------------------------------------------
    pos = pd.Series(np.arange(N), index=ids)
    keep = np.isin(m, ids)
    mi, rk = pos.reindex(m[keep]).values, r[keep].astype(np.float64)
    del m, r, keep
    n_r = np.bincount(mi, minlength=N)
    mean_r = np.bincount(mi, weights=rk, minlength=N) / n_r
    sd_r = np.sqrt(np.maximum(np.bincount(mi, weights=rk ** 2, minlength=N) / n_r - mean_r ** 2, 0))
    hi_r = np.bincount(mi, weights=(rk >= 4).astype(float), minlength=N) / n_r
    del mi, rk

    # ---- tag genome: movies × tags relevance ---------------------------------------------------------------
    tags = pd.Series(sorted(pd.read_csv(scores, usecols=["tag"]).tag.unique()), name="tag")
    tcol = pd.Series(np.arange(len(tags)), index=tags.values)
    G = np.full((N, len(tags)), np.nan, np.float32)
    for ch in pd.read_csv(scores, dtype={"tag": str, "item_id": np.int32, "score": np.float32}, chunksize=2_000_000):
        ch = ch[ch.item_id.isin(ids)]
        G[pos.reindex(ch.item_id).values, tcol.reindex(ch.tag).values] = ch.score.values
    miss = np.isnan(G)  # the 2021 file lacks a few pairs (e.g. Toy Story × "airplane"): use the tag's median
    G[miss] = np.take(np.nanmedian(G, 0), np.nonzero(miss)[1])
    log(f"genome {G.shape}; filled {int(miss.sum())} missing movie-tag score(s) with the tag's median", t0)

    # ---- the map: PCA of the z-scored genome ------------------------------------------------------------------
    Gz = (G - G.mean(0)) / (G.std(0) + 1e-6)
    P = PCA(2, svd_solver="randomized", random_state=0).fit_transform(Gz)
    log("PCA", t0)

    # ---- sets: graded genre membership from the genome --------------------------------------------------------
    tid = {g: int(tcol[t]) for g, t in GENRE_TAGS.items()}
    M = np.clip(np.stack([G[:, c] for c in tid.values()], 1), 0, 1)
    order = np.argsort(-(M >= 0.5).sum(0), kind="stable")  # most common first (they get the palette's colors)
    gnames = [list(tid)[o] for o in order]
    M = np.round(M[:, order], 3)
    main = M.argmax(1)  # the genre the movie scores highest on
    year = sel.title.str.extract(r"\((\d{4})\)\s*$")[0].astype(float)
    dec_names = ["before 1970", "1970s", "1980s", "1990s", "2000s", "2010s"]
    dec = np.clip(((year.fillna(1990) - 1960) // 10).astype(int), 0, 5)

    total = write_fz(
        out,
        title="MovieLens (genres)",
        source="MovieLens ml-32m (GroupLens; Harper & Konstan 2015) and Tag Genome 2021 (Kotkov et al. 2021; CC BY-NC 3.0)",
        attribution="MovieLens ml-32m, GroupLens Research (Harper & Konstan 2015); Tag Genome 2021 (Kotkov et al. 2021), "
                    "CC BY-NC 3.0. Non-commercial research use.",
        notes=f"The {N} most-rated of {len(movies):,} movies. A movie's membership in a genre is the Tag Genome "
              f"relevance of that genre's tag (0–1); it belongs to every genre whose score reaches τ.",
        obs_ids=[str(x) for x in ids],
        obs_word="movies",
        obs_names=sel.title.tolist(),
        sets_title="genres",
        set_names=gnames,
        membership=M,
        kind="graded",
        categories={
            "main_genre": {"title": "main genre", "names": gnames, "codes": main.astype(int).tolist()},
            "decade": {"title": "decade", "names": dec_names, "codes": dec.astype(int).tolist()},
        },
        numeric=[
            {"key": "mean_rating", "title": "mean rating", "unit": "★", "digits": 2, "values": np.round(mean_r, 3).tolist()},
            {"key": "pct_high", "title": "rated ≥ 4★", "unit": "%", "digits": 0, "values": np.round(100 * hi_r, 1).tolist()},
            {"key": "rating_sd", "title": "rating spread (SD)", "unit": "★", "digits": 2, "values": np.round(sd_r, 3).tolist()},
            {"key": "n_ratings", "title": "number of ratings", "unit": "", "digits": 0, "log": True, "values": n_r.astype(int).tolist()},
            {"key": "year", "title": "release year", "unit": "", "digits": 0, "values": year.fillna(year.median()).astype(int).tolist()},
        ],
        map_xy=P,
        map_name="PCA · tag genome",
        map_description="PCA of the z-scored Tag Genome relevance vectors (all tags) of each movie.",
    )
    log(f"exported {N} movies to {out} ({total / 1e6:.1f} MB)", t0)


if __name__ == "__main__":
    main()
