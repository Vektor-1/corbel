#!/usr/bin/env python
"""Run frozen JSONL plan annotations against named immutable manifests.

Each dataset line needs ``id``, ``sourcePath`` (relative to the dataset), a
backend ``source`` object (including ``kind``), and ``reference``. Reference walls/openings use the backend geometry shape. An
optional ``correctionBurden`` number records reviewed editor actions for that
plan. This script is intended for the GPU worker image, where all artifacts
declared by a manifest are available.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evaluation import aggregate_scores, score_reconstruction
from app.inference import run_ensemble


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, type=Path, help="Frozen JSONL benchmark dataset")
    parser.add_argument("--manifest", action="append", required=True, help="Manifest ID to evaluate; repeat for comparison")
    parser.add_argument("--output", required=True, type=Path, help="Destination JSON report")
    parser.add_argument("--offset", type=int, default=0, help="Number of dataset records to skip (for deterministic shards)")
    parser.add_argument("--limit", type=int, help="Maximum number of dataset records to evaluate (for deterministic shards)")
    args = parser.parse_args()

    records = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()]
    if args.offset < 0 or args.limit is not None and args.limit <= 0:
        raise SystemExit("--offset must be non-negative and --limit must be positive.")
    records = records[args.offset:] if args.limit is None else records[args.offset:args.offset + args.limit]
    if not records:
        raise SystemExit("Dataset has no JSONL records.")
    reports = {}
    for manifest_id in args.manifest:
        scored, burdens, plans = [], [], []
        for record in records:
            source_path = (args.dataset.parent / record["sourcePath"]).resolve()
            result = run_ensemble(source_path, record.get("source", {}), manifest_id)
            score = score_reconstruction(result, record["reference"])
            score["latencyMs"] = result.get("timings", {}).get("totalMs")
            scored.append(score)
            if record.get("correctionBurden") is not None:
                burdens.append(float(record["correctionBurden"]))
            plans.append({"id": record["id"], "score": score})
        reports[manifest_id] = {"summary": aggregate_scores(scored, burdens), "plans": plans}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"schemaVersion": 1, "dataset": str(args.dataset), "manifests": reports}, indent=2) + "\n")


if __name__ == "__main__":
    main()
