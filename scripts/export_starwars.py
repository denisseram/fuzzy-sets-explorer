"""Star Wars characters × films → three fz-1 exports (public/data/starwars8/, starwars43/, starwars_all/).

Source: Gabasova (2016), Star Wars social network 1.0.1, "mentions" variant (doi:10.5281/zenodo.1411479), as packaged in
data-raw/fuzzy_sets_datasets_complete/starwars/ (see its README.md and metadata.json).

Membership(character, film) = scene count / largest scene count of any character in that film. Rows need not sum to 1.

  starwars8     8 named characters × Episodes IV–VI  (starwars_8characters_3films.csv)
  starwars43    all 43 characters  × Episodes IV–VI  (starwars_43characters_3films.csv)
  starwars_all  all 113 characters × Episodes I–VII  (derived here from source_charactersPerScene.csv)

The two CSVs are recomputed from starwars_scene_counts_corrected.csv and checked against the given values. For
starwars_all, the timeline holds one position per character and scene; film k (0 = Episode I) covers positions [k, k+1).
This rule reproduces the corrected IV–VI counts of all 43 characters exactly, which the script asserts.

  python scripts/export_starwars.py [--raw data-raw/fuzzy_sets_datasets_complete/starwars]

Map: PCA (SVD of the centred memberships). Writes public/data/starwars*/, which are committed.
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
FILMS = [
    ("I", "The Phantom Menace"),
    ("II", "Attack of the Clones"),
    ("III", "Revenge of the Sith"),
    ("IV", "A New Hope"),
    ("V", "The Empire Strikes Back"),
    ("VI", "Return of the Jedi"),
    ("VII", "The Force Awakens"),
]
ORIGINAL = [3, 4, 5]  # Episodes IV–VI
ATTRIBUTION = ("Evelina Gabasova (2016), Star Wars social network, version 1.0.1, doi:10.5281/zenodo.1411479 "
               "(github.com/evelinag/star-wars-network-data).")
CAVEAT = ("Counts come from screenplay scene mentions, not screen time: a mention can refer to an off-screen character, "
          "and a zero means no recorded mention in that film.")


def read_table(path: Path) -> tuple[list[str], list[str], np.ndarray]:
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    names = [r[0] for r in rows[1:]]
    assert len(set(names)) == len(names), f"{path.name}: names must be unique"
    return rows[0][1:], names, np.array([[float(v) for v in r[1:]] for r in rows[1:]])


def export(out: Path, *, title: str, names: list[str], counts: np.ndarray, denom: np.ndarray, films: list[int],
           notes: str) -> None:
    M = (counts / denom).astype(np.float32)
    X = M.astype(np.float64) - M.mean(0)
    U, S, _ = np.linalg.svd(X, full_matrices=False)
    P = U[:, :2] * S[:2]
    total = write_fz(
        out,
        title=title,
        source="Star Wars social network 1.0.1, mentions variant (Gabasova 2016)",
        attribution=ATTRIBUTION,
        notes=notes + " " + CAVEAT,
        obs_ids=names,
        obs_names=names,
        obs_word="characters",
        sets_title="films",
        set_names=[f"Episode {FILMS[k][0]}" for k in films],
        membership=M,
        kind="graded",
        categories={},
        numeric=[
            {"key": "scenes", "title": "scenes (all films shown)", "unit": "", "digits": 0,
             "values": counts.sum(1).astype(int).tolist()},
            {"key": "n_films", "title": "number of films", "unit": "", "digits": 0,
             "values": (counts > 0).sum(1).astype(int).tolist()},
        ],
        map_xy=P,
        map_name="PCA · films",
        map_description="PCA of the film memberships.",
    )
    print(f"{out.name}: {len(names)} characters × {len(films)} films, {total / 1e3:.0f} kB → {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "data-raw" / "fuzzy_sets_datasets_complete" / "starwars"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data"))
    a = ap.parse_args()
    raw, out = Path(a.raw), Path(a.out)
    if not raw.exists():
        sys.exit(f"{raw} not found")

    # Episodes IV–VI: corrected scene counts; denominators are the per-film maxima over all 43 characters
    cols, chars43, C43 = read_table(raw / "starwars_scene_counts_corrected.csv")
    assert cols == ["Episode_IV", "Episode_V", "Episode_VI"], cols
    denom3 = C43.max(0)
    assert denom3.tolist() == [182, 82, 56], denom3
    for csv_name, n in [("starwars_43characters_3films.csv", 43), ("starwars_8characters_3films.csv", 8)]:
        _, names, given = read_table(raw / csv_name)
        assert len(names) == n, (csv_name, len(names))
        idx = [chars43.index(c) for c in names]
        assert np.allclose(C43[idx] / denom3, given, atol=1e-9), f"{csv_name} does not match counts / maxima"
    _, chars8, _ = read_table(raw / "starwars_8characters_3films.csv")
    idx8 = [chars43.index(c) for c in chars8]

    note3 = ("Membership in a film = the character's scene count / the largest scene count in that film "
             "(IV 182, V 82, VI 56, all from Luke).")
    export(out / "starwars8", title="Star Wars, 8 characters (IV–VI)", names=chars8, counts=C43[idx8], denom=denom3,
           films=ORIGINAL, notes="Eight named characters, chosen as an introductory example (not a sample). " + note3)
    export(out / "starwars43", title="Star Wars, 43 characters (IV–VI)", names=chars43, counts=C43, denom=denom3,
           films=ORIGINAL, notes="Every character with a recorded mention in Episodes IV, V or VI. " + note3)

    # Episodes I–VII from the scene timeline
    with (raw / "source_charactersPerScene.csv").open(newline="", encoding="utf-8") as f:
        timeline = [(r[0], [float(v) for v in r[1:] if v]) for r in csv.reader(f)]
    names_all = [c for c, _ in timeline]
    assert len(set(names_all)) == len(names_all)
    C = np.zeros((len(timeline), len(FILMS)))
    for i, (_, pos) in enumerate(timeline):
        for v in pos:
            C[i, math.floor(v)] += 1
    for i, c in enumerate(chars43):
        got = C[names_all.index(c), ORIGINAL]
        assert np.array_equal(got, C43[i]), (c, got, C43[i])
    denom = C.max(0)
    films_all = list(range(len(FILMS)))
    export(out / "starwars_all", title=f"Star Wars, {len(names_all)} characters (I–VII)", names=names_all, counts=C, denom=denom,
           films=films_all,
           notes="Every character in the source scene timeline (Episodes I–VII). Membership in a film = the "
                 "character's scene count / the largest scene count in that film ("
                 + ", ".join(f"{FILMS[k][0]} {int(denom[k])}" for k in films_all)
                 + "). Counts derived from the timeline: film k covers positions [k, k+1); this reproduces the "
                   "verified IV–VI counts exactly.")


if __name__ == "__main__":
    main()
