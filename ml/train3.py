"""Train YOLOv8-small on CubiCasa5k via transfer learning from trained yolov8n.

Strategy: Transfer Learning (warm start)
- Load pretrained yolov8n backbone (from train2.onnx checkpoint, 142 epochs)
- Initialize yolov8s architecture and inject backbone weights
- Fine-tune for 80–100 epochs with warm learning rate (0.001 vs 0.01 cold start)
- Result: 3x faster than training yolov8s from scratch, with benefit of both architectures

Augmentation tuning: copy_paste 0.3, mixup 0.1, degrees 5.0, erasing 0.25
(reasoned starting points from corbel/context.md accuracy investigation).

Usage:
  python train3.py                  # transfer-learn + export
  python train3.py --export-only    # export existing best.pt
  python train3.py --pretrained /path/to/yolov8n/best.pt  # custom checkpoint
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

DATA = Path(__file__).parent / "dataset" / "cubicasa.yaml"
RUNS = Path(__file__).parent / "runs"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=100, help="Epochs for fine-tuning (warm start, fewer needed)")
    parser.add_argument("--patience", type=int, default=40, help="Stop early if val loss hasn't improved in this many epochs.")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--pretrained", type=str, default=None, help="Path to pretrained yolov8n checkpoint (default: infer from RUNS)")
    args = parser.parse_args()

    best_s = RUNS / "detect" / "corbel" / "weights" / "best.pt"

    if not args.export_only:
        # Determine pretrained checkpoint path (trained yolov8n from train2)
        pretrained_path = args.pretrained
        if not pretrained_path:
            # Try to find it in expected locations
            possible_paths = [
                RUNS / "detect" / "corbel" / "weights" / "best.pt",  # If already exists (unlikely for transfer)
                Path.home() / "Downloads" / "best.pt",
            ]
            for p in possible_paths:
                if p.exists():
                    pretrained_path = str(p)
                    break
            if not pretrained_path:
                raise FileNotFoundError(
                    "Pretrained yolov8n checkpoint not found. Pass --pretrained <path> or place best.pt in ~/Downloads"
                )

        print(f"Loading pretrained yolov8n from: {pretrained_path}")
        pretrained_model = YOLO(pretrained_path)

        print("Initializing yolov8s architecture...")
        model = YOLO("yolov8s.pt")

        print("Transferring backbone weights from yolov8n → yolov8s...")
        model.model.backbone.load_state_dict(
            pretrained_model.model.backbone.state_dict()
        )

        print("Fine-tuning with warm learning rate...")
        model.train(
            data=str(DATA),
            epochs=args.epochs,  # 100 epochs (warm start converges faster)
            patience=args.patience,  # 40
            imgsz=args.imgsz,
            optimizer="AdamW",
            batch=-1,
            lr0=0.001,  # Warm start: 10x lower learning rate (vs 0.01 cold start)
            lrf=0.0001,
            warmup_epochs=5,  # Longer warmup for stable convergence
            # Augmentation tuning (from corbel/context.md investigation):
            copy_paste=0.3,  # Small-object (door/window) recall
            mixup=0.1,  # Mild, preserve line geometry
            degrees=5.0,  # Rotation for scanned plans
            erasing=0.25,  # Preserve thin walls
            project=str(RUNS / "detect"),
            name="corbel",
            exist_ok=True,
        )

    model = YOLO(str(best_s))
    onnx_path = model.export(format="onnx", imgsz=args.imgsz, opset=17)
    print(f"\n✓ ONNX exported: {onnx_path}")
    print("For app deployment: cp", onnx_path, "../corbel/public/models/corbel-detect.onnx")
    print("For benchmarking: node --experimental-strip-types corbel/scripts/benchmark-local-yolo.ts --split test --n 400 --model", onnx_path)


if __name__ == "__main__":
    main()
