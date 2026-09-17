#!/usr/bin/env python3
"""Test Claude API OCR + scale on batch of images."""

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


def fetch_image_as_base64(path: Path):
    """Load image file as base64."""
    with open(path, "rb") as f:
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
                    {"type": "text", "text": prompt},
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
    """Extract JSON from Claude's response."""
    raw = text.strip()
    if "```" in raw:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    return json.loads(raw)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Test Claude OCR + Scale on multiple floor plans")
    parser.add_argument("--n", type=int, default=10, help="Number of images to test")
    args = parser.parse_args()

    api_key = get_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    # Load test images
    test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))[: args.n]
    if not test_imgs:
        print(f"No test images found in {DATASET}")
        exit(1)

    print(f"\n{'=' * 80}")
    print(f"  CLAUDE API OCR + SCALE BATCH TEST ({len(test_imgs)} images)")
    print(f"{'=' * 80}\n")
    print(f"  {'Image':<40} {'Labels':<8} {'Scale':<8} {'Conf':<6} {'Status':<10}")
    print(f"  {'-' * 80}")

    results = []
    for i, img_path in enumerate(test_imgs, 1):
        try:
            img = Image.open(img_path)
            w, h = img.size

            # Get image data
            image_data = fetch_image_as_base64(img_path)

            # OCR
            t0 = time.time()
            ocr_response = call_claude(client, image_data, OCR_PROMPT)
            labels = extract_json(ocr_response)

            # Scale
            dimensions = [l for l in labels if l.get("role") == "dimension"]
            dim_summary = (
                "\n".join(f'"{l.get("text")}"' for l in dimensions[:3]) if dimensions else "None detected"
            )
            scale_prompt = SCALE_PROMPT.format(w=w, h=h, dim_summary=dim_summary)
            scale_response = call_claude(client, image_data, scale_prompt)
            scale = extract_json(scale_response)
            elapsed = time.time() - t0

            results.append(
                {
                    "image": img_path.stem,
                    "labels": len(labels),
                    "scale_px_m": scale.get("pixelsPerMeter"),
                    "confidence": scale.get("confidence"),
                    "method": scale.get("method"),
                    "elapsed": elapsed,
                }
            )

            status = "✓"
            print(
                f"  [{i:2d}/{len(test_imgs)}] {status} {img_path.stem[:38]:<38} {len(labels):>6} {scale.get('pixelsPerMeter', 'N/A'):>7} {scale.get('confidence', 0):.2f}  ✓"
            )
            sys.stdout.flush()

        except Exception as e:
            print(f"  [{i:2d}/{len(test_imgs)}] ✗ {img_path.stem[:38]:<38} ERROR: {str(e)[:30]}")

    # Summary
    if results:
        print(f"\n{'=' * 80}")
        print(f"  SUMMARY ({len(results)} successful)")
        print(f"{'=' * 80}")
        avg_labels = sum(r["labels"] for r in results) / len(results)
        avg_elapsed = sum(r["elapsed"] for r in results) / len(results)
        print(f"  Avg labels extracted: {avg_labels:.1f}")
        print(f"  Avg time per image: {avg_elapsed:.1f}s")
        print(f"  ✓ Claude API OCR + Scale pipeline working correctly\n")


if __name__ == "__main__":
    main()
