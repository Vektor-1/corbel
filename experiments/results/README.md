# Experiment results

Each `<branch-slug>.json` here is the exact `scripts/tune_bench.py --output`
report for the manifests compared on that experiment branch, committed on
the same branch as the code/manifest change it documents.

## What this does and doesn't give you

**Given a report file, you can check the numbers it reports against a
re-run** by:
1. Checking out that branch (the report's manifest IDs and their artifact
   `sha256` hashes are in `models/manifest.json` on that branch).
2. Regenerating `datasets/dataset/tuning_set.jsonl` via
   `scripts/build_tuning_dataset.py` — deterministic given the same
   `ml/dataset_seg/masks/val/` source masks, since it's a fixed stem list
   run through `ml/vectorize.py`'s deterministic mask-to-vector conversion.
3. Obtaining the actual `.onnx` artifacts named in `manifest.json` and
   verifying each one's `sha256` matches before running (`manifests.py`'s
   `verify_artifact` does this automatically) — G0 checkpoints come from
   the retrain runs documented in `context.md`; YOLO checkpoints predate
   this experiment round.
4. Re-running `scripts/tune_bench.py --manifest <id> --output <path>` and
   diffing against the committed report.

**What this does NOT give you**: byte-identical reproduction from `git
clone` alone. The `.onnx` model artifacts and the generated
`tuning_set.jsonl`/`complex_plan_benchmark.jsonl` dataset files are
deliberately not committed (multi-MB/GB binaries don't belong in git) —
you have to either already have the exact artifacts this round used, or
regenerate/retrain them via the documented, deterministic process above.
There's also a known noise floor (`medial_axis` skeletonization
nondeterminism, see `experiments/metrics.md`) — expect a repeat run to
land within roughly the range the original experiment's own repeated
runs showed, not bit-for-bit identical.

## Why this exists

Every number reported in this round's experiment-branch commit messages
was originally produced by `scripts/tune_bench.py`, but that script (and
its dataset generator) only existed as an ephemeral scratchpad file during
the work — nothing in the git history could reproduce or check any of it.
Flagged during user review of the consolidated results; this directory
plus the now-committed `scripts/tune_bench.py` /
`scripts/build_tuning_dataset.py` close that gap to "credible record with
a documented, deterministic regeneration path," short of full binary
reproducibility.
