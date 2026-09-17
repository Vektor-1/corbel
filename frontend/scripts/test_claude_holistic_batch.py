#!/usr/bin/env python3
"""Benchmark Claude Holistic Detection vs YOLO on floor plans."""

import base64
import json
import os
import sys
import time
from pathlib import Path
from PIL import Image

try:
    import anthropic
except ImportError:
    print("Error: anthropic not installed")
    exit(1)

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")

HOLISTIC_PROMPT = """You are a floor plan analysis engine. Extract the complete architectural structure from this floor plan image.

Return ONLY valid JSON (no markdown, no prose, no code blocks):
{
  "walls": [
    {"id": "w1", "start": [x1, y1], "end": [x2, y2], "thickness_px": 10, "role": "loadBearing", "confidence": 0.95}
  ],
  "doors": [
    {"id": "d1", "wall_id": "w1", "position_along_wall": 0.3, "width_px": 36, "swing": "left", "confidence": 0.85}
  ],
  "windows": [
    {"id": "wn1", "wall_id": "w1", "position_along_wall": 0.6, "width_px": 48, "confidence": 0.80}
  ],
  "rooms": [
    {"id": "r1", "name": "Bedroom", "bounded_by": ["w1", "w2", "w3"], "centroid": [250, 200], "area_px2": 45000, "confidence": 0.88}
  ]
}

RULES:
1. STRUCTURE-FIRST: walls first, rooms reference walls, openings attach to walls
2. Walls: line segments with start/end points, thickness in px
3. Doors/Windows: MUST reference wall_id, position_along_wall 0.0-1.0
4. Rooms: MUST list bounding wall IDs, must form closed loops
5. All coordinates in image pixels, origin top-left
6. Confidence 0.5-1.0
7. Return ONLY JSON"""


class Box:
    def __init__(self, cls, conf, x0, y0, x1, y1):
        self.cls = cls
        self.conf = conf
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1


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


def read_yolo_labels(path: Path, width: int, height: int):
    boxes = []
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


def fetch_image_as_base64(path: Path):
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return {"data": data, "mediaType": "image/png"}


def call_claude_holistic(client, image_data, prompt: str):
    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_data["data"],
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        system="You are a floor plan analysis engine. Respond with pure JSON only — no prose, no markdown code blocks.",
    )
    text = ""
    for block in message.content:
        if hasattr(block, "text"):
            text = block.text
            break
    if not text:
        raise ValueError("Claude returned no text")
    return text


def extract_json(text: str):
    raw = text.strip()
    if "```" in raw:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    return json.loads(raw)


def holistic_output_to_boxes(output, width, height):
    """Convert holistic JSON output to Box objects for comparison."""
    boxes = []

    # Walls
    for w in output.get("walls", []):
        x0, y0 = w["start"]
        x1, y1 = w["end"]
        # Ensure x0 < x1, y0 < y1
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        # Add thickness to make box
        thickness = w.get("thickness_px", 10) / 2
        y0 -= thickness
        y1 += thickness
        boxes.append(Box(0, w.get("confidence", 0.7), x0, y0, x1, y1))

    # Doors
    for d in output.get("doors", []):
        wall_id = d.get("wall_id")
        walls = output.get("walls", [])
        wall = next((w for w in walls if w.get("id") == wall_id), None)
        if wall:
            # Rough approximation: place door on wall
            x0, y0 = wall["start"]
            x1, y1 = wall["end"]
            pos = d.get("position_along_wall", 0.5)
            door_x = x0 + (x1 - x0) * pos
            door_y = y0 + (y1 - y0) * pos
            door_w = d.get("width_px", 36)
            boxes.append(Box(1, d.get("confidence", 0.7), door_x - door_w / 2, door_y - 20, door_x + door_w / 2, door_y + 20))

    # Windows
    for wn in output.get("windows", []):
        wall_id = wn.get("wall_id")
        walls = output.get("walls", [])
        wall = next((w for w in walls if w.get("id") == wall_id), None)
        if wall:
            x0, y0 = wall["start"]
            x1, y1 = wall["end"]
            pos = wn.get("position_along_wall", 0.5)
            wn_x = x0 + (x1 - x0) * pos
            wn_y = y0 + (y1 - y0) * pos
            wn_w = wn.get("width_px", 48)
            boxes.append(Box(2, wn.get("confidence", 0.7), wn_x - wn_w / 2, wn_y - 15, wn_x + wn_w / 2, wn_y + 15))

    return boxes


