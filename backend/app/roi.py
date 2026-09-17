"""Conservative plan-region proposals for drawing-sheet diagnostics."""
from math import sqrt

import cv2
import numpy as np
from PIL import Image


def propose_plan_regions(image: Image.Image, max_candidates: int = 5) -> dict:
    """Return ranked ink regions without cropping or altering inference input."""
    gray = np.asarray(image.convert("L"))
    ink = (gray < 220).astype(np.uint8)
    height, width = ink.shape
    kernel_size = max(5, min(31, round(min(width, height) * 0.015)))
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    grouped = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel)
    count, _, stats, _ = cv2.connectedComponentsWithStats(grouped, connectivity=8)
    candidates = []
    for index in range(1, count):
        x, y, candidate_width, candidate_height, _ = stats[index]
        area = candidate_width * candidate_height
        if area < width * height * 0.02:
            continue
        original = ink[y:y + candidate_height, x:x + candidate_width]
        density = float(original.mean())
        score = density * sqrt(area / (width * height))
        candidates.append({
            "x": int(x), "y": int(y), "width": int(candidate_width), "height": int(candidate_height),
            "inkDensity": round(density, 3), "score": round(score, 4),
        })
    candidates.sort(key=lambda item: item["score"], reverse=True)
    candidates = candidates[:max_candidates]
    ambiguous = len(candidates) > 1 and candidates[1]["score"] >= candidates[0]["score"] * 0.9
    return {
        "mode": "shadow",
        "candidates": candidates,
        "selected": candidates[0] if candidates and not ambiguous else None,
        "ambiguous": ambiguous,
    }
