#!/usr/bin/env python3
"""
Procedural floor-plan generator for YOLO training data (PIL-based, no Playwright).

Generates randomized rectangular room layouts with doors/windows.
Renders directly to PNG via PIL (no browser needed).
Outputs YOLO-format labels matching CubiCasa5k format.

Usage:
  python generate_simple.py --count 800 --output-dir output --seed 42
"""

import argparse
import os
import random
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple

from PIL import Image, ImageDraw


CLASSES = {"wall": 0, "door": 1, "window": 2}
IMG_SIZE = 640
PADDING = 20
MIN_ROOM_SIZE = 60
MAX_ROOM_SIZE = 300
WALL_STROKE = 8
DOOR_SIZE = (30, 15)
WINDOW_SIZE = (25, 12)


@dataclass
class Box:
    """YOLO bounding box: normalized center x/y, width, height."""
    cls: int
    cx: float
    cy: float
    w: float
    h: float

    def to_yolo(self) -> str:
        """Format as YOLO label line."""
        return f"{self.cls} {self.cx:.6f} {self.cy:.6f} {self.w:.6f} {self.h:.6f}"


class SeededRandom:
    """Seeded pseudo-random for reproducibility."""
    def __init__(self, seed: int):
        self.rng = random.Random(seed)

    def randint(self, a: int, b: int) -> int:
        return self.rng.randint(a, b)

    def choice(self, seq: List) -> any:
        return self.rng.choice(seq)

    def random(self) -> float:
        return self.rng.random()


def generate_rooms(rng: SeededRandom) -> List[Tuple[int, int, int, int]]:
    """Generate non-overlapping rectangular rooms."""
    num_rooms = rng.randint(1, 5)
    rooms = []
    max_attempts = 20

    for _ in range(num_rooms):
        for _ in range(max_attempts):
            x = rng.randint(PADDING, IMG_SIZE - MAX_ROOM_SIZE - PADDING)
            y = rng.randint(PADDING, IMG_SIZE - MAX_ROOM_SIZE - PADDING)
            w = rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE)
            h = rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE)

            # Check overlap with existing rooms
            overlap = False
            for rx, ry, rw, rh in rooms:
                if (x < rx + rw + 10 and x + w > rx - 10 and
                    y < ry + rh + 10 and y + h > ry - 10):
                    overlap = True
                    break

            if not overlap and x + w < IMG_SIZE - PADDING and y + h < IMG_SIZE - PADDING:
                rooms.append((x, y, w, h))
                break

    return rooms


