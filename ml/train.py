"""Train YOLOv8-nano on converted CubiCasa5k, then export ONNX for browser inference.

Defaults raised from the original 50 epochs to 150 (+ patience=30 early stop):
a 2026-09-05 benchmark against 200 held-out val images showed the shipped
model's wall/door/window boxes are imprecise in a way threshold tuning and
post-processing can't fix (see corbel/benchmark_out/comparison-40/), which
points at undertraining rather than a labeling or metric bug. These are a
reasonable starting point, not a hyperparameter search verified by an actual
training run (no GPU available in that session) — treat `patience` as the
safety net if 150 turns out to be more than needed.

Usage:
  python train.py                  # train + export
  python train.py --export-only    # export existing best.pt
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

DATA = Path(__file__).parent / "dataset" / "cubicasa.yaml"
RUNS = Path(__file__).parent / "runs"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--patience", type=int, default=30, help="Stop early if val loss hasn't improved in this many epochs.")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--export-only", action="store_true")
    args = parser.parse_args()

    best = RUNS / "detect" / "corbel" / "weights" / "best.pt"

    if not args.export_only:
        model = YOLO("yolov8n.pt")
        model.train(
            data=str(DATA),
            epochs=args.epochs,
            patience=args.patience,
            imgsz=args.imgsz,
            project=str(RUNS / "detect"),
            name="corbel",
            exist_ok=True,
        )

    model = YOLO(str(best))
    onnx_path = model.export(format="onnx", imgsz=args.imgsz, opset=17)
    print(f"ONNX exported: {onnx_path}")
    print("Copy into the app:  cp", onnx_path, "../corbel/public/models/corbel-detect.onnx")


if __name__ == "__main__":
    main()
