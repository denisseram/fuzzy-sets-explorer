"""Labels mixed in one embedding's kNN graph → fz-1 exports (public/data/iris/, public/data/integration/).

The fuzzy sets are the labels; an observation's membership in a label is the fraction of its neighbourhood (its k
nearest neighbours in the embedding, plus itself) that carries that label (the memberships of the comparative fuzzy
UpSet in embedding_comparisons_scAtlas/multiverse-pipeline/pipeline/fuzzy_upset.py, for a single embedding). A point
deep inside its own class has membership 1 in it; a point where classes mix belongs to several at once.

  conda run -n multiverse python scripts/export_knn_labels.py [--integration <embedding-comparison>/public/data/integration]

iris         Fisher's Iris (scikit-learn). Embedding: PCA (2) of the z-scored features, k = 10; the map is the same PCA.
integration  The multiverse-pipeline toy atlas (synthetic, 1499-cell subsample) as exported to the embedding-comparison
             app (ec-1). Embedding: its reference model (combat_pca, sample batch key), k = 15; the map is that
             model's UMAP. Sets: cell types.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.datasets import load_iris
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from fz import write_fz

ROOT = Path(__file__).resolve().parent.parent
EC_DATA = Path.home() / "Documents/embedding_comparisons_scAtlas/embedding-comparison/public/data/integration"


def neighbourhood_membership(knn: np.ndarray, codes: np.ndarray, n_labels: int) -> np.ndarray:
    """knn [N, k] (self excluded) → [N, n_labels]: share of each label among the k neighbours plus the point itself."""
    N, k = knn.shape
    M = np.zeros((N, n_labels), np.float64)
    np.add.at(M, (np.repeat(np.arange(N), k), codes[knn.ravel()]), 1)
    M[np.arange(N), codes] += 1
    return (M / (k + 1)).astype(np.float32)


def export_iris(out: Path, k: int = 10) -> None:
    d = load_iris()
    X, y = d.data, d.target
    species = [str(s) for s in d.target_names]
    Z = PCA(2, random_state=0).fit_transform(StandardScaler().fit_transform(X))
    knn = NearestNeighbors(n_neighbors=k + 1).fit(Z).kneighbors(Z, return_distance=False)
    knn = np.array([[j for j in row if j != i][:k] for i, row in enumerate(knn)])  # drop self (duplicates exist)
    M = neighbourhood_membership(knn, y, len(species))
    feats = [("sepal_length", "sepal length"), ("sepal_width", "sepal width"),
             ("petal_length", "petal length"), ("petal_width", "petal width")]
    total = write_fz(
        out,
        title="Iris (kNN species mix)",
        source="Fisher's Iris data (Fisher 1936; UCI), via scikit-learn",
        attribution="R. A. Fisher (1936), Iris data set, UCI Machine Learning Repository (CC BY 4.0).",
        notes=f"A flower's membership in a species is the share of that species among its {k} nearest neighbours "
              f"(plus itself) in a PCA (2) of the z-scored measurements.",
        obs_ids=[f"iris{i:03d}" for i in range(len(y))],
        obs_names=None,
        obs_word="flowers",
        sets_title="species (kNN)",
        set_names=species,
        membership=M,
        kind="graded",
        categories={"species": {"title": "species", "names": species, "codes": y.astype(int).tolist()}},
        numeric=[{"key": key, "title": title, "unit": "cm", "digits": 1, "values": X[:, c].round(2).tolist()}
                 for c, (key, title) in enumerate(feats)],
        map_xy=Z,
        map_name="PCA",
        map_description="PCA (2) of the z-scored measurements: the embedding the neighbourhoods are taken in",
    )
    print(f"iris: {len(y)} flowers × {len(species)} species, {total / 1e3:.0f} kB → {out}")


def export_integration(src: Path, out: Path, k: int = 15) -> None:
    meta = json.loads((src / "meta.json").read_text())
    N, embs, files = meta["n"], meta["embeddings"], meta["files"]
    e = next(i for i, m in enumerate(embs) if m["model_id"] == meta["reference_model"])
    E, _, kmax = files["knn.bin"]["shape"]
    assert k <= kmax
    knn = np.fromfile(src / "knn.bin", "<u2").reshape(E, N, kmax)[e, :, :k].astype(np.int64)
    xy = np.fromfile(src / "layouts.bin", "<f4").reshape(E, N, 2)[e]
    cats = meta["categories"]
    ct = cats["cell_type"]
    codes = np.asarray(ct["codes"])
    assert (codes >= 0).all(), "unlabelled cells"
    M = neighbourhood_membership(knn, codes, len(ct["names"]))
    titles = {"cell_type": "cell type", "planted_effect": "planted effect"}
    total = write_fz(
        out,
        title="Integration (kNN cell-type mix)",
        source=f"{meta['source']}; embedding {embs[e]['name']}",
        attribution="Synthetic data, multiverse-pipeline toy atlas.",
        notes=f"A cell's membership in a cell type is the share of that type among its {k} nearest neighbours (plus "
              f"itself) in the latent space of one integration ({embs[e]['name']}), on a {N}-cell subsample.",
        obs_ids=meta["cell_ids"],
        obs_names=None,
        obs_word="cells",
        sets_title="cell types (kNN)",
        set_names=ct["names"],
        membership=M,
        kind="graded",
        categories={key: {"title": titles.get(key, key), "names": c["names"], "codes": c["codes"]} for key, c in cats.items()},
        numeric=[],
        map_xy=xy,
        map_name="UMAP",
        map_description=f"UMAP of the integrated latent space ({embs[e]['name']})",
    )
    print(f"integration: {N} cells × {len(ct['names'])} cell types, {total / 1e3:.0f} kB → {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--integration", default=str(EC_DATA))
    a = ap.parse_args()
    export_iris(ROOT / "public" / "data" / "iris")
    export_integration(Path(a.integration), ROOT / "public" / "data" / "integration")


if __name__ == "__main__":
    main()
