"""Days 3-5 of docs/corbel-custom-geometry-model-plan.md: train G0.

Single config, no ablation sweep:
  - segmentation_models_pytorch Unet, encoder tu-mobilenetv3_small_100
  - 640px input
  - Dice + focal loss, wall channel gets an extra boundary-weighted BCE term
    (background pixels must not dominate given how little area thin walls
    cover)
  - albumentations augmentation: RandomRotate90/D4 (not arbitrary-angle
    Rotate -- CubiCasa5k's own authors made the same call), mild
    resize/crop, ImageCompression, Blur/MotionBlur, brightness/contrast

Expects the dataset already laid out at ml/dataset_seg/{images,masks}/{train,val,test}/
(from ml/convert_cubicasa_seg.py) and exports G0 to ONNX at the end.
"""
import argparse
import os
import time
from pathlib import Path

import albumentations as A
import numpy as np
import segmentation_models_pytorch as smp
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
IMG_SIZE = 640
NUM_CLASSES = 3  # wall, door, window
CLASS_NAMES = ["wall", "door", "window"]


class SegDataset(Dataset):
    def __init__(self, root: Path, split: str, augment: bool):
        self.img_dir = root / "images" / split
        self.mask_dir = root / "masks" / split
        self.files = sorted(p.stem for p in self.img_dir.glob("*.png"))
        self.augment = augment

        if augment:
            self.tf = A.Compose([
                A.LongestMaxSize(max_size=IMG_SIZE),
                A.PadIfNeeded(min_height=IMG_SIZE, min_width=IMG_SIZE, border_mode=0, fill=0, fill_mask=0),
                A.D4(p=0.5),  # 90-degree-increment rotation/flip only, not arbitrary Rotate
                A.RandomResizedCrop(size=(IMG_SIZE, IMG_SIZE), scale=(0.8, 1.0), ratio=(0.9, 1.1), p=0.5),
                A.OneOf([
                    A.ImageCompression(quality_range=(40, 85), p=1.0),
                    A.Blur(blur_limit=3, p=1.0),
                    A.MotionBlur(blur_limit=5, p=1.0),
                ], p=0.4),
                A.RandomBrightnessContrast(p=0.4),
            ])
        else:
            self.tf = A.Compose([
                A.LongestMaxSize(max_size=IMG_SIZE),
                A.PadIfNeeded(min_height=IMG_SIZE, min_width=IMG_SIZE, border_mode=0, fill=0, fill_mask=0),
            ])

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):
        stem = self.files[idx]
        img = np.array(Image.open(self.img_dir / f"{stem}.png").convert("RGB"))
        mask = np.array(Image.open(self.mask_dir / f"{stem}.png").convert("RGB"))
        out = self.tf(image=img, mask=mask)
        img_t = torch.from_numpy(out["image"]).permute(2, 0, 1).float() / 255.0
        mask_t = (torch.from_numpy(out["mask"]).permute(2, 0, 1).float() / 255.0 > 0.5).float()
        return img_t, mask_t


def _style_weights(stems: list[str], weight: float = 1.5, style_prefix: str = "high_quality_architectural") -> list[float]:
    """Per-sample sampling weight, mildly boosting the documented weakest
    style. Not an under-exposure fix (this style is already 76.6% of the
    train split by raw count, per ml/convert_cubicasa_seg.py's filename-
    stem style encoding) -- it's the lowest-IoU style regardless, so a
    modest additional boost is a cheap, well-isolated thing to try
    alongside training to an actual plateau (see train_seg_g0.py's
    docstring / the plan this was added under)."""
    return [weight if stem.startswith(style_prefix) else 1.0 for stem in stems]


def dice_loss(logits, targets, eps=1e-6):
    probs = torch.sigmoid(logits)
    dims = (0, 2, 3)
    intersection = (probs * targets).sum(dims)
    union = probs.sum(dims) + targets.sum(dims)
    dice = (2 * intersection + eps) / (union + eps)
    return 1 - dice.mean()


def focal_loss(logits, targets, alpha=0.25, gamma=2.0):
    bce = F.binary_cross_entropy_with_logits(logits, targets, reduction="none")
    probs = torch.sigmoid(logits)
    pt = probs * targets + (1 - probs) * (1 - targets)
    focal = alpha * (1 - pt).pow(gamma) * bce
    return focal.mean()


