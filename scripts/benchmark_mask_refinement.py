#!/usr/bin/env python
"""Benchmarks the adaptive mask-refinement shadow manifest
(ensemble-g0-maskrefine-shadow-v1) against the active baseline
(ensemble-g0-yolo-v1) on the frozen complex-plan benchmark, and applies the
strict promotion gate specified for this phase:

  1. Must improve wall centerline F1, OR cut the absolute count of <15px
     ("fragmented") walls materially.
  2. Opening F1 regression capped at 1 percentage point.
  3. No new unsupported-wall / false-bridge diagnostics introduced.
  4. tests/test_topology.py::test_minimum_length_l_corner_is_not_replaced_by_a_diagonal
     must still pass (checked separately, this script doesn't run pytest).

Adds two metrics evaluate_manifests.py doesn't have (kept local to this
script rather than touching the shared, actively-edited evaluation.py):
  - normalized surface distance (mean nearest-point distance in both
    directions between predicted and reference walls, normalized by the
    image diagonal)
  - fragmentation count/rate of <15px walls, overall and for the
    high_quality_architectural stems specifically.
"""
from __future__ import annotations

import argparse
import json
import sys
from math import hypot
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evaluation import _distance_to_segment, _point, _samples, score_reconstruction, aggregate_scores
from app.inference import run_ensemble

DATASET = Path(__file__).resolve().parents[2] / "datasets" / "dataset" / "complex_plan_benchmark.jsonl"
BASELINE_MANIFEST = "ensemble-g0-yolo-v1"
FRAG_PX = 15
SPACING_PX = 4.0


def _wall_length(wall: dict) -> float:
    start, end = _point(wall["start"]), _point(wall["end"])
    return hypot(end[0] - start[0], end[1] - start[1])


def fragmentation(walls: list[dict]) -> dict:
    if not walls:
        return {"count": 0, "fragmentedCount": 0, "fragmentedRate": 0.0}
    lengths = [_wall_length(w) for w in walls]
    fragmented = sum(1 for l in lengths if l < FRAG_PX)
    return {"count": len(walls), "fragmentedCount": fragmented, "fragmentedRate": round(fragmented / len(walls), 3)}


def normalized_surface_distance(predicted: list[dict], reference: list[dict], width: float, height: float) -> float:
    diagonal = hypot(width, height) or 1.0
    ref_segments = [(_point(w["start"]), _point(w["end"])) for w in reference]
    pred_segments = [(_point(w["start"]), _point(w["end"])) for w in predicted]

    def mean_nearest(source_walls: list[dict], target_segments: list[tuple]) -> float:
        distances = []
        for wall in source_walls:
            for point in _samples(wall, SPACING_PX):
                distances.append(min((_distance_to_segment(point, s, e) for s, e in target_segments), default=diagonal))
        return sum(distances) / len(distances) if distances else 0.0

    forward = mean_nearest(predicted, ref_segments) if ref_segments else diagonal
    backward = mean_nearest(reference, pred_segments) if pred_segments else diagonal
    return round(((forward + backward) / 2) / diagonal, 5)


def run_manifest(manifest_id: str, records: list[dict]) -> dict:
    scored, frag_all, frag_hqa, nsd_values, diagnostics_seen = [], [], [], [], []
    for record in records:
        source_path = (DATASET.parent / record["sourcePath"]).resolve()
        result = run_ensemble(source_path, record.get("source", {}), manifest_id)
        score = score_reconstruction(result, record["reference"])
        score["latencyMs"] = result.get("timings", {}).get("totalMs")
        scored.append(score)

        walls = result.get("geometry", {}).get("walls", [])
        frag = fragmentation(walls)
        frag_all.append(frag)
        if record["id"].startswith("high_quality_architectural"):
            frag_hqa.append(frag)

        source = result.get("source", {})
        nsd_values.append(normalized_surface_distance(walls, record["reference"]["walls"], source.get("width", 1), source.get("height", 1)))

        diagnostics_seen.extend(item.get("id", "") for item in result.get("diagnostics", []))

    summary = aggregate_scores(scored)
    total_walls = sum(f["count"] for f in frag_all)
    total_frag = sum(f["fragmentedCount"] for f in frag_all)
    hqa_walls = sum(f["count"] for f in frag_hqa)
    hqa_frag = sum(f["fragmentedCount"] for f in frag_hqa)
    return {
        "summary": summary,
        "meanNormalizedSurfaceDistance": round(sum(nsd_values) / len(nsd_values), 5) if nsd_values else None,
        "fragmentation": {
            "overallCount": total_frag,
            "overallRate": round(total_frag / total_walls, 3) if total_walls else 0.0,
            "hqaCount": hqa_frag,
            "hqaRate": round(hqa_frag / hqa_walls, 3) if hqa_walls else 0.0,
        },
        "unsupportedOrBridgeDiagnostics": sum(1 for d in diagnostics_seen if d.startswith(("verification-removed-unsupported", "verification-low-support", "reconciled-wall-gap"))),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", default="ensemble-g0-maskrefine-shadow-v1", help="Shadow manifest ID to gate against the baseline")
    parser.add_argument("--baseline", default=BASELINE_MANIFEST, help="Baseline manifest ID (default: the active alias's own manifest)")
    args = parser.parse_args()

    records = [json.loads(line) for line in DATASET.read_text().splitlines() if line.strip()]
    baseline = run_manifest(args.baseline, records)
    candidate = run_manifest(args.candidate, records)

    print(f"\n=== {args.baseline} ===")
    print(json.dumps(baseline, indent=2))
    print(f"\n=== {args.candidate} ===")
    print(json.dumps(candidate, indent=2))

    wall_f1_delta = candidate["summary"]["wall"]["centrelineF1"] - baseline["summary"]["wall"]["centrelineF1"]
    frag_count_delta = candidate["fragmentation"]["overallCount"] - baseline["fragmentation"]["overallCount"]
    opening_f1_delta = candidate["summary"]["opening"]["f1"] - baseline["summary"]["opening"]["f1"]
    new_diagnostics = candidate["unsupportedOrBridgeDiagnostics"] - baseline["unsupportedOrBridgeDiagnostics"]

    print("\n=== gate ===")
    print(f"wall F1 delta: {wall_f1_delta:+.4f}")
    print(f"fragmented-wall count delta: {frag_count_delta:+d} (baseline {baseline['fragmentation']['overallCount']} -> candidate {candidate['fragmentation']['overallCount']})")
    print(f"opening F1 delta: {opening_f1_delta:+.4f} (cap: -0.01)")
    print(f"new unsupported/false-bridge diagnostics: {new_diagnostics:+d}")

    criterion_1 = wall_f1_delta > 0 or frag_count_delta < 0
    criterion_2 = opening_f1_delta >= -0.01
    criterion_3 = new_diagnostics <= 0
    print(f"\ncriterion 1 (wall F1 up OR fragmented count down): {'PASS' if criterion_1 else 'FAIL'}")
    print(f"criterion 2 (opening F1 regression <= 1pp): {'PASS' if criterion_2 else 'FAIL'}")
    print(f"criterion 3 (no new unsupported/false-bridge diagnostics): {'PASS' if criterion_3 else 'FAIL'}")
    print(f"\nOVERALL GATE: {'PASS' if (criterion_1 and criterion_2 and criterion_3) else 'FAIL'}")


if __name__ == "__main__":
    main()