def draw_floor_plan(
    rooms: List[Tuple[int, int, int, int]],
    rng: SeededRandom,
) -> Tuple[Image.Image, List[Box]]:
    """Draw floor plan to PIL Image and return boxes."""
    img = Image.new("RGB", (IMG_SIZE, IMG_SIZE), "white")
    draw = ImageDraw.Draw(img)
    boxes = []

    # Draw room walls (perimeter)
    for x, y, w, h in rooms:
        # Walls
        draw.rectangle([x, y, x + w, y + h], outline="black", width=WALL_STROKE)

        # Wall box (normalized)
        cx = (x + w / 2) / IMG_SIZE
        cy = (y + h / 2) / IMG_SIZE
        box_w = w / IMG_SIZE
        box_h = h / IMG_SIZE
        boxes.append(Box(cls=CLASSES["wall"], cx=cx, cy=cy, w=box_w, h=box_h))

    # Place doors and windows on walls
    for x, y, w, h in rooms:
        walls = [
            ("top", x, y, x + w, y),
            ("right", x + w, y, x + w, y + h),
            ("bottom", x + w, y + h, x, y + h),
            ("left", x, y + h, x, y),
        ]

        # Doors (0-3 per room)
        for _ in range(rng.randint(0, 4)):
            side, x1, y1, x2, y2 = rng.choice(walls)
            dw, dh = DOOR_SIZE

            if side == "top":
                door_x = rng.randint(x + 10, x + w - dw - 10)
                door_y = y
                door_box = (door_x, door_y, door_x + dw, door_y + dh)
            elif side == "bottom":
                door_x = rng.randint(x + 10, x + w - dw - 10)
                door_y = y + h - dh
                door_box = (door_x, door_y, door_x + dw, door_y + dh)
            elif side == "left":
                door_x = x
                door_y = rng.randint(y + 10, y + h - dw - 10)
                door_box = (door_x, door_y, door_x + dh, door_y + dw)
            else:  # right
                door_x = x + w - dh
                door_y = rng.randint(y + 10, y + h - dw - 10)
                door_box = (door_x, door_y, door_x + dh, door_y + dw)

            draw.rectangle(door_box, outline="gray", width=2)
            cx = (door_box[0] + door_box[2]) / 2 / IMG_SIZE
            cy = (door_box[1] + door_box[3]) / 2 / IMG_SIZE
            box_w = (door_box[2] - door_box[0]) / IMG_SIZE
            box_h = (door_box[3] - door_box[1]) / IMG_SIZE
            boxes.append(Box(cls=CLASSES["door"], cx=cx, cy=cy, w=box_w, h=box_h))

        # Windows (0-4 per room)
        for _ in range(rng.randint(0, 5)):
            side, x1, y1, x2, y2 = rng.choice(walls)
            ww, wh = WINDOW_SIZE

            if side == "top":
                win_x = rng.randint(x + 10, x + w - ww - 10)
                win_y = y
                win_box = (win_x, win_y, win_x + ww, win_y + wh)
            elif side == "bottom":
                win_x = rng.randint(x + 10, x + w - ww - 10)
                win_y = y + h - wh
                win_box = (win_x, win_y, win_x + ww, win_y + wh)
            elif side == "left":
                win_x = x
                win_y = rng.randint(y + 10, y + h - ww - 10)
                win_box = (win_x, win_y, win_x + wh, win_y + ww)
            else:  # right
                win_x = x + w - wh
                win_y = rng.randint(y + 10, y + h - ww - 10)
                win_box = (win_x, win_y, win_x + wh, win_y + ww)

            draw.rectangle(win_box, outline="blue", width=2)
            cx = (win_box[0] + win_box[2]) / 2 / IMG_SIZE
            cy = (win_box[1] + win_box[3]) / 2 / IMG_SIZE
            box_w = (win_box[2] - win_box[0]) / IMG_SIZE
            box_h = (win_box[3] - win_box[1]) / IMG_SIZE
            boxes.append(Box(cls=CLASSES["window"], cx=cx, cy=cy, w=box_w, h=box_h))

    return img, boxes


def generate_one(idx: int, output_dir: Path, rng: SeededRandom) -> None:
    """Generate one floor plan image and labels."""
    rooms = generate_rooms(rng)
    img, boxes = draw_floor_plan(rooms, rng)

    # Save PNG
    img_path = output_dir / "images" / f"synth_{idx:05d}.png"
    img.save(img_path)

    # Save YOLO labels
    label_path = output_dir / "labels" / f"synth_{idx:05d}.txt"
    with open(label_path, "w") as f:
        for box in boxes:
            f.write(box.to_yolo() + "\n")

    if idx % 100 == 0:
        print(f"Generated {idx} images...")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=800, help="Number of images to generate")
    parser.add_argument("--output-dir", default="output", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    images_dir = output_dir / "images"
    labels_dir = output_dir / "labels"

    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating {args.count} synthetic floor plans...")
    rng = SeededRandom(args.seed)

    for i in range(args.count):
        generate_one(i, output_dir, rng)

    print(f"✓ Done. Generated {args.count} images + labels")
    print(f"  Images: {images_dir}")
    print(f"  Labels: {labels_dir}")


if __name__ == "__main__":
    main()
