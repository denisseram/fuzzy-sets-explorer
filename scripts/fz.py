"""Writer for the fz-1 dataset format read by the app (src/lib/loadFz.ts).

public/data/<id>/
  meta.json        what the observations, sets, categories and attributes are (see write_fz below)
  membership.bin   float32 little-endian, N × L: membership of each observation in each set, 0–1
  map.bin          float32 little-endian, N × 2: one 2D map of the observations, unit square

A dataset is fully described by these three files, so any source (an export script, or later a CSV the user
loads in the browser) only has to produce them.
"""
from __future__ import annotations

import datetime as dt
import json
import shutil
from pathlib import Path

import numpy as np

SCHEMA = "fz-1.0.0"


def unit_square(P: np.ndarray) -> np.ndarray:
    P = P - P.min(0)
    return (P / max(P.max(), 1e-12)).astype(np.float32)


def write_fz(
    out: Path, *, title: str, source: str, attribution: str, obs_ids: list[str], obs_names: list[str] | None, obs_word: str,
    sets_title: str, set_names: list[str], membership: np.ndarray, kind: str,
    categories: dict[str, dict], numeric: list[dict], map_xy: np.ndarray, map_name: str, map_description: str,
    notes: str = "",
) -> int:
    """Writes one dataset; returns the total size in bytes.

    obs_word: what the observations are called, plural ("movies").
    kind: "graded" (memberships anywhere in 0–1) or "crisp" (0 or 1 only).
    categories: {key: {"title", "names", "codes"}} — one crisp label per observation (composition, colour).
    numeric: [{"key", "title", "unit", "digits", "log"?, "plot"?, "values"}] — summarised per UpSet column; "plot": "density"
      draws a density plot per column instead of a heatmap cell.
    """
    N, L = membership.shape
    assert kind in ("graded", "crisp"), kind
    assert len(obs_ids) == N and map_xy.shape == (N, 2) and len(set_names) == L
    assert np.all((membership >= 0) & (membership <= 1)), "memberships must be in 0–1"
    if kind == "crisp":
        assert np.all((membership == 0) | (membership == 1)), "crisp memberships must be 0 or 1"
    for k, c in categories.items():
        assert len(c["codes"]) == N and max(c["codes"]) < len(c["names"]), k
    for a in numeric:
        assert len(a["values"]) == N, a["key"]

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    files: dict[str, dict] = {}

    def write_bin(name: str, arr: np.ndarray, desc: str) -> None:
        arr = np.ascontiguousarray(arr, dtype="<f4")
        (out / name).write_bytes(arr.tobytes())
        files[name] = {"dtype": "float32", "shape": list(arr.shape), "bytes": arr.nbytes, "description": desc}

    write_bin("membership.bin", membership, "membership of each observation in each set, 0–1")
    write_bin("map.bin", unit_square(map_xy), "2D map of the observations, unit square")
    meta = {
        "schema": SCHEMA,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "title": title,
        "source": source,
        "attribution": attribution,
        "notes": notes,
        "n": N,
        "obs_ids": obs_ids,
        "obs_names": obs_names,
        "obs_word": obs_word,
        "sets": {"title": sets_title, "names": set_names, "kind": kind, "file": "membership.bin"},
        "categories": categories,
        "numeric_attributes": numeric,
        "map": {"name": map_name, "description": map_description, "file": "map.bin"},
        "files": files,
    }
    (out / "meta.json").write_text(json.dumps(meta, separators=(",", ":"), ensure_ascii=False))
    return sum(f.stat().st_size for f in out.iterdir())
