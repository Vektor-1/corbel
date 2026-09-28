#!/usr/bin/env python
"""Build the held-out TUNING dataset (datasets/dataset/tuning_set.jsonl),
distinct stems from the frozen complex_plan_benchmark.jsonl.

Per experiments/data-governance.md: tune only against validation data,
keep the frozen benchmark held out until an experiment is locked for
final evaluation. All 10 experiment branches' iterative comparisons this
round used this dataset, never the frozen one. Reuses
build_benchmark_dataset.py's build_record() so the reference-geometry
method is identical (deterministic mask-to-vector conversion, zero
manual annotation) -- just pointed at different images and output file.

Disjoint from both the original 12-stem frozen set and the 24 stems
added when it was later expanded to n=36 (see build_benchmark_dataset.py).

Run: python3 scripts/build_tuning_dataset.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build_benchmark_dataset import build_record  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]  # .../project
DATASET_DIR = REPO_ROOT / "datasets" / "dataset"
OUTPUT = DATASET_DIR / "tuning_set.jsonl"

STEMS = [
    "high_quality_architectural_1089",
    "high_quality_architectural_1101",
    "high_quality_architectural_1107",
    "high_quality_architectural_1162",
    "high_quality_1212",
    "high_quality_1354",
    "colorful_13513",
    "colorful_13689",
]


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
