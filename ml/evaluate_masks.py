"""Day 8 of docs/corbel-custom-geometry-model-plan.md: companion mask
evaluator for G0, matching the rigor already established by
corbel/scripts/benchmark-local-yolo.ts (bootstrap 95% CIs, per-CubiCasa
-style breakdown, latency percentiles) but scored on masks rather than
boxes, since the existing script assumes YOLO boxes and can't score this
model's output directly.

Metrics (validation split only -- the test split stays untouched until
Day 9's single frozen-config run):
  - Per-class (wall/door/window) pixel IoU / Dice(=F1), pooled with
    bootstrap 95% CIs (image-level resampling, same technique as
    benchmark-local-yolo.ts's bootstrapClassF1).
  - Wall boundary-distance metric (Normalized Surface Dice) at 1/2/3px
    tolerance, with bootstrap CI at the primary 2px tolerance.
  - Per-CubiCasa-style breakdown (colorful / high_quality /
    high_quality_architectural).
  - Latency: NOT re-measured here -- Day 7's real-browser numbers
    (WebGPU and WASM) are embedded directly, since nothing about the
    model or browser environment changed since that run.

No torch/segmentation_models_pytorch/monai dependency: IoU/Dice/F1 are
plain pixel TP/FP/FN counts, and Normalized Surface Dice is a standard
scipy.ndimage distance-transform computation -- both simple enough to
hand-roll in the same lightweight venv (numpy/scipy/opencv/albumentations)
ml/evaluate_vectorizer.py already uses successfully, rather than installing
a new, heavy CPU-torch dependency for a handful of pixel-count formulas.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import albumentations as A
import numpy as np
import onnxruntime as ort
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt

IMG_SIZE = 640
DATASET = Path(__file__).parent / "dataset_seg"
MODEL_PATH = Path(__file__).parent / "g0" / "g0_slim.onnx"
CLASS_NAMES = ["wall", "door", "window"]  # R, G, B channels, per convert_cubicasa_seg.py
THRESHOLD = 0.5
NSD_TOLERANCES = [1, 2, 3]
NSD_PRIMARY_TOLERANCE = 2
BOOTSTRAP_REPLICATES = 1000
BOOTSTRAP_SEED = 13
STYLE_PREFIXES = ["high_quality_architectural", "colorful", "high_quality"]  # longest/most-specific first

# Day 7 result (docs/corbel-custom-geometry-model-plan.md, Day 7 section):
# real-browser latency for G0, not re-measured today since nothing about
# the model or browser environment has changed.
DAY7_LATENCY = {
    "measuredOn": "2026-09-10, real Chromium tab (Playwright MCP), 21-image stratified sample",
    "webgpu": {"inferenceMeanMs": 100.7, "inferenceP50Ms": 94.7, "inferenceP95Ms": 158.3},
    "wasmBaseline": {"inferenceMeanMs": 2086.5, "inferenceP50Ms": 2058.2, "inferenceP95Ms": 2416.6},
    "wasmOptimized": {"inferenceMeanMs": 2140.3, "inferenceP50Ms": 2080.3, "inferenceP95Ms": 2860.6},
    "gateMs": 1000,
    "gateResult": "WebGPU clears the p50<=1000ms gate with a ~10x margin; WASM alone does not.",
}


def preprocess(img: np.ndarray, mask: np.ndarray):
    tf = A.Compose([
        A.LongestMaxSize(max_size=IMG_SIZE),
        A.PadIfNeeded(min_height=IMG_SIZE, min_width=IMG_SIZE, border_mode=0, fill=0, fill_mask=0),
    ])
    out = tf(image=img, mask=mask)
    return out["image"], out["mask"]


def style_of(sample_id: str) -> str:
    for prefix in STYLE_PREFIXES:
        if sample_id.startswith(prefix):
            return prefix
    return "other"


def pixel_counts(pred: np.ndarray, gt: np.ndarray) -> dict:
    pred_b = pred > 0
    gt_b = gt > 0
    tp = int(np.logical_and(pred_b, gt_b).sum())
    fp = int(np.logical_and(pred_b, ~gt_b).sum())
    fn = int(np.logical_and(~pred_b, gt_b).sum())
    return {"tp": tp, "fp": fp, "fn": fn}


def f1_iou_from_counts(tp: int, fp: int, fn: int) -> dict:
    denom_f1 = 2 * tp + fp + fn
    denom_iou = tp + fp + fn
    return {
        "f1": (2 * tp / denom_f1) if denom_f1 else 0.0,
        "iou": (tp / denom_iou) if denom_iou else 0.0,
    }


def boundary_of(mask: np.ndarray) -> np.ndarray:
    b = mask > 0
    if not b.any():
        return b
    eroded = binary_erosion(b, structure=np.ones((3, 3), dtype=bool))
    return b ^ eroded


def normalized_surface_dice(pred_mask: np.ndarray, gt_mask: np.ndarray, tolerance: int):
    pred_boundary = boundary_of(pred_mask)
    gt_boundary = boundary_of(gt_mask)
    total = int(pred_boundary.sum()) + int(gt_boundary.sum())
    if total == 0:
        return None  # neither mask has any wall pixels in this image
    dt_from_gt = distance_transform_edt(~gt_boundary)
    dt_from_pred = distance_transform_edt(~pred_boundary)
    pred_within = int((dt_from_gt[pred_boundary] <= tolerance).sum())
    gt_within = int((dt_from_pred[gt_boundary] <= tolerance).sum())
    return (pred_within + gt_within) / total


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    index = min(len(sorted_vals) - 1, int(p * len(sorted_vals)))
    return sorted_vals[index]


def bootstrap_class_metric(per_image_counts: list[dict], metric: str, replicates: int, seed: int):
    rng = np.random.default_rng(seed)
    n = len(per_image_counts)
    if n == 0:
        return [0.0, 0.0]
    scores = []
    for _ in range(replicates):
        idx = rng.integers(0, n, size=n)
        tp = sum(per_image_counts[i]["tp"] for i in idx)
        fp = sum(per_image_counts[i]["fp"] for i in idx)
        fn = sum(per_image_counts[i]["fn"] for i in idx)
        scores.append(f1_iou_from_counts(tp, fp, fn)[metric])
    scores.sort()
    return [percentile(scores, 0.025), percentile(scores, 0.975)]


def bootstrap_mean_metric(values: list[float], replicates: int, seed: int):
    rng = np.random.default_rng(seed)
    n = len(values)
    if n == 0:
        return [0.0, 0.0]
    arr = np.array(values)
    scores = []
    for _ in range(replicates):
        idx = rng.integers(0, n, size=n)
        scores.append(float(arr[idx].mean()))
    scores.sort()
    return [percentile(scores, 0.025), percentile(scores, 0.975)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", default="val", choices=["val", "test"])
    args = parser.parse_args()
    split = args.split

    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    val_files = sorted((DATASET / "images" / split).glob("*.png"))
    print(f"evaluating {len(val_files)} {split} images")

    # Per-image data, indexed in parallel across all lists below.
    per_image_counts = {cls: [] for cls in CLASS_NAMES}  # list of {tp,fp,fn} dicts
    per_image_nsd = {tau: [] for tau in NSD_TOLERANCES}  # list of floats (None entries dropped)
    sample_styles = []
    n_skipped_nsd = {tau: 0 for tau in NSD_TOLERANCES}

    for i, img_path in enumerate(val_files):
        stem = img_path.stem
        mask_path = DATASET / "masks" / split / f"{stem}.png"
        img = np.array(Image.open(img_path).convert("RGB"))
        gt_mask = np.array(Image.open(mask_path).convert("RGB"))

        img_p, gt_mask_p = preprocess(img, gt_mask)
        sample_styles.append(style_of(stem))

        inp = img_p.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        logits = session.run(None, {input_name: inp})[0][0]  # (3, H, W)
        probs = 1 / (1 + np.exp(-logits))
        pred_mask = (probs > THRESHOLD).astype(np.uint8).transpose(1, 2, 0) * 255  # HWC, matches gt_mask_p

        for c, cls in enumerate(CLASS_NAMES):
            per_image_counts[cls].append(pixel_counts(pred_mask[:, :, c], gt_mask_p[:, :, c]))

        wall_pred = pred_mask[:, :, 0]
        wall_gt = gt_mask_p[:, :, 0]
        for tau in NSD_TOLERANCES:
            nsd = normalized_surface_dice(wall_pred, wall_gt, tau)
            if nsd is None:
                n_skipped_nsd[tau] += 1
            else:
                per_image_nsd[tau].append(nsd)

        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(val_files)} processed", flush=True)

    # --- Per-class pooled metrics + bootstrap CIs ---
    per_class = {}
    for cls in CLASS_NAMES:
        counts = per_image_counts[cls]
        tp = sum(c["tp"] for c in counts)
        fp = sum(c["fp"] for c in counts)
        fn = sum(c["fn"] for c in counts)
        base = f1_iou_from_counts(tp, fp, fn)
        per_class[cls] = {
            "tp": tp, "fp": fp, "fn": fn,
            "f1": base["f1"], "dice": base["f1"],  # Dice == F1 on binary masks
            "iou": base["iou"],
            "f1Ci95": bootstrap_class_metric(counts, "f1", BOOTSTRAP_REPLICATES, BOOTSTRAP_SEED),
            "iouCi95": bootstrap_class_metric(counts, "iou", BOOTSTRAP_REPLICATES, BOOTSTRAP_SEED + 500),
        }

    # --- Wall boundary-distance (Normalized Surface Dice) ---
    nsd_summary = {}
    for tau in NSD_TOLERANCES:
        vals = per_image_nsd[tau]
        entry = {
            "n": len(vals),
            "nSkipped": n_skipped_nsd[tau],
            "mean": float(np.mean(vals)) if vals else None,
            "median": float(np.median(vals)) if vals else None,
        }
        if tau == NSD_PRIMARY_TOLERANCE:
            entry["ci95"] = bootstrap_mean_metric(vals, BOOTSTRAP_REPLICATES, BOOTSTRAP_SEED + 1000)
        nsd_summary[f"tau_{tau}px"] = entry

    # --- Per-style breakdown ---
    styles = sorted(set(sample_styles))
    by_style = {}
    for style in styles:
        indices = [i for i, s in enumerate(sample_styles) if s == style]
        style_per_class = {}
        for cls in CLASS_NAMES:
            counts = [per_image_counts[cls][i] for i in indices]
            tp = sum(c["tp"] for c in counts)
            fp = sum(c["fp"] for c in counts)
            fn = sum(c["fn"] for c in counts)
            style_per_class[cls] = f1_iou_from_counts(tp, fp, fn)
        by_style[style] = {"n": len(indices), "perClass": style_per_class}

    result = {
        "config": {
            "model": str(MODEL_PATH), "split": split, "n": len(val_files),
            "threshold": THRESHOLD, "bootstrapReplicates": BOOTSTRAP_REPLICATES,
        },
        "perClass": per_class,
        "wallBoundaryNsd": nsd_summary,
        "byStyle": by_style,
        "latency": DAY7_LATENCY,
    }

    print(json.dumps(result, indent=2))
    out_path = Path(__file__).parent / "g0" / f"mask_eval_{split}.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"saved {out_path}")


if __name__ == "__main__":
    main()
