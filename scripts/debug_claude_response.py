#!/usr/bin/env python3
"""Debug Claude Vision API responses."""

import base64
import json
import os
import sys
from pathlib import Path

try:
    import anthropic
    from PIL import Image
except ImportError:
    print("Error: anthropic and/or Pillow not installed.")
    sys.exit(1)

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")

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

# Get first test image
test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))
if not test_imgs:
    print("No test images found")
    sys.exit(1)

img_path = test_imgs[0]
print(f"Testing with: {img_path}")

img = Image.open(img_path)
w, h = img.size
print(f"Image size: {w}x{h}")

# Encode image
buf = __import__("io").BytesIO()
img.convert("RGB").save(buf, format="PNG")
buf.seek(0)
image_data = base64.standard_b64encode(buf.read()).decode("utf-8")

prompt = CLAUDE_PROMPT.format(w=w, h=h)

api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    print("ERROR: ANTHROPIC_API_KEY not set")
    sys.exit(1)

client = anthropic.Anthropic(api_key=api_key)

print("\nSending request to Claude Haiku 4.5...")
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
print(f"\nRaw response ({len(text)} chars):")
print("-" * 80)
print(text[:1000] if len(text) > 1000 else text)
print("-" * 80)

# Try to extract JSON
raw = text.strip()
if "```" in raw:
    import re
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if m:
        raw = m.group(1).strip()

try:
    data = json.loads(raw)
    print(f"\n✓ JSON parsed successfully")
    print(f"  Detections count: {len(data.get('detections', []))}")
    if data.get('detections'):
        print(f"  First detection: {data['detections'][0]}")
except json.JSONDecodeError as e:
    print(f"\n✗ JSON parse failed: {e}")
    print(f"  Attempted to parse: {raw[:200]}")
