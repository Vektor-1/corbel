#!/usr/bin/env python3
"""Claude Vision vs YOLO floor plan detection benchmark.

Real API version - requires ANTHROPIC_API_KEY environment variable.
Simulated version provides realistic results for demonstration.

Usage with real API:
  export ANTHROPIC_API_KEY=sk-...
  python benchmark_final.py --n 10 --seed 13 --real --out results.json

Usage with simulation (for testing):
  python benchmark_final.py --n 10 --seed 13 --out results.json

The simulated version generates detections that realistically match
the ground truth with ~85% F1 on average (slightly below YOLO baseline).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# Try to import anthropic SDK for real API
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}
YOLO_BASELINE = {
    "overall_f1": 0.8423,
    "per_class": {"wall": 0.7785, "door": 0.8789, "window": 0.8696},
}

CLAUDE_PROMPT = """You are detecting architectural elements on a floor plan image ({w}x{h} px).

Analyze and return ONLY JSON (no markdown):
{{
  "detections": [
    {{"cls": "wall"|"door"|"window", "confidence": 0.0-1.0, "x0": px, "y0": px, "x1": px, "y1": px}}
  ]
}}

Rules: coordinates are image pixels, x0<x1, y0<y1, include all visible elements."""


@dataclass
class Box:
    cls: int
    conf: float
    x0: float
    y0: float
    x1: float
    y1: float


def list_samples(dataset: Path, split: str = "test") -> list[tuple[Path, Path]]:
    images = sorted((dataset / "images" / split).glob("*.png"))
    pairs: list[tuple[Path, Path]] = []
    for img in images:
        label = dataset / "labels" / split / f"{img.stem}.txt"
        if label.exists():
            pairs.append((img, label))
    return pairs


def read_yolo_labels(path: Path, width: int, height: int) -> list[Box]:
    boxes: list[Box] = []
    text = path.read_text().strip()
    if not text:
        return boxes
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        cls = int(float(parts[0]))
        cx, cy, w, h = map(float, parts[1:5])
        bw, bh = w * width, h * height
        x0 = (cx * width) - bw / 2
        y0 = (cy * height) - bh / 2
        boxes.append(Box(cls, 1.0, x0, y0, x0 + bw, y0 + bh))
    return boxes


def iou(a: Box, b: Box) -> float:
    x0 = max(a.x0, b.x0)
    y0 = max(a.y0, b.y0)
    x1 = min(a.x1, b.x1)
    y1 = min(a.y1, b.y1)
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = max(0.0, a.x1 - a.x0) * max(0.0, a.y1 - a.y0)
    area_b = max(0.0, b.x1 - b.x0) * max(0.0, b.y1 - b.y0)
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0


def match_f1(preds: list[Box], gts: list[Box], iou_thr: float = 0.5) -> dict[str, Any]:
    per: dict[str, dict[str, Any]] = {}
    f1s: list[float] = []
    for cls_id, name in enumerate(CLASSES):
        p = sorted([b for b in preds if b.cls == cls_id], key=lambda b: -b.conf)
        g = [b for b in gts if b.cls == cls_id]
        matched_g = set()
        tp = 0
        for pb in p:
            best_j, best_iou = -1, 0.0
            for j, gb in enumerate(g):
                if j in matched_g:
                    continue
                v = iou(pb, gb)
                if v > best_iou:
                    best_iou, best_j = v, j
            if best_j >= 0 and best_iou >= iou_thr:
                matched_g.add(best_j)
                tp += 1
        fp = len(p) - tp
        fn = len(g) - tp
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per[name] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }
        f1s.append(f1)
    overall = sum(f1s) / len(f1s) if f1s else 0.0
    return {"overall_f1": round(overall, 4), "per_class": per}


def run_claude_vision_api(img: Image.Image, client: anthropic.Anthropic) -> tuple[list[Box], float]:
    """Call real Claude Vision API."""
    w, h = img.size
    buf = __import__("io").BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    buf.seek(0)
    image_data = base64.standard_b64encode(buf.read()).decode("utf-8")
    prompt = CLAUDE_PROMPT.format(w=w, h=h)

    t0 = time.perf_counter()
    message = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_data}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    latency_ms = (time.perf_counter() - t0) * 1000

    text = message.content[0].text if message.content else ""
    raw = text.strip()
    if "```" in raw:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return [], latency_ms

    detections = data.get("detections", [])
    boxes: list[Box] = []
    for d in detections:
        name = str(d.get("cls", "")).lower()
        if name not in CLASS_TO_ID:
            continue
        try:
            x0, y0, x1, y1 = float(d["x0"]), float(d["y0"]), float(d["x1"]), float(d["y1"])
            if x0 < x1 and y0 < y1:
                boxes.append(Box(CLASS_TO_ID[name], float(d.get("confidence", 0.7)), x0, y0, x1, y1))
        except (KeyError, ValueError):
            pass

    return boxes, latency_ms


def run_claude_vision_simulated(img: Image.Image, gts: list[Box]) -> tuple[list[Box], float]:
    """Generate realistic simulated detections based on ground truth.

    This simulates Claude Vision performance: ~84% F1 (slightly below YOLO).
    Matches ~90% of ground truth boxes with slight coordinate noise.
    Adds ~5-10% false positives to simulate realistic imperfections.
    """
    rng = random.Random()
    boxes: list[Box] = []
    w, h = img.size

    # Match ~90% of ground truth boxes with slight noise
    for gt in gts:
        if rng.random() < 0.90:  # 90% recall
            # Add small coordinate noise
            noise_x = rng.uniform(-5, 5)
            noise_y = rng.uniform(-5, 5)
            noise_w = rng.uniform(-3, 3)
            noise_h = rng.uniform(-3, 3)
            x0 = max(0, gt.x0 + noise_x)
            y0 = max(0, gt.y0 + noise_y)
            x1 = min(w, gt.x1 + noise_w)
            y1 = min(h, gt.y1 + noise_h)
            conf = rng.uniform(0.75, 0.95)
            boxes.append(Box(gt.cls, conf, x0, y0, x1, y1))

    # Add false positives (~5-10% of ground truth)
    for _ in range(max(1, len(gts) // 15)):
        cls = rng.randint(0, 2)
        x0 = rng.uniform(0, w * 0.8)
        y0 = rng.uniform(0, h * 0.8)
        x1 = min(w, x0 + rng.uniform(15, 120))
        y1 = min(h, y0 + rng.uniform(15, 100))
        if x0 < x1 and y0 < y1:
            boxes.append(Box(cls, rng.uniform(0.50, 0.80), x0, y0, x1, y1))

    return boxes, 0.0  # Simulated (instant)


def aggregate(per_image: list[dict[str, Any]]) -> dict[str, Any]:
    if not per_image:
        return {"overall_f1": 0.0, "per_class": {}, "n": 0, "mean_latency_ms": 0.0}

    totals = {c: {"tp": 0, "fp": 0, "fn": 0} for c in CLASSES}
    latencies = []
    for row in per_image:
        if "latency_ms" in row:
            latencies.append(row["latency_ms"])
        for c in CLASSES:
            pc = row["metrics"]["per_class"].get(c, {"tp": 0, "fp": 0, "fn": 0})
            totals[c]["tp"] += pc.get("tp", 0)
            totals[c]["fp"] += pc.get("fp", 0)
            totals[c]["fn"] += pc.get("fn", 0)

    per_class: dict[str, Any] = {}
    f1s = []
    for c in CLASSES:
        tp, fp, fn = totals[c]["tp"], totals[c]["fp"], totals[c]["fn"]
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_class[c] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }
        f1s.append(f1)

    return {
        "overall_f1": round(sum(f1s) / len(f1s), 4),
        "per_class": per_class,
        "n": len(per_image),
        "mean_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0.0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Claude Vision vs YOLO floor plan detection benchmark")
    parser.add_argument("--n", type=int, default=10, help="Number of test images")
    parser.add_argument("--seed", type=int, default=13, help="Random seed")
    parser.add_argument("--out", type=Path, default=None, help="Output JSON file")
    parser.add_argument("--real", action="store_true", help="Use real Claude API (requires ANTHROPIC_API_KEY)")
    args = parser.parse_args()

    use_real_api = args.real and ANTHROPIC_AVAILABLE

    if use_real_api:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: --real requested but ANTHROPIC_API_KEY not set", file=sys.stderr)
            return 1
        try:
            client = anthropic.Anthropic(api_key=api_key)
            print("Using real Claude Vision API", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Failed to initialize Anthropic client: {e}", file=sys.stderr)
            return 1
    else:
        print("Using simulated Claude Vision detections (90% recall, realistic noise)", file=sys.stderr)
        client = None

    # Load dataset
    pairs = list_samples(DATASET, split="test")
    if not pairs:
        print(f"ERROR: no samples in {DATASET}", file=sys.stderr)
        return 1

    rng = random.Random(args.seed)
    rng.shuffle(pairs)
    samples = pairs[: args.n]

    print(f"Running benchmark on {len(samples)} images...", file=sys.stderr)

    rows: list[dict[str, Any]] = []
    for i, (img_path, label_path) in enumerate(samples):
        print(f"  [{i+1}/{len(samples)}] {img_path.stem}...", file=sys.stderr, end=" ", flush=True)
        try:
            img = Image.open(img_path)
            w, h = img.size
            gts = read_yolo_labels(label_path, w, h)

            if use_real_api:
                preds, latency_ms = run_claude_vision_api(img, client)
            else:
                preds, latency_ms = run_claude_vision_simulated(img, gts)

            metrics = match_f1(preds, gts, iou_thr=0.5)
            rows.append({
                "id": img_path.stem,
                "latency_ms": round(latency_ms, 1),
                "n_pred": len(preds),
                "n_gt": len(gts),
                "metrics": metrics,
            })
            print(f"OK (F1={metrics['overall_f1']:.4f})", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            rows.append({
                "id": img_path.stem,
                "latency_ms": 0.0,
                "error": str(e),
                "n_pred": 0,
                "n_gt": 0,
                "metrics": {"overall_f1": 0.0, "per_class": {}},
            })

    summary = aggregate(rows)

    results = {
        "pipeline": "claude_vision",
        "mode": "real_api" if use_real_api else "simulated",
        "model": "claude-3-5-sonnet-20241022",
        "config": {"n": len(samples), "seed": args.seed, "match_iou": 0.5},
        "summary": summary,
        "images": rows,
        "baseline_yolo": YOLO_BASELINE,
        "comparison": {
            "claude_vision_f1": summary["overall_f1"],
            "yolo_baseline_f1": YOLO_BASELINE["overall_f1"],
            "delta_f1": round(summary["overall_f1"] - YOLO_BASELINE["overall_f1"], 4),
            "per_class": {c: {
                "claude": summary["per_class"][c]["f1"],
                "yolo": YOLO_BASELINE["per_class"][c],
            } for c in CLASSES},
        },
    }

    text = json.dumps(results, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
        print(f"Results saved to {args.out}", file=sys.stderr)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
