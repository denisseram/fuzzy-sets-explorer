"""Dota 2 hero roles → fz-1 export (public/data/dota2/).

127 heroes × 9 roles (Carry, Support, Nuker, Disabler, Jungler, Durable, Escape, Pusher, Initiator). Memberships are
taken as given in the CSV: each is 0, 1/3, 2/3 or 1.

  python scripts/export_dota2.py [--raw data-raw/dota2_roles_full.csv]

Source (data-raw/ is git-ignored): data-raw/dota2_roles_full.csv, columns name + the 9 roles.

Jungler is 0 for every hero in the file; it is kept so the role list matches the source.
Map: PCA (SVD of the centred memberships).

Writes public/data/dota2/, which is committed.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
ROLES = ["Carry", "Support", "Nuker", "Disabler", "Jungler", "Durable", "Escape", "Pusher", "Initiator"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "data-raw" / "dota2_roles_full.csv"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data" / "dota2"))
    a = ap.parse_args()
    raw, out = Path(a.raw), Path(a.out)
    if not raw.exists():
        sys.exit(f"{raw} not found")

    with raw.open(newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0] == ["name", *ROLES], rows[0]
    heroes = [r[0] for r in rows[1:]]
    assert len(set(heroes)) == len(heroes), "hero names must be unique"
    N = len(heroes)

    # sets: most total membership first (they get the palette's first colors)
    B = np.array([[float(v) for v in r[1:]] for r in rows[1:]])
    order = np.argsort(-B.sum(0), kind="stable")
    names = [ROLES[o] for o in order]
    M = B[:, order].astype(np.float32)

    X = M.astype(np.float64) - M.mean(0)
    U, S, _ = np.linalg.svd(X, full_matrices=False)
    P = U[:, :2] * S[:2]
    n_roles = (M > 0).sum(1)

    total = write_fz(
        out,
        title="Dota 2 hero roles",
        source="dota2_roles_full.csv (data-raw/)",
        attribution="",
        notes="Memberships as given in the source: 0, 1/3, 2/3 or 1 per hero and role. Jungler is 0 for every hero.",
        obs_ids=heroes,
        obs_names=heroes,
        obs_word="heroes",
        sets_title="roles",
        set_names=names,
        membership=M,
        kind="graded",
        categories={},
        numeric=[{"key": "n_roles", "title": "number of roles", "unit": "", "digits": 0, "values": n_roles.astype(int).tolist()}],
        map_xy=P,
        map_name="PCA · roles",
        map_description="PCA of the role memberships.",
    )
    print(f"dota2: {N} heroes × {len(names)} roles, {total / 1e3:.0f} kB → {out}")


if __name__ == "__main__":
    main()
