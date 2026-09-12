#!/usr/bin/env python
"""Generic benchmark for comparing manifests against a JSONL dataset.

Defaults to the held-out tuning set (datasets/dataset/tuning_set.jsonl,
built by build_tuning_dataset.py) rather than the frozen benchmark --
per experiments/data-governance.md, the frozen set stays out of parameter
selection until an experiment is locked for final evaluation. Pass
--dataset explicitly to run against the frozen set for a locked-in final
check.

Mirrors evaluate_manifests.py's metrics but also reports fragmentation
count (walls under FRAG_PX long), matching experiments/metrics.md's
requested metric set (wall F1, opening F1, abstention rate, fragmentation,
p50/p95 latency). Optionally writes the same data as JSON via --output,
so a run's exact numbers can be committed and diffed rather than only
existing as terminal output.
"""
from __future__ import annotations

import argparse
import json
import sys
from math import hypot
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evaluation import aggregate_scores, score_reconstruction
from app.inference import run_ensemble

REPO_ROOT = Path(__file__).resolve().parents[2]  # .../project
DEFAULT_DATASET = REPO_ROOT / "datasets" / "dataset" / "tuning_set.jsonl"
FRAG_PX = 15


def fragmentation(walls: list[dict]) -> dict:
    if not walls:
        return {"count": 0, "fragmentedCount": 0, "fragmentedRate": 0.0}
    lengths = []
    for w in walls:
        s, e = w["start"], w["end"]
        lengths.append(hypot(e["x"] - s["x"], e["y"] - s["y"]))
    fragmented = sum(1 for l in lengths if l < FRAG_PX)
    return {"count": len(walls), "fragmentedCount": fragmented, "fragmentedRate": round(fragmented / len(walls), 3)}


def run_manifest(manifest_id: str, records: list[dict], dataset_path: Path) -> dict:
    scored, frag_all = [], []
    for record in records:
        source_path = (dataset_path.parent / record["sourcePath"]).resolve()
        result = run_ensemble(source_path, record.get("source", {}), manifest_id)
        score = score_reconstruction(result, record["reference"])
        score["latencyMs"] = result.get("timings", {}).get("totalMs")
        scored.append(score)
        frag_all.append(fragmentation(result.get("geometry", {}).get("walls", [])))
    summary = aggregate_scores(scored)
    total_walls = sum(f["count"] for f in frag_all)
    total_frag = sum(f["fragmentedCount"] for f in frag_all)
    return {
        "summary": summary,
        "fragmentation": {"count": total_frag, "rate": round(total_frag / total_walls, 3) if total_walls else 0.0},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--manifest", action="append", required=True, help="Manifest ID to evaluate; repeat for comparison")
    parser.add_argument("--output", type=Path, help="Optional destination JSON report (in addition to stdout)")
    args = parser.parse_args()

    records = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()]
    reports = {}
    for manifest_id in args.manifest:
        result = run_manifest(manifest_id, records, args.dataset)
        reports[manifest_id] = result
        s = result["summary"]
        print(f"\n=== {manifest_id} (n={len(records)}, dataset={args.dataset.name}) ===")
        print(f"  wall F1={s['wall']['centrelineF1']:.4f}  opening F1={s['opening']['f1']:.4f}  "
              f"abstention={s['abstentionRate']:.3f}  frag={result['fragmentation']['count']} ({result['fragmentation']['rate']:.3f})  "
              f"latency p50={s['latencyMs']['p50']}ms p95={s['latencyMs']['p95']}ms")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"schemaVersion": 1, "dataset": str(args.dataset), "manifests": reports}, indent=2) + "\n")


if __name__ == "__main__":
    main()
