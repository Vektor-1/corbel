#!/usr/bin/env python3
"""Test Claude API for OCR and scale calibration (not detection)."""

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

# Prompts from pipeline.ts

OCR_PROMPT = """This is a floor plan image. Extract all visible text annotations.
Return a JSON array:
[{
  "id": "l1",
  "text": "<exact text as written>",
  "x": <pixel x of text centre>,
  "y": <pixel y of text centre>,
  "role": "room-name" | "dimension" | "note",
  "valueMm": <numeric value in mm if role is dimension, else omit>
}]

Rules:
- room-name: labels inside rooms (e.g. BEDROOM, KITCHEN, LIVING ROOM).
- dimension: numbers with units or tick marks (e.g. 3600, 4500).
- note: everything else (e.g. SKETCH PLAN, Fig 2, W, D symbols).
- Omit W/D/WC single-letter symbols — they are door/window markers.
- Return only the JSON array."""

SCALE_PROMPT = """This is a floor plan image ({w}x{h}px).

Dimension text found by OCR:
{dim_summary}

Estimate the scale (pixels per meter). Return a JSON object:
{{
  "pixelsPerMeter": <number>,
  "confidence": <0.0-1.0>,
  "method": "dimension-ocr" | "scale-bar" | "manual",
  "notes": "<brief explanation>"
}}

Rules:
- Use dimension annotations to compute pixels/meter where possible.
- If a dimension says 3600mm and spans X pixels, pixelsPerMeter = X/3.6.
- Typical residential rooms are 3000-5000mm wide.
- If unsure, estimate based on typical room sizes and return low confidence.
- Return only the JSON object."""


def get_api_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        exit(1)
    return key


def fetch_image_as_base64(url: str):
    """Load local image file as base64."""
    with open(url, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return {"data": data, "mediaType": "image/png"}


def call_claude(client, image_data, prompt: str):
    """Call Claude API with image and prompt."""
    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=4096,
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
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        system="You are a floor plan analysis engine. Respond with pure JSON only — no prose, no markdown code blocks, no fenced code blocks.",
    )
    # Handle ThinkingBlock and TextBlock
    text = ""
    for block in message.content:
        if hasattr(block, "text"):
            text = block.text
            break
    if not text:
        raise ValueError("Claude returned no text")
    return text


def extract_json(text: str):
    """Extract JSON from Claude's response, handling markdown fences."""
    raw = text.strip()
    if "```" in raw:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Failed to parse: {raw[:200]}")
        raise e


# Test with first image
test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))
if not test_imgs:
    print("No test images found")
    exit(1)

img_path = test_imgs[0]
print(f"Testing with: {img_path.name}")

img = Image.open(img_path)
w, h = img.size
print(f"Image size: {w}x{h}\n")

# Create client
api_key = get_api_key()
client = anthropic.Anthropic(api_key=api_key)

# Test 1: OCR
print("=" * 70)
print("TEST 1: OCR - Extract text labels")
print("=" * 70)

image_data = fetch_image_as_base64(str(img_path))
try:
    ocr_response = call_claude(client, image_data, OCR_PROMPT)
    labels = extract_json(ocr_response)
    print(f"✓ Successfully extracted {len(labels)} labels")
    print(f"\nFirst 5 labels:")
    for label in labels[:5]:
        print(f"  - {label.get('role', 'unknown')}: '{label.get('text', 'N/A')}' at ({label.get('x', 0)}, {label.get('y', 0)})")

    # Test 2: Scale calibration
    print("\n" + "=" * 70)
    print("TEST 2: Scale calibration")
    print("=" * 70)

    # Filter to dimension labels
    dimensions = [l for l in labels if l.get("role") == "dimension"]
    dim_summary = (
        "\n".join(f'"{l.get("text", "N/A")}" at ({l.get("x", 0)},{l.get("y", 0)})' for l in dimensions)
        if dimensions
        else "None detected"
    )

    scale_prompt = SCALE_PROMPT.format(w=w, h=h, dim_summary=dim_summary)
    scale_response = call_claude(client, image_data, scale_prompt)
    scale_result = extract_json(scale_response)

    print(f"✓ Scale calibration result:")
    print(f"  Pixels per meter: {scale_result.get('pixelsPerMeter', 'N/A')}")
    print(f"  Confidence: {scale_result.get('confidence', 'N/A')}")
    print(f"  Method: {scale_result.get('method', 'N/A')}")
    print(f"  Notes: {scale_result.get('notes', 'N/A')}")

    print(f"\n✓ Claude API OCR + Scale pipeline WORKS")

except Exception as e:
    print(f"\n✗ Error: {e}")
    exit(1)
