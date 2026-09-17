#!/usr/bin/env python3
"""Debug benchmark script to see what's happening with box extraction."""

import base64
import json
import os
import sys
import time
from pathlib import Path

try:
    import anthropic
    from PIL import Image
except ImportError:
    print("Error: anthropic and/or Pillow not installed.")
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


class Box:
    def __init__(self, cls, conf, x0, y0, x1, y1):
        self.cls = cls
        self.conf = conf
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1

    def __repr__(self):
        return f"Box(cls={self.cls}, conf={self.conf}, x0={self.x0}, y0={self.y0}, x1={self.x1}, y1={self.y1})"


def run_claude_vision_api(img_path, client):
    """Call real Claude Vision API and debug."""
    img = Image.open(img_path)
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
    print(f"\n📝 Raw response (first 500 chars):\n{text[:500]}")

    raw = text.strip()
    if "```" in raw:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
            print(f"\n✓ Extracted from markdown fence")

    print(f"\n🔍 Extracted JSON (first 500 chars):\n{raw[:500]}")

    try:
        data = json.loads(raw)
        print(f"\n✓ JSON loaded successfully")
    except json.JSONDecodeError as e:
        print(f"\n✗ JSON parse failed: {e}")
        return [], latency_ms

    detections = data.get("detections", [])
    print(f"📊 Found {len(detections)} raw detections")

    boxes = []
    for i, d in enumerate(detections):
        name = str(d.get("cls", "")).lower()
        if name not in CLASS_TO_ID:
            print(f"  ⚠️  Detection {i}: Unknown class '{name}'")
            continue
        try:
            x0, y0, x1, y1 = float(d["x0"]), float(d["y0"]), float(d["x1"]), float(d["y1"])
            if x0 < x1 and y0 < y1:
                box = Box(CLASS_TO_ID[name], float(d.get("confidence", 0.7)), x0, y0, x1, y1)
                boxes.append(box)
                print(f"  ✓ Detection {i}: {name} - {box}")
            else:
                print(f"  ✗ Detection {i}: Invalid box coords (x0={x0}, y0={y0}, x1={x1}, y1={y1})")
        except (KeyError, ValueError) as e:
            print(f"  ✗ Detection {i}: Error parsing - {e}")

    print(f"\n✓ Successfully extracted {len(boxes)} valid boxes")
    return boxes, latency_ms


api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    print("ERROR: ANTHROPIC_API_KEY not set")
    sys.exit(1)

client = anthropic.Anthropic(api_key=api_key)

# Test with first image
test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))
if test_imgs:
    print(f"Testing with: {test_imgs[0].name}")
    boxes, latency = run_claude_vision_api(test_imgs[0], client)
    print(f"\n⏱️  Latency: {latency:.0f}ms")
