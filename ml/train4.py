"""Train YOLOv8-small on CubiCasa5k + 800 synthetic floor plans (Run B).

Builds on Run A (transfer learning yolov8n→yolov8s, 100 epochs, 81.0% overall F1).
Adds 800 synthetic procedurally-generated floor plans to training set.
Continues warm-start fine-tuning for another 100 epochs.

Strategy:
- Load Run A checkpoint (yolov8s, already transferred)
- Merge 800 synthetic images into dataset/images/train/ (done beforehand)
- Fine-tune for 100 epochs at 0.001 learning rate
- Goal: push door/window toward 90%+ (wall limited by geometry to ~80-88%)

Augmentation: copy_paste 0.3, mixup 0.1, degrees 5.0, erasing 0.25 (tuned in Run A).

Usage:
  python train4.py                           # fine-tune from Run A checkpoint
  python train4.py --epochs 150              # extend training window
  python train4.py --pretrained /path/best.pt  # start from custom checkpoint
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

DATA = Path(__file__).parent / "dataset" / "cubicasa.yaml"
RUNS = Path(__file__).parent / "runs"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=100, help="Epochs for Run B fine-tuning")
    parser.add_argument("--patience", type=int, default=40, help="Early stopping patience")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--pretrained", type=str, default=None, help="Path to Run A checkpoint (default: infer from RUNS)")
    args = parser.parse_args()

    best_s = RUNS / "detect" / "corbel-runB" / "weights" / "best.pt"

    if not args.export_only:
        # Determine Run A checkpoint path
        pretrained_path = args.pretrained
        if not pretrained_path:
            possible_paths = [
                RUNS / "detect" / "corbel" / "weights" / "best.pt",  # Previous run
                Path.home() / "Downloads" / "train3.onnx",
            ]
            for p in possible_paths:
                if p.exists():
                    pretrained_path = str(p)
                    break
            if not pretrained_path:
                raise FileNotFoundError(
                    "Run A checkpoint not found. Pass --pretrained <path> or place in ~/Downloads"
                )

        print(f"Loading Run A checkpoint from: {pretrained_path}")
        model = YOLO(pretrained_path)

        print(f"Dataset (now contains 800 synthetic images): {DATA}")
        print("Fine-tuning yolov8s on CubiCasa5k + synthetic data (100 epochs, lr0=0.001)...\n")

        model.train(
            data=str(DATA),
            epochs=args.epochs,
            patience=args.patience,
            imgsz=args.imgsz,
            optimizer="AdamW",
            batch=-1,
            lr0=0.001,  # Warm start
            lrf=0.0001,
            warmup_epochs=5,
            # Same augmentation as Run A (tuned)
            copy_paste=0.3,
            mixup=0.1,
            degrees=5.0,
            erasing=0.25,
            project=str(RUNS / "detect"),
            name="corbel-runB",
            exist_ok=True,
        )

    model = YOLO(str(best_s))
    onnx_path = model.export(format="onnx", imgsz=args.imgsz, opset=17)
    print(f"\n✓ ONNX exported: {onnx_path}")
    print("Next: Benchmark against 400-image test split")
