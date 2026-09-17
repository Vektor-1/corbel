"""Day 5 gate evaluation: run G0 on the validation split, vectorize both the
prediction and the ground-truth mask with the identical vectorizer, and
compute the two metrics predeclared in
docs/corbel-custom-geometry-model-plan.md (Day 5 section) before this script
was run:

  1. Wall centerline metric: symmetric mean nearest-point (Chamfer-style)
     distance in pixels between sampled points on the predicted vs.
     ground-truth wall polylines, per image, averaged over the split.
     Reported raw and normalized by image diagonal.
  2. Door/window instance recall: connected-component both masks into
     discrete openings; a predicted instance matches a ground-truth
     instance at IoU >= 0.3; recall = matched GT / total GT, per class,
     pooled across the split.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import albumentations as A
import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from vectorize import vectorize_mask_rgb, WallSegment

IMG_SIZE = 640
DATASET = Path(__file__).parent / "dataset_seg"
MODEL_PATH = Path(__file__).parent / "g0" / "g0_slim.onnx"
IOU_MATCH_THRESH = 0.3
SAMPLE_SPACING = 5.0  # px, for Chamfer point sampling along polylines


def preprocess(img: np.ndarray, mask: np.ndarray):
    tf = A.Compose([
        A.LongestMaxSize(max_size=IMG_SIZE),
        A.PadIfNeeded(min_height=IMG_SIZE, min_width=IMG_SIZE, border_mode=0, fill=0, fill_mask=0),
    ])
    out = tf(image=img, mask=mask)
    return out["image"], out["mask"]


def sample_polyline_points(walls: list[WallSegment], spacing: float = SAMPLE_SPACING) -> np.ndarray:
    pts = []
    for w in walls:
        p = w.points
        for i in range(len(p) - 1):
            a, b = np.array(p[i]), np.array(p[i + 1])
            seg_len = np.linalg.norm(b - a)
            n = max(1, int(seg_len // spacing))
            for t in np.linspace(0, 1, n + 1):
                pts.append(a + t * (b - a))
    if not pts:
        return np.zeros((0, 2))
    return np.array(pts)


def chamfer_distance(pts_a: np.ndarray, pts_b: np.ndarray) -> float | None:
    if len(pts_a) == 0 or len(pts_b) == 0:
        return None
    # brute-force nearest neighbor (point counts per image are small, <5k)
    d_ab = np.sqrt(((pts_a[:, None, :] - pts_b[None, :, :]) ** 2).sum(-1))
    mean_a_to_b = d_ab.min(axis=1).mean()
    mean_b_to_a = d_ab.min(axis=0).mean()
    return float((mean_a_to_b + mean_b_to_a) / 2)


def instance_components(mask: np.ndarray, min_area: int = 9):
    m = (mask > 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    comps = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            comps.append(labels == i)
    return comps


def match_recall(pred_mask: np.ndarray, gt_mask: np.ndarray, iou_thresh: float = IOU_MATCH_THRESH):
    gt_comps = instance_components(gt_mask)
    pred_comps = instance_components(pred_mask)
    if not gt_comps:
        return None, 0
    matched = 0
    for gt_c in gt_comps:
        best_iou = 0.0
        for pred_c in pred_comps:
            inter = np.logical_and(gt_c, pred_c).sum()
            union = np.logical_or(gt_c, pred_c).sum()
            iou = inter / union if union > 0 else 0
            best_iou = max(best_iou, iou)
        if best_iou >= iou_thresh:
            matched += 1
    return matched, len(gt_comps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", default="val", choices=["val", "test"])
    args = parser.parse_args()
    split = args.split

    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    val_files = sorted((DATASET / "images" / split).glob("*.png"))
    print(f"evaluating on {len(val_files)} {split} images")

    chamfer_raw, chamfer_norm = [], []
    door_matched_total, door_gt_total = 0, 0
    window_matched_total, window_gt_total = 0, 0
    n_processed = 0
    n_chamfer_skipped = 0

    for i, img_path in enumerate(val_files):
        stem = img_path.stem
        mask_path = DATASET / "masks" / split / f"{stem}.png"
        img = np.array(Image.open(img_path).convert("RGB"))
        gt_mask = np.array(Image.open(mask_path).convert("RGB"))

        img_p, gt_mask_p = preprocess(img, gt_mask)

        inp = img_p.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        logits = session.run(None, {input_name: inp})[0][0]  # (3, H, W)
        probs = 1 / (1 + np.exp(-logits))
        pred_mask = (probs > 0.5).astype(np.uint8).transpose(1, 2, 0) * 255  # HWC, matches gt_mask_p layout

        pred_plan = vectorize_mask_rgb(pred_mask)
        gt_plan = vectorize_mask_rgb(gt_mask_p)

        pred_pts = sample_polyline_points(pred_plan.walls)
        gt_pts = sample_polyline_points(gt_plan.walls)
        cd = chamfer_distance(pred_pts, gt_pts)
        if cd is not None:
            diag = np.sqrt(IMG_SIZE ** 2 + IMG_SIZE ** 2)
            chamfer_raw.append(cd)
            chamfer_norm.append(cd / diag)
        else:
            n_chamfer_skipped += 1

        d_matched, d_gt = match_recall(pred_mask[:, :, 1], gt_mask_p[:, :, 1])
        if d_gt:
            door_matched_total += d_matched
            door_gt_total += d_gt
        w_matched, w_gt = match_recall(pred_mask[:, :, 2], gt_mask_p[:, :, 2])
        if w_gt:
            window_matched_total += w_matched
            window_gt_total += w_gt

        n_processed += 1
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(val_files)} processed", flush=True)

    result = {
        "split": split,
        "n_processed": n_processed,
        "n_chamfer_skipped": n_chamfer_skipped,
        "wall_chamfer_px_mean": float(np.mean(chamfer_raw)) if chamfer_raw else None,
        "wall_chamfer_px_median": float(np.median(chamfer_raw)) if chamfer_raw else None,
        "wall_chamfer_norm_mean": float(np.mean(chamfer_norm)) if chamfer_norm else None,
        "door_recall": door_matched_total / door_gt_total if door_gt_total else None,
        "door_matched": door_matched_total,
        "door_gt_total": door_gt_total,
        "window_recall": window_matched_total / window_gt_total if window_gt_total else None,
        "window_matched": window_matched_total,
        "window_gt_total": window_gt_total,
    }
    print(json.dumps(result, indent=2))
    suffix = "" if split == "val" else f"_{split}"
    out_path = Path(__file__).parent / "g0" / f"vectorizer_eval{suffix}.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"saved {out_path}")


if __name__ == "__main__":
    main()
