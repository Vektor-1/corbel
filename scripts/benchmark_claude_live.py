#!/usr/bin/env python3
"""Claude Vision vs YOLO - Real API with live terminal output.

Requires: export ANTHROPIC_API_KEY=sk-ant-...

Usage:
  export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
  python scripts/benchmark_claude_live.py --n 10 --seed 13
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

try:
    import anthropic
except ImportError:
    print("Error: anthropic SDK not installed. Run: pip install anthropic", file=sys.stderr)
    sys.exit(1)

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}

CLAUDE_PROMPT = """You are detecting architectural elements on a floor plan image ({w}x{h} px).

Analyze and return ONLY valid JSON (no markdown, no extra text):
{{
  "detections": [
    {{"cls": "wall"|"door"|"window", "confidence": 0.0-1.0, "x0": px, "y0": px, "x1": px, "y1": px}}
  ]
}}

Requirements:
- Coordinates are image pixels (origin top-left)
- x0 < x1, y0 < y1
- Include EVERY wall, door, window visible
- Confidence: 0.5-1.0 based on certainty
- Return ONLY JSON object"""


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
        model="claude-haiku-4-5-20251001",
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
        print(f"    ⚠️  Failed to parse JSON response", file=sys.stderr)
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


def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"overall_f1": 0.0, "per_class": {}, "n": 0, "mean_latency_ms": 0.0}

    totals = {c: {"tp": 0, "fp": 0, "fn": 0} for c in CLASSES}
    latencies = []
    for row in rows:
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
        "n": len(rows),
        "mean_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0.0,
    }


def print_header():
    print("\n" + "="*90)
    print("  🔍 CLAUDE VISION FLOOR PLAN DETECTION BENCHMARK (Real API)")
    print("="*90 + "\n")


def print_progress_line(idx: int, total: int, image_id: str, f1: float, wall_f1: float, door_f1: float, window_f1: float, latency_ms: float):
    """Print a formatted progress line."""
    status = "✓" if f1 >= 0.80 else "⚠" if f1 >= 0.70 else "✗"
    print(f"  [{idx:2d}/{total}] {status} {image_id:40s} | F1: {f1:.4f} | W:{wall_f1:.3f} D:{door_f1:.3f} W:{window_f1:.3f} | {latency_ms:6.0f}ms")


def print_summary(summary: dict[str, Any], yolo_baseline: dict[str, float]):
    """Print formatted summary."""
    print("\n" + "="*90)
    print("  RESULTS SUMMARY")
    print("="*90)

    cv_f1 = summary["overall_f1"]
    yolo_f1 = yolo_baseline["overall_f1"]
    delta = cv_f1 - yolo_f1
    delta_symbol = "📈" if delta > 0 else "📉" if delta < 0 else "⚖️"

    print(f"\n  OVERALL F1 SCORE:")
    print(f"    Claude Vision:  {cv_f1:.4f}")
    print(f"    YOLO Baseline:  {yolo_f1:.4f}")
    print(f"    {delta_symbol} Delta:        {delta:+.4f}")

    print(f"\n  PER-CLASS BREAKDOWN:")
    print(f"\n    WALLS:")
    print(f"      Claude Vision: F1={summary['per_class']['wall']['f1']:.4f} (P={summary['per_class']['wall']['precision']:.4f}, R={summary['per_class']['wall']['recall']:.4f})")
    print(f"      YOLO Baseline: F1={yolo_baseline['per_class']['wall']:.4f}")
    print(f"      Delta: {summary['per_class']['wall']['f1'] - yolo_baseline['per_class']['wall']:+.4f}")

    print(f"\n    DOORS:")
    print(f"      Claude Vision: F1={summary['per_class']['door']['f1']:.4f} (P={summary['per_class']['door']['precision']:.4f}, R={summary['per_class']['door']['recall']:.4f})")
    print(f"      YOLO Baseline: F1={yolo_baseline['per_class']['door']:.4f}")
    print(f"      Delta: {summary['per_class']['door']['f1'] - yolo_baseline['per_class']['door']:+.4f}")

    print(f"\n    WINDOWS:")
    print(f"      Claude Vision: F1={summary['per_class']['window']['f1']:.4f} (P={summary['per_class']['window']['precision']:.4f}, R={summary['per_class']['window']['recall']:.4f})")
    print(f"      YOLO Baseline: F1={yolo_baseline['per_class']['window']:.4f}")
    print(f"      Delta: {summary['per_class']['window']['f1'] - yolo_baseline['per_class']['window']:+.4f}")

    print(f"\n  STATISTICS:")
    print(f"    Images tested:   {summary['n']}")
    print(f"    Mean latency:    {summary['mean_latency_ms']:.1f}ms")
    print(f"\n" + "="*90 + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Claude Vision vs YOLO benchmark (real API)")
    parser.add_argument("--n", type=int, default=10)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    # Check API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        print("Set it with: export ANTHROPIC_API_KEY=sk-ant-...", file=sys.stderr)
        return 1

    try:
        client = anthropic.Anthropic(api_key=api_key)
    except Exception as e:
        print(f"ERROR: Failed to initialize Anthropic client: {e}", file=sys.stderr)
        return 1

    # Load dataset
    pairs = list_samples(DATASET, split="test")
    if not pairs:
        print(f"ERROR: No samples in {DATASET}", file=sys.stderr)
        return 1

    rng = random.Random(args.seed)
    rng.shuffle(pairs)
    samples = pairs[: args.n]

    print_header()
    print(f"  Processing {len(samples)} floor plan images...\n")
    print(f"  {'Image ID':<40} {'F1':<8} {'W/D/W':<20} {'Latency':<8}")
    print(f"  {'-'*90}")

    rows: list[dict[str, Any]] = []
    for i, (img_path, label_path) in enumerate(samples, 1):
        try:
            img = Image.open(img_path)
            w, h = img.size
            gts = read_yolo_labels(label_path, w, h)

            # Run detection
            preds, latency_ms = run_claude_vision_api(img, client)

            # Compute metrics
            metrics = match_f1(preds, gts, iou_thr=0.5)

            rows.append({
                "id": img_path.stem,
                "latency_ms": round(latency_ms, 1),
                "n_pred": len(preds),
                "n_gt": len(gts),
                "metrics": metrics,
            })

            # Print progress line
            wall_f1 = metrics["per_class"]["wall"]["f1"]
            door_f1 = metrics["per_class"]["door"]["f1"]
            window_f1 = metrics["per_class"]["window"]["f1"]
            overall_f1 = metrics["overall_f1"]

            print_progress_line(i, len(samples), img_path.stem[:40], overall_f1, wall_f1, door_f1, window_f1, latency_ms)
            sys.stdout.flush()

        except Exception as e:
            print(f"  [{i:2d}/{len(samples)}] ✗ {img_path.stem[:40]:40s} | ERROR: {str(e)[:40]}")
            rows.append({
                "id": img_path.stem,
                "latency_ms": 0.0,
                "error": str(e),
                "n_pred": 0,
                "n_gt": 0,
                "metrics": {"overall_f1": 0.0, "per_class": {}},
            })

    # Aggregate and display results
    summary = aggregate(rows)

    yolo_baseline = {
        "overall_f1": 0.8423,
        "per_class": {"wall": 0.7785, "door": 0.8789, "window": 0.8696},
    }

    print_summary(summary, yolo_baseline)

    # Save results
    results = {
        "pipeline": "claude_vision_live",
        "model": "claude-3-5-sonnet-20241022",
        "config": {"n": len(samples), "seed": args.seed, "match_iou": 0.5},
        "summary": summary,
        "images": rows,
        "baseline_yolo": yolo_baseline,
        "comparison": {
            "claude_vision_f1": summary["overall_f1"],
            "yolo_baseline_f1": yolo_baseline["overall_f1"],
            "delta_f1": round(summary["overall_f1"] - yolo_baseline["overall_f1"], 4),
            "per_class": {c: {
                "claude": summary["per_class"][c]["f1"],
                "yolo": yolo_baseline["per_class"][c],
            } for c in CLASSES},
        },
    }

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(results, indent=2))
        print(f"✓ Results saved to: {args.out}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
