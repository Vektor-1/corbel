#!/usr/bin/env python3
"""Debug F1 matching logic."""

import base64
import json
import os
from pathlib import Path
from PIL import Image

try:
    import anthropic
except ImportError:
    print("Error: anthropic not installed")
    exit(1)

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


class Box:
    def __init__(self, cls, conf, x0, y0, x1, y1):
        self.cls = cls
        self.conf = conf
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1

    def __repr__(self):
        return f"Box(cls={CLASSES[self.cls]}, conf={self.conf:.2f}, x0={self.x0:.0f}, y0={self.y0:.0f}, x1={self.x1:.0f}, y1={self.y1:.0f})"


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


# Get test image
test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))
img_path = test_imgs[0]
label_path = DATASET / "labels" / "test" / f"{img_path.stem}.txt"

print(f"Testing with: {img_path.name}")

# Load image and ground truth
img = Image.open(img_path)
w, h = img.size
gts = read_yolo_labels(label_path, w, h)

print(f"Image size: {w}x{h}")
print(f"Ground truth: {len(gts)} boxes")

# Get predictions from Claude
buf = __import__("io").BytesIO()
img.convert("RGB").save(buf, format="PNG")
buf.seek(0)
image_data = base64.standard_b64encode(buf.read()).decode("utf-8")

prompt = CLAUDE_PROMPT.format(w=w, h=h)
api_key = os.environ.get("ANTHROPIC_API_KEY")

if not api_key:
    print("ERROR: ANTHROPIC_API_KEY not set")
    exit(1)

client = anthropic.Anthropic(api_key=api_key)
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

text = message.content[0].text if message.content else ""
raw = text.strip()
if "```" in raw:
    import re
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if m:
        raw = m.group(1).strip()

try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"ERROR: JSON parse failed: {e}")
    exit(1)

# Extract boxes
detections = data.get("detections", [])
preds = []
for d in detections:
    name = str(d.get("cls", "")).lower()
    if name not in CLASS_TO_ID:
        continue
    try:
        x0, y0, x1, y1 = float(d["x0"]), float(d["y0"]), float(d["x1"]), float(d["y1"])
        if x0 < x1 and y0 < y1:
            preds.append(Box(CLASS_TO_ID[name], float(d.get("confidence", 0.7)), x0, y0, x1, y1))
    except (KeyError, ValueError):
        pass

print(f"Predictions: {len(preds)} boxes")

# Compute F1 for each class
print(f"\n{'Class':<10} {'TP':<5} {'FP':<5} {'FN':<5} {'Precision':<10} {'Recall':<10} {'F1':<10}")
print("-" * 70)

for cls_id, name in enumerate(CLASSES):
    p = sorted([b for b in preds if b.cls == cls_id], key=lambda b: -b.conf)
    g = [b for b in gts if b.cls == cls_id]

    print(f"{name:<10} {len(p):>2} pred, {len(g):>2} gt")

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
        if best_j >= 0 and best_iou >= 0.5:
            matched_g.add(best_j)
            tp += 1
            if tp <= 3:
                print(f"  ✓ TP: pred[{pb}] matches gt[{g[best_j]}] IoU={best_iou:.3f}")
        else:
            if len(p) <= 10 or tp == 0:
                print(f"  ✗ FP: pred[{pb}] no match (best_iou={best_iou:.3f})")

    fp = len(p) - tp
    fn = len(g) - tp
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    print(f"{name:<10} {tp:<5} {fp:<5} {fn:<5} {precision:<10.4f} {recall:<10.4f} {f1:<10.4f}")
    print()
