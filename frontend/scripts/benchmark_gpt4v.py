#!/usr/bin/env python3
"""GPT-4V floor plan detection benchmark (Cursor/OpenAI alternative).

Compares GPT-4V vision against YOLO baseline.
(Use this if Cursor is running with OpenAI API key)

Usage:
  scripts/.venv/bin/python scripts/benchmark_gpt4v.py --n 10 --seed 13
"""

import argparse
import json
import os
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import base64
from PIL import Image

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai library not found. Install with: pip install openai")
    exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}

# OpenAI API
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
GPT_MODEL = "gpt-4-vision-preview"  # or "gpt-4-turbo"

DETECTION_PROMPT = """You are detecting architectural elements on a floor plan image ({w}x{h} px).
Return ONLY a valid JSON object with no markdown, no extra text:
{{
  "detections": [
    {{"cls": "wall"|"door"|"window", "confidence": 0.0-1.0, "x0": px, "y0": px, "x1": px, "y1": px}}
  ]
}}

Be precise. Walls are long lines. Doors/windows are smaller rectangles on walls."""


@dataclass
class Box:
    cls: int
    conf: float
    x0: float
    y0: float
    x1: float
    y1: float


def list_samples(dataset: Path, split: str = "test", n: int = 10, seed: int = 13) -> list[tuple[Path, Path]]:
    images = sorted((dataset / "images" / split).glob("*.png"))
    random.seed(seed)
    random.shuffle(images)
    pairs = []
    for img in images[:n]:
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


def detect_gpt4v(client: OpenAI, img_path: Path) -> list[Box]:
    """Call GPT-4V vision API for detection."""
    img = Image.open(img_path)
    w, h = img.size

    # Encode image as base64
    with open(img_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    prompt = DETECTION_PROMPT.format(w=w, h=h)

    try:
        response = client.chat.completions.create(
            model=GPT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{img_b64}"},
                        },
                    ],
                }
            ],
            temperature=0.0,
            max_tokens=1024,
        )

        content = response.choices[0].message.content

        # Parse JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        data = json.loads(content.strip())

        # Convert to Box objects
        boxes: list[Box] = []
        for det in data.get("detections", []):
            cls_name = det["cls"]
            cls_id = CLASS_TO_ID.get(cls_name, 0)
            boxes.append(
                Box(
                    cls=cls_id,
                    conf=float(det["confidence"]),
                    x0=float(det["x0"]),
                    y0=float(det["y0"]),
                    x1=float(det["x1"]),
                    y1=float(det["y1"]),
                )
            )

        return boxes

    except Exception as e:
        print(f"Warning: GPT-4V API failed for {img_path}: {e}. Returning empty detections.")
        return []


def main():
    parser = argparse.ArgumentParser(description="GPT-4V floor plan benchmark")
    parser.add_argument("--n", type=int, default=10, help="Number of samples")
    parser.add_argument("--seed", type=int, default=13, help="Random seed")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="Dataset path")
    args = parser.parse_args()

    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=OPENAI_API_KEY)
    samples = list_samples(args.dataset, split="test", n=args.n, seed=args.seed)

    results = {
        "config": {"n": args.n, "seed": args.seed, "model": GPT_MODEL},
        "images": [],
        "summary": {"overall_f1": 0.0, "per_class": {}},
    }

    f1_scores = []

    print(f"Running GPT-4V benchmark on {len(samples)} images...\n")

    for img_path, label_path in samples:
        img = Image.open(img_path)
        w, h = img.size

        gts = read_yolo_labels(label_path, w, h)
        preds = detect_gpt4v(client, img_path)

        metrics = match_f1(preds, gts)
        f1_scores.append(metrics["overall_f1"])

        results["images"].append(
            {
                "id": img_path.stem,
                "n_pred": len(preds),
                "n_gt": len(gts),
                "metrics": metrics,
            }
        )

        print(f"✓ {img_path.stem}: F1 {metrics['overall_f1']:.4f}")
        time.sleep(1)  # Rate limit

    # Compute overall metrics
    if f1_scores:
        overall_f1 = sum(f1_scores) / len(f1_scores)
        results["summary"]["overall_f1"] = round(overall_f1, 4)

    print(f"\n{'='*60}")
    print(f"GPT-4V Overall F1: {results['summary']['overall_f1']:.4f}")
    print(f"{'='*60}\n")

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
