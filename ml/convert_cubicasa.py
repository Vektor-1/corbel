"""Convert CubiCasa5k SVG annotations to YOLO detection format.

CubiCasa5k layout (after unzip):
  cubicasa5k/
    high_quality_architectural/<id>/{F1_scaled.png, model.svg}
    high_quality/<id>/...
    colorful/<id>/...
    train.txt / val.txt / test.txt   (relative sample paths)

YOLO output layout:
  ml/dataset/
    images/{train,val,test}/<id>.png
    labels/{train,val,test}/<id>.txt   (class cx cy w h, normalised)

Classes: 0=wall, 1=door, 2=window
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

from lxml import etree
from PIL import Image
from tqdm import tqdm

CLASSES = {"wall": 0, "door": 1, "window": 2}

# CubiCasa5k SVG marks elements with id/class attributes such as
# "Wall", "Door", "Window" on <g> or polygon elements.
CLASS_PATTERNS = {
    "wall": re.compile(r"\bwall\b", re.I),
    "door": re.compile(r"\bdoor\b", re.I),
    "window": re.compile(r"\bwindow\b", re.I),
}

POINT_RE = re.compile(r"[-+]?\d*\.?\d+")


def polygon_bbox(points_attr: str) -> tuple[float, float, float, float] | None:
    nums = [float(n) for n in POINT_RE.findall(points_attr)]
    if len(nums) < 6:
        return None
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def classify(el: etree._Element) -> str | None:
    haystack = " ".join(filter(None, [el.get("id", ""), el.get("class", "")]))
    for name, pattern in CLASS_PATTERNS.items():
        if pattern.search(haystack):
            return name
    return None


def extract_boxes(svg_path: Path) -> list[tuple[int, float, float, float, float]]:
    tree = etree.parse(str(svg_path))
    root = tree.getroot()
    boxes: list[tuple[int, float, float, float, float]] = []

    for el in root.iter():
        name = classify(el)
        if name is None:
            continue
        # Look for polygon points on the element or its direct children.
        candidates = [el] if el.get("points") else list(el)
        for cand in candidates:
            points = cand.get("points")
            if not points:
                continue
            bbox = polygon_bbox(points)
            if bbox is None:
                continue
            x0, y0, x1, y1 = bbox
            if x1 - x0 < 1 or y1 - y0 < 1:
                continue
            boxes.append((CLASSES[name], x0, y0, x1, y1))
    return boxes


def to_yolo_line(cls: int, x0: float, y0: float, x1: float, y1: float, w: int, h: int) -> str:
    cx = (x0 + x1) / 2 / w
    cy = (y0 + y1) / 2 / h
    bw = (x1 - x0) / w
    bh = (y1 - y0) / h
    clamp = lambda v: max(0.0, min(1.0, v))
    return f"{cls} {clamp(cx):.6f} {clamp(cy):.6f} {clamp(bw):.6f} {clamp(bh):.6f}"


def convert_split(dataset_root: Path, split_file: str, split_name: str, out_root: Path) -> tuple[int, int]:
    split_path = dataset_root / split_file
    if not split_path.exists():
        print(f"warning: {split_path} missing, skipping {split_name}")
        return 0, 0

    img_out = out_root / "images" / split_name
    lbl_out = out_root / "labels" / split_name
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)

    converted = skipped = 0
    samples = [line.strip().strip("/") for line in split_path.read_text().splitlines() if line.strip()]

    for sample in tqdm(samples, desc=split_name):
        sample_dir = dataset_root / sample
        svg = sample_dir / "model.svg"
        png = sample_dir / "F1_scaled.png"
        if not svg.exists() or not png.exists():
            skipped += 1
            continue

        with Image.open(png) as im:
            w, h = im.size

        boxes = extract_boxes(svg)
        if not boxes:
            skipped += 1
            continue

        stem = sample.replace("/", "_")
        shutil.copyfile(png, img_out / f"{stem}.png")
        lines = [to_yolo_line(cls, x0, y0, x1, y1, w, h) for cls, x0, y0, x1, y1 in boxes]
        (lbl_out / f"{stem}.txt").write_text("\n".join(lines) + "\n")
        converted += 1

    return converted, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset_root", type=Path, help="Path to unzipped cubicasa5k directory")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "dataset")
    args = parser.parse_args()

    totals = {}
    for split_file, split_name in [("train.txt", "train"), ("val.txt", "val"), ("test.txt", "test")]:
        totals[split_name] = convert_split(args.dataset_root, split_file, split_name, args.out)

    for split_name, (converted, skipped) in totals.items():
        print(f"{split_name}: {converted} converted, {skipped} skipped")

    yaml_path = args.out / "cubicasa.yaml"
    yaml_path.write_text(
        f"path: {args.out.resolve()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "test: images/test\n"
        "names:\n  0: wall\n  1: door\n  2: window\n"
    )
    print(f"wrote {yaml_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
