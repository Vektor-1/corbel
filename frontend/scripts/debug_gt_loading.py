#!/usr/bin/env python3
"""Debug ground truth label loading."""

from pathlib import Path

DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
CLASSES = ("wall", "door", "window")

class Box:
    def __init__(self, cls, conf, x0, y0, x1, y1):
        self.cls = cls
        self.conf = conf
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1

    def __repr__(self):
        return f"Box(cls={CLASSES[self.cls]}, x0={self.x0:.0f}, y0={self.y0:.0f}, x1={self.x1:.0f}, y1={self.y1:.0f})"


def read_yolo_labels(path: Path, width: int, height: int):
    boxes = []
    text = path.read_text().strip()
    if not text:
        return boxes
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        cls = int(float(parts[0]))
        cx, cy, w, h = map(float, parts[1:5])
        bw, bh = w * width, h * height
        x0 = (cx * width) - bw / 2
        y0 = (cy * height) - bh / 2
        boxes.append(Box(cls, 1.0, x0, y0, x0 + bw, y0 + bh))
    return boxes


# Test with first image
test_imgs = sorted((DATASET / "images" / "test").glob("*.png"))
if test_imgs:
    from PIL import Image

    img_path = test_imgs[0]
    label_path = DATASET / "labels" / "test" / f"{img_path.stem}.txt"

    img = Image.open(img_path)
    w, h = img.size

    print(f"Image: {img_path.name} ({w}x{h})")

    gts = read_yolo_labels(label_path, w, h)
    print(f"Loaded {len(gts)} ground truth labels:")

    # Count by class
    counts = {cls: sum(1 for gt in gts if gt.cls == i) for i, cls in enumerate(CLASSES)}
    for cls_name, count in counts.items():
        print(f"  {cls_name}: {count}")

    print(f"\nFirst 5 boxes:")
    for gt in gts[:5]:
        print(f"  {gt}")
