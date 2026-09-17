"""Source-space overlap tiling for high-resolution segmentation inference."""
from collections.abc import Callable

import cv2
import numpy as np
from PIL import Image


def tile_origins(length: int, tile_size: int, overlap: int) -> list[int]:
    if length <= tile_size:
        return [0]
    stride = tile_size - overlap
    starts = list(range(0, length - tile_size + 1, stride))
    last = length - tile_size
    if starts[-1] != last:
        starts.append(last)
    return starts


def blend_tiled_probability(
    source: Image.Image,
    input_size: int,
    config: dict,
    global_probability: np.ndarray,
    infer_probability: Callable[[np.ndarray], np.ndarray],
) -> np.ndarray:
    """Blend overlapping tile probabilities, preserving full-plan context."""
    tile_size, overlap = config["tileSizePx"], config["overlapPx"]
    weight = float(config["blendWeight"])
    width, height = source.size
    if max(width, height) <= tile_size:
        return global_probability

    accumulated = np.zeros((height, width), dtype=np.float32)
    accumulated_weight = np.zeros((height, width), dtype=np.float32)
    ramp = np.hanning(tile_size).astype(np.float32)
    tile_weight = np.maximum(0.05, np.outer(ramp, ramp))
    for y in tile_origins(height, tile_size, overlap):
        for x in tile_origins(width, tile_size, overlap):
            tile = source.crop((x, y, x + tile_size, y + tile_size)).resize((input_size, input_size), Image.Resampling.BILINEAR)
            tile_input = np.asarray(tile).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
            probability = infer_probability(tile_input)
            probability = cv2.resize(probability.astype(np.float32), (tile_size, tile_size), interpolation=cv2.INTER_LINEAR)
            valid_width, valid_height = min(tile_size, width - x), min(tile_size, height - y)
            accumulated[y:y + valid_height, x:x + valid_width] += probability[:valid_height, :valid_width] * tile_weight[:valid_height, :valid_width]
            accumulated_weight[y:y + valid_height, x:x + valid_width] += tile_weight[:valid_height, :valid_width]

    tiled_probability = accumulated / np.maximum(accumulated_weight, 1e-6)
    return (1 - weight) * global_probability + weight * tiled_probability