def boundary_weight_map(mask_channel: torch.Tensor, dilation: int = 3) -> torch.Tensor:
    """Upweight pixels near the wall boundary so a thin class isn't
    drowned out by background in the loss average."""
    kernel = torch.ones(1, 1, dilation * 2 + 1, dilation * 2 + 1, device=mask_channel.device)
    dilated = F.conv2d(mask_channel.unsqueeze(1), kernel, padding=dilation).clamp(0, 1)
    eroded = 1 - F.conv2d(1 - mask_channel.unsqueeze(1), kernel, padding=dilation).clamp(0, 1)
    boundary = (dilated - eroded).clamp(0, 1)
    return (1.0 + 4.0 * boundary).squeeze(1)  # 5x weight right at the wall edge


def combined_loss(logits, targets):
    d = dice_loss(logits, targets)
    f = focal_loss(logits, targets)
    # extra boundary-weighted BCE term, wall channel (index 0) only
    wall_logits = logits[:, 0]
    wall_targets = targets[:, 0]
    w = boundary_weight_map(wall_targets)
    wall_bce = F.binary_cross_entropy_with_logits(wall_logits, wall_targets, weight=w, reduction="mean")
    return d + f + 0.5 * wall_bce, {"dice": d.item(), "focal": f.item(), "wall_boundary_bce": wall_bce.item()}


def compute_iou(logits, targets, thresh=0.5, eps=1e-6):
    preds = (torch.sigmoid(logits) > thresh).float()
    dims = (0, 2, 3)
    intersection = (preds * targets).sum(dims)
    union = preds.sum(dims) + targets.sum(dims) - intersection
    return ((intersection + eps) / (union + eps)).cpu().numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("/workspace/dataset_seg"))
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--patience", type=int, default=18)
    parser.add_argument("--out", type=Path, default=Path("/workspace/g0"))
    parser.add_argument("--encoder-name", type=str, default="tu-mobilenetv3_small_100")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"device={DEVICE}")
    train_ds = SegDataset(args.data_root, "train", augment=True)
    val_ds = SegDataset(args.data_root, "val", augment=False)
    print(f"train={len(train_ds)} val={len(val_ds)}")

    train_sampler = WeightedRandomSampler(_style_weights(train_ds.files), num_samples=len(train_ds), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, sampler=train_sampler, num_workers=8, pin_memory=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)

    print(f"encoder={args.encoder_name}")
    model = smp.Unet(
        encoder_name=args.encoder_name,
        encoder_weights="imagenet",
        in_channels=3,
        classes=NUM_CLASSES,
    ).to(DEVICE)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.cuda.amp.GradScaler(enabled=(DEVICE == "cuda"))

    best_val_iou = -1.0
    epochs_no_improve = 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        t0 = time.time()
        train_loss_sum = 0.0
        for img, mask in train_loader:
            img, mask = img.to(DEVICE, non_blocking=True), mask.to(DEVICE, non_blocking=True)
            optimizer.zero_grad()
            with torch.autocast(device_type="cuda", enabled=(DEVICE == "cuda")):
                logits = model(img)
                loss, parts = combined_loss(logits, mask)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            train_loss_sum += loss.item()
        scheduler.step()
        train_loss = train_loss_sum / len(train_loader)

        model.eval()
        ious = []
        with torch.no_grad():
            for img, mask in val_loader:
                img, mask = img.to(DEVICE), mask.to(DEVICE)
                logits = model(img)
                ious.append(compute_iou(logits, mask))
        ious = np.stack(ious).mean(axis=0)
        mean_iou = float(ious.mean())
        elapsed = time.time() - t0
        print(
            f"epoch {epoch}/{args.epochs} train_loss={train_loss:.4f} "
            f"val_iou_mean={mean_iou:.4f} "
            f"val_iou_wall={ious[0]:.4f} val_iou_door={ious[1]:.4f} val_iou_window={ious[2]:.4f} "
            f"lr={scheduler.get_last_lr()[0]:.2e} time={elapsed:.1f}s",
            flush=True,
        )

        if mean_iou > best_val_iou:
            best_val_iou = mean_iou
            epochs_no_improve = 0
            torch.save(model.state_dict(), args.out / "g0_best.pt")
            print(f"  -> new best (val_iou_mean={mean_iou:.4f}), saved g0_best.pt", flush=True)
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= args.patience:
                print(f"early stopping at epoch {epoch} (no improvement for {args.patience} epochs)", flush=True)
                break

    print("training done, exporting best checkpoint to ONNX", flush=True)
    model.load_state_dict(torch.load(args.out / "g0_best.pt", map_location=DEVICE))
    model.eval()
    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE, device=DEVICE)
    onnx_path = args.out / "g0.onnx"
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["input"], output_names=["output"],
        opset_version=17, dynamic_axes=None,
    )
    print(f"exported {onnx_path} ({onnx_path.stat().st_size / 1e6:.2f} MB)", flush=True)
    os.system(f"onnxslim {onnx_path} {args.out / 'g0_slim.onnx'}")
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
