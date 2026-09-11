import numpy as np
from PIL import Image

from app.tiling import blend_tiled_probability


def test_tiled_g0_blends_overlapping_source_tiles_without_gaps():
    calls = 0

    def infer_probability(_):
        nonlocal calls
        calls += 1
        return np.full((64, 64), 0.5, dtype=np.float32)

    source = Image.new("RGB", (900, 500), "white")
    probability = blend_tiled_probability(
        source,
        64,
        {"tileSizePx": 400, "overlapPx": 100, "blendWeight": 1.0},
        np.zeros((500, 900), dtype=np.float32),
        infer_probability,
    )

    assert calls == 6
    assert probability.shape == (500, 900)
    assert np.allclose(probability, 0.5)
