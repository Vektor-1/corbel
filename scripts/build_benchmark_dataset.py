#!/usr/bin/env python
"""Build a frozen JSONL benchmark dataset for scripts/evaluate_manifests.py
from existing ground-truth segmentation masks, via ml/vectorize.py's
deterministic mask-to-vector conversion -- the same method
ml/evaluate_vectorizer.py already uses to benchmark the G0 model itself.

No manual annotation: ml/dataset_seg/masks/val/<stem>.png are true
filled-polygon ground-truth masks (R=wall, G=door, B=window), produced while
the original CubiCasa5k SVGs still existed on disk (they no longer do).
vectorize_mask_rgb() skeletonizes the wall channel and contour-detects
openings the same way the real G0+vectorizer pipeline does, so this is a
faithful (if skeleton-approximated) reference, not an invented shortcut.

Run: python3 scripts/build_benchmark_dataset.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]  # .../project
sys.path.insert(0, str(REPO_ROOT / "ml"))

from vectorize import _point_to_segment_dist, vectorize_mask_rgb  # noqa: E402

MASKS_DIR = REPO_ROOT / "ml" / "dataset_seg" / "masks" / "val"
DATASET_DIR = REPO_ROOT / "datasets" / "dataset"
OUTPUT = DATASET_DIR / "complex_plan_benchmark.jsonl"

# 12 stems spanning the 3 style families in images/val, weighted toward
# high_quality_architectural since it's the documented weakest style
# (78.3% wall IoU vs 82-86% for the others, per docs/corbel-custom-
# geometry-model-plan.md). Includes the two images already used for the
# collinearity-fix verification (_9483 worst case, _1950 good case) so
# those results stay comparable to this frozen benchmark.
STEMS = [
    "high_quality_architectural_9483",
    "high_quality_architectural_1052",
    "high_quality_architectural_1061",
    "high_quality_architectural_1066",
    "high_quality_architectural_1067",
    "high_quality_architectural_1075",
    "high_quality_1950",
    "high_quality_1034",
    "high_quality_1208",
    "colorful_11261",
    "colorful_1148",
    "colorful_1261",
]


def _split_polyline(points: list[tuple[float, float]], prefix: str) -> list[dict]:
    segments = []
    for i in range(len(points) - 1):
        segments.append({
            "id": f"{prefix}-w{len(segments)}",
            "start": {"x": points[i][0], "y": points[i][1]},
            "end": {"x": points[i + 1][0], "y": points[i + 1][1]},
        })
    return segments


def _offset_ratio(point: tuple[float, float], start: dict, end: dict) -> float:
    p = np.array(point)
    a = np.array([start["x"], start["y"]])
    b = np.array([end["x"], end["y"]])
    ab = b - a
    if np.allclose(ab, 0):
        return 0.0
    t = np.dot(p - a, ab) / np.dot(ab, ab)
    return float(np.clip(t, 0.0, 1.0))


def build_record(stem: str) -> dict:
    mask = np.array(Image.open(MASKS_DIR / f"{stem}.png").convert("RGB"))
    plan = vectorize_mask_rgb(mask)

    reference_walls: list[dict] = []
    # index i -> the list of 2-point segment dicts that polyline i was split into
    wall_id_lookup: list[list[dict]] = []
    for wi, wall in enumerate(plan.walls):
        segments = _split_polyline(wall.points, f"gt-{stem}-p{wi}")
        reference_walls.extend(segments)
        wall_id_lookup.append(segments)

    reference_openings: list[dict] = []
    for oi, opening in enumerate([*plan.doors, *plan.windows]):
        if opening.host_wall_idx is None:
            continue
        candidates = wall_id_lookup[opening.host_wall_idx]
        if not candidates:
            continue
        best_segment, best_distance = None, float("inf")
        for segment in candidates:
            distance = _point_to_segment_dist(
                opening.centroid,
                (segment["start"]["x"], segment["start"]["y"]),
                (segment["end"]["x"], segment["end"]["y"]),
            )
            if distance < best_distance:
                best_distance, best_segment = distance, segment
        if best_segment is None:
            continue
        reference_openings.append({
            "id": f"gt-{stem}-o{oi}",
            "kind": opening.cls,
            "wallId": best_segment["id"],
            "offsetRatio": round(_offset_ratio(opening.centroid, best_segment["start"], best_segment["end"]), 4),
        })

    return {
        "id": stem,
        "sourcePath": f"images/val/{stem}.png",
        "source": {"kind": "image"},
        "reference": {"walls": reference_walls, "openings": reference_openings},
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w") as handle:
        for stem in STEMS:
            record = build_record(stem)
            handle.write(json.dumps(record) + "\n")
            print(f"{stem}: {len(record['reference']['walls'])} walls, {len(record['reference']['openings'])} openings")
    print(f"\nWrote {len(STEMS)} records to {OUTPUT}")


if __name__ == "__main__":
    main()