def match_f1(preds, gts, iou_thr=0.5):
    per = {}
    f1s = []
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


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Benchmark Claude Holistic Detection on floor plans")
    parser.add_argument("--n", type=int, default=10, help="Number of images to test")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))[: args.n]
    if not test_imgs:
        print(f"No test images in {DATASET}")
        exit(1)

    print(f"\n{'=' * 80}")
    print(f"  CLAUDE HOLISTIC DETECTION BENCHMARK ({len(test_imgs)} images)")
    print(f"{'=' * 80}\n")
    print(f"  {'Image':<40} {'F1':<8} {'Wall':<8} {'Door':<8} {'Window':<8} {'Time':<8}")
    print(f"  {'-' * 80}")

    results = []
    for i, img_path in enumerate(test_imgs, 1):
        try:
            img = Image.open(img_path)
            w, h = img.size

            label_path = DATASET / "labels" / "test" / f"{img_path.stem}.txt"
            gts = read_yolo_labels(label_path, w, h)

            # Get holistic detection
            image_data = fetch_image_as_base64(img_path)
            t0 = time.time()
            response = call_claude_holistic(client, image_data, HOLISTIC_PROMPT)
            output = extract_json(response)
            elapsed = time.time() - t0

            # Convert to boxes
            preds = holistic_output_to_boxes(output, w, h)

            # Compute F1
            metrics = match_f1(preds, gts, iou_thr=0.5)

            results.append({
                "id": img_path.stem,
                "f1": metrics["overall_f1"],
                "wall_f1": metrics["per_class"]["wall"]["f1"],
                "door_f1": metrics["per_class"]["door"]["f1"],
                "window_f1": metrics["per_class"]["window"]["f1"],
                "elapsed": elapsed,
            })

            status = "✓" if metrics["overall_f1"] >= 0.75 else "⚠" if metrics["overall_f1"] >= 0.60 else "✗"
            print(
                f"  [{i:2d}/{len(test_imgs)}] {status} {img_path.stem[:38]:<38} {metrics['overall_f1']:.4f}   {metrics['per_class']['wall']['f1']:.4f}  {metrics['per_class']['door']['f1']:.4f}  {metrics['per_class']['window']['f1']:.4f}  {elapsed:6.1f}s"
            )
            sys.stdout.flush()

        except Exception as e:
            print(f"  [{i:2d}/{len(test_imgs)}] ✗ {img_path.stem[:38]:<38} ERROR: {str(e)[:40]}")

    if results:
        print(f"\n{'=' * 80}")
        print(f"  SUMMARY ({len(results)} successful)")
        print(f"{'=' * 80}")
        avg_f1 = sum(r["f1"] for r in results) / len(results)
        avg_wall = sum(r["wall_f1"] for r in results) / len(results)
        avg_door = sum(r["door_f1"] for r in results) / len(results)
        avg_window = sum(r["window_f1"] for r in results) / len(results)
        avg_time = sum(r["elapsed"] for r in results) / len(results)
        print(f"  Overall F1:  {avg_f1:.4f}")
        print(f"  Wall F1:     {avg_wall:.4f}")
        print(f"  Door F1:     {avg_door:.4f}")
        print(f"  Window F1:   {avg_window:.4f}")
        print(f"  Avg time:    {avg_time:.1f}s/image")
        print(f"\n  ✓ Claude Holistic Detection benchmark complete\n")


if __name__ == "__main__":
    main()
