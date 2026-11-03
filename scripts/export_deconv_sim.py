"""Simulated spatial cell-type deconvolution → fz-1 export (public/data/deconv_sim/).

A small synthetic tissue section: a 20 × 20 grid of spots (Visium-like hexagonal offset), each holding a few cells.
Every spot gets cell-type proportions, as a deconvolution method (RCTD, cell2location, ...) would estimate them;
the proportions are the memberships, so a spot belongs to every cell type whose proportion reaches τ.

Planted structure: a tumour core, a fibroblast-rich stroma around it, an immune niche (T cells + macrophages) at
the tumour border, and two blood vessels (endothelial cells). Proportions are Dirichlet draws around the planted
mixture of each spot, so spots near region borders are mixed and borderline.

  conda run -n multiverse python scripts/export_deconv_sim.py [--seed 0]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
TYPES = ["Tumor", "Fibroblast", "T cell", "Macrophage", "Endothelial"]
REGIONS = ["tumour core", "tumour border", "immune niche", "stroma", "vessel"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=str(ROOT / "public" / "data" / "deconv_sim"))
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)

    G = 20
    r, c = np.divmod(np.arange(G * G), G)
    xy = np.c_[c + 0.5 * (r % 2), r * np.sqrt(3) / 2]  # hexagonal offset, like Visium
    ctr = xy.mean(0)

    # planted abundance fields (unnormalised), smooth in space
    d_tumour = np.linalg.norm((xy - ctr) * [1, 1.2], axis=1)
    tumour = 1 / (1 + np.exp((d_tumour - 6) / 0.9))
    niche_c = ctr + [5.5, -3]
    immune = np.exp(-np.sum((xy - niche_c) ** 2, 1) / (2 * 2.2**2))
    vessels = sum(np.exp(-((xy[:, 0] - x0) ** 2) / (2 * 0.6**2)) for x0 in (3.5, 16.5)) * 0.9
    W = np.c_[
        4 * tumour,
        2.5 * (1 - tumour) * (1 - 0.7 * immune) + 0.3,
        4.0 * immune + 0.05,
        3.2 * immune + 0.25 * (1 - tumour) + 0.05,
        1.5 * vessels + 0.05,
    ]
    mix = W / W.sum(1, keepdims=True)
    P = np.array([rng.dirichlet(25 * m + 0.05) for m in mix])  # estimated proportions, noisy around the planted mix
    P = np.round(P, 3)
    P /= P.sum(1, keepdims=True)
    P = np.clip(P, 0, 1).astype(np.float32)

    region = np.select(
        [vessels > 0.5, immune > 0.45, tumour > 0.85, tumour > 0.3],
        [4, 2, 0, 1],
        default=3,
    )
    n_cells = np.clip(rng.poisson(4 + 4 * tumour), 1, None)  # tumour spots are denser
    total = write_fz(
        Path(a.out),
        title="Spatial deconvolution (simulated)",
        source="Simulated: 20 × 20 Visium-like spots with planted tissue regions (scripts/export_deconv_sim.py)",
        attribution="Synthetic data.",
        notes="Each spot's membership in a cell type is its estimated proportion of that type (they sum to 1 per spot, "
              "so a spot reaches τ in at most 1/τ types). Planted: a tumour core, stroma around it, an immune niche "
              "at the tumour border and two vessels.",
        obs_ids=[f"spot{i:03d}" for i in range(G * G)],
        obs_names=[f"spot ({ri}, {ci})" for ri, ci in zip(r, c)],
        obs_word="spots",
        sets_title="cell types",
        set_names=TYPES,
        membership=P,
        kind="graded",
        categories={"region": {"title": "planted region", "names": REGIONS, "codes": region.astype(int).tolist()}},
        numeric=[{"key": "n_cells", "title": "cells in spot", "unit": "", "digits": 0, "values": n_cells.astype(int).tolist()}],
        map_xy=xy * [1, -1],  # row 0 at the top, as in an image of the section
        map_name="tissue",
        map_description="spot positions on the tissue section",
    )
    print(f"deconv_sim: {G * G} spots × {len(TYPES)} cell types, {total / 1e3:.0f} kB → {a.out}")


if __name__ == "__main__":
    main()
