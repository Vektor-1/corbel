#!/usr/bin/env python3
"""Visualize predictions vs ground truth."""

import base64
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw

try:
    import anthropic
except ImportError:
    print("Error: anthropic not installed")
    exit(1)

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}
COLORS = {"wall": "red", "door": "green", "window": "blue"}

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

# Load image and ground truth
img = Image.open(img_path)
w, h = img.size
gts = read_yolo_labels(label_path, w, h)

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
    print(f"ERROR: JSON parse failed")
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

# Draw ground truth
img_gt = img.convert("RGB").copy()
draw_gt = ImageDraw.Draw(img_gt, "RGBA")
for gt in gts:
    cls_name = CLASSES[gt.cls]
    color = COLORS[cls_name]
    draw_gt.rectangle(
        [(gt.x0, gt.y0), (gt.x1, gt.y1)],
        outline=color,
        width=2,
    )

img_gt.save("/tmp/gt_boxes.png")
print(f"✓ Ground truth visualization saved to /tmp/gt_boxes.png")

# Draw predictions
img_pred = img.convert("RGB").copy()
draw_pred = ImageDraw.Draw(img_pred, "RGBA")
for pred in preds:
    cls_name = CLASSES[pred.cls]
    color = COLORS[cls_name]
    draw_pred.rectangle(
        [(pred.x0, pred.y0), (pred.x1, pred.y1)],
        outline=color,
        width=2,
    )

img_pred.save("/tmp/pred_boxes.png")
print(f"✓ Prediction visualization saved to /tmp/pred_boxes.png")

print(f"\nImage: {img_path.name} ({w}x{h})")
print(f"Ground truth: {len(gts)} boxes")
print(f"Predictions: {len(preds)} boxes")

# Sample boxes
print(f"\nFirst 3 ground truth boxes:")
for gt in gts[:3]:
    print(f"  {CLASSES[gt.cls]}: x0={gt.x0:.0f}, y0={gt.y0:.0f}, x1={gt.x1:.0f}, y1={gt.y1:.0f}")

print(f"\nFirst 3 predicted boxes:")
for pred in preds[:3]:
    print(f"  {CLASSES[pred.cls]}: x0={pred.x0:.0f}, y0={pred.y0:.0f}, x1={pred.x1:.0f}, y1={pred.y1:.0f}")
