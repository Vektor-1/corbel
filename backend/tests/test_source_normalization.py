from pathlib import Path

from PIL import Image

from app.source_normalization import normalize_source


def test_image_normalization_preserves_pixel_geometry(tmp_path: Path):
    path = tmp_path / "plan.png"
    Image.new("RGB", (320, 180), "white").save(path)
    normalized = normalize_source(path, "image")
    assert normalized.image.size == (320, 180)
    assert normalized.metadata["kind"] == "image"
    assert normalized.metadata["coordinateTransform"] == {"kind": "pixel-identity"}
    assert normalized.metadata["roi"]["mode"] == "shadow"
