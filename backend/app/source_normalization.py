"""Normalize image and PDF uploads into a deterministic ML raster view."""
from dataclasses import dataclass
from pathlib import Path

from PIL import Image
from .roi import propose_plan_regions


PDF_RENDER_DPI = 300


@dataclass
class NormalizedSource:
    image: Image.Image
    metadata: dict


def _vector_inventory(page) -> dict:
    drawings = page.get_cdrawings()
    line_segments = sum(sum(1 for item in path.get("items", []) if item[0] == "l") for path in drawings)
    return {"drawingPathCount": len(drawings), "lineSegmentCount": line_segments}


def normalize_source(path: Path, source_kind: str, page_index: int = 0) -> NormalizedSource:
    if source_kind == "image":
        image = Image.open(path).convert("RGB")
        return NormalizedSource(image, {"kind": "image", "coordinateTransform": {"kind": "pixel-identity"}, "roi": propose_plan_regions(image)})
    if source_kind != "pdf":
        raise ValueError(f"Unsupported source kind: {source_kind}")
    try:
        import fitz
    except ImportError as error:
        raise RuntimeError("PDF normalization requires PyMuPDF in the worker image.") from error
    document = fitz.open(path)
    try:
        if not 0 <= page_index < document.page_count:
            raise ValueError("Requested PDF page is unavailable.")
        page = document[page_index]
        scale = PDF_RENDER_DPI / 72
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        return NormalizedSource(image, {
            "kind": "pdf",
            "pageIndex": page_index,
            "pageCount": document.page_count,
            "renderDpi": PDF_RENDER_DPI,
            "vectorInventory": _vector_inventory(page),
            "coordinateTransform": {
                "kind": "pdf-points-to-pixels",
                "scale": scale,
                "pageOrigin": {"x": page.rect.x0, "y": page.rect.y0},
                "rotation": page.rotation,
            },
            "roi": propose_plan_regions(image),
        })
    finally:
        document.close()
