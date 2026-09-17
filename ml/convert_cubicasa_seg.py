"""Convert CubiCasa5k SVG annotations to segmentation masks.

Days 2-3 of docs/corbel-custom-geometry-model-plan.md: rasterizes wall/door/
window polygon geometry into per-class binary masks at source (F1_scaled.png)
resolution, preserving the exact frozen train/val/test split already used
throughout the detector investigation. The split membership is read directly
from datasets/dataset/images/{split}/*.png filenames (produced by
convert_cubicasa.py's earlier run) rather than regenerated -- this makes
train/test leakage structurally impossible as long as those three
directories stay disjoint, which is asserted below.

Geometry extraction (classify() / points detection) mirrors
convert_cubicasa.py's extract_boxes() exactly -- verified in the Day 1 audit
(100% polygon coverage, 0% under a non-identity transform, coordinate
mapping confirmed correct by visual overlay across 3 different sample
types) -- but rasterizes full polygons instead of bounding boxes.

Output layout:
  ml/dataset_seg/
    images/{train,val,test}/<style>_<id>.png   (copy of F1_scaled.png, RGB)
    masks/{train,val,test}/<style>_<id>.png    (RGB: R=wall, G=door, B=window,
                                                 0/255 per channel, multi-label
                                                 -- channels can overlap, e.g.
                                                 a door polygon sits inside
                                                 its wall's opening)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from lxml import etree
from PIL import Image, ImageDraw
from tqdm import tqdm

RAW_ROOT = Path(__file__).parent / "cubicasa5k" / "cubicasa5k"
SPLIT_SOURCE = Path(__file__).parent.parent / "datasets" / "dataset" / "images"
OUT_ROOT = Path(__file__).parent / "dataset_seg"

CLASS_CHANNEL = {"wall": 0, "door": 1, "window": 2}  # R, G, B

CLASS_PATTERNS = {
    "wall": re.compile(r"\bwall\b", re.I),
    "door": re.compile(r"\bdoor\b", re.I),
    "window": re.compile(r"\bwindow\b", re.I),
}

POINT_RE = re.compile(r"[-+]?\d*\.?\d+")


def classify(el: etree._Element) -> str | None:
    haystack = " ".join(filter(None, [el.get("id", ""), el.get("class", "")]))
    for name, pattern in CLASS_PATTERNS.items():
        if pattern.search(haystack):
            return name
    return None


def parse_points(points_attr: str) -> list[tuple[float, float]] | None:
    nums = [float(n) for n in POINT_RE.findall(points_attr)]
    if len(nums) < 6:
        return None
    return list(zip(nums[0::2], nums[1::2]))


def extract_polygons(svg_path: Path) -> dict[str, list[list[tuple[float, float]]]]:
    tree = etree.parse(str(svg_path))
    root = tree.getroot()
    polys: dict[str, list[list[tuple[float, float]]]] = {"wall": [], "door": [], "window": []}
    for el in root.iter():
        name = classify(el)
        if name is None:
            continue
        candidates = [el] if el.get("points") else list(el)
        for cand in candidates:
            points = cand.get("points")
            if not points:
                continue
            pts = parse_points(points)
            if pts is None:
                continue
            polys[name].append(pts)
    return polys


def rasterize(polys: dict[str, list[list[tuple[float, float]]]], w: int, h: int) -> Image.Image:
    channels = []
    for name in ("wall", "door", "window"):
        mask = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(mask)
        for pts in polys[name]:
            draw.polygon(pts, fill=255)
        channels.append(mask)
    return Image.merge("RGB", channels)


def load_split_ids(split: str) -> list[tuple[str, str]]:
    img_dir = SPLIT_SOURCE / split
    if not img_dir.exists():
        print(f"error: {img_dir} missing -- run ml/convert_cubicasa.py first to establish the frozen split", file=sys.stderr)
        sys.exit(1)
    ids = []
    for p in sorted(img_dir.glob("*.png")):
        style, _, sample_id = p.stem.rpartition("_")
        ids.append((style, sample_id))
    return ids


def assert_no_leakage(all_splits: dict[str, list[tuple[str, str]]]) -> None:
    seen: dict[tuple[str, str], str] = {}
    for split, ids in all_splits.items():
        for key in ids:
            if key in seen:
                raise RuntimeError(f"split leakage: {key} appears in both {seen[key]} and {split}")
            seen[key] = split


def convert_split(split: str, ids: list[tuple[str, str]], out_root: Path) -> tuple[int, int]:
    img_out = out_root / "images" / split
    mask_out = out_root / "masks" / split
    img_out.mkdir(parents=True, exist_ok=True)
    mask_out.mkdir(parents=True, exist_ok=True)

    converted = skipped = 0
    for style, sample_id in tqdm(ids, desc=split):
        sample_dir = RAW_ROOT / style / sample_id
        svg = sample_dir / "model.svg"
        png = sample_dir / "F1_scaled.png"
        if not svg.exists() or not png.exists():
            skipped += 1
            continue

        with Image.open(png) as im:
            im = im.convert("RGB")
            w, h = im.size

        polys = extract_polygons(svg)
        if not any(polys.values()):
            skipped += 1
            continue

        stem = f"{style}_{sample_id}"
        im.save(img_out / f"{stem}.png")
        rasterize(polys, w, h).save(mask_out / f"{stem}.png")
        converted += 1

    return converted, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT_ROOT)
    args = parser.parse_args()

    all_ids = {split: load_split_ids(split) for split in ("train", "val", "test")}
    assert_no_leakage(all_ids)
    print(f"split sizes: " + ", ".join(f"{s}={len(ids)}" for s, ids in all_ids.items()))

    totals = {}
    for split, ids in all_ids.items():
        totals[split] = convert_split(split, ids, args.out)

    for split, (converted, skipped) in totals.items():
        print(f"{split}: {converted} converted, {skipped} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
