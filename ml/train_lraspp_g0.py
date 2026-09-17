"""Days 3-5 comparison baseline (docs/corbel-custom-geometry-model-plan.md):
fine-tune torchvision's LRASPP MobileNetV3-Large on the same masks as G0.

Diagnostic, not load-bearing: if this off-the-shelf architecture lands near
G0's accuracy, the bottleneck is data/vectorization, not architecture choice.
Cheap because the backbone starts from ImageNet weights -- expect faster
convergence than G0, hence fewer epochs/patience here.
"""
import argparse
import os
from pathlib import Path

import albumentations as A
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision.models.segmentation import lraspp_mobilenet_v3_large
from torchvision.models import MobileNet_V3_Large_Weights

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
IMG_SIZE = 640
NUM_CLASSES = 3


class SegDataset(Dataset):
    def __init__(self, root: Path, split: str, augment: bool):
        self.img_dir = root / "images" / split
        self.mask_dir = root / "masks" / split
        self.files = sorted(p.stem for p in self.img_dir.glob("*.png"))
        if augment:
            self.tf = A.Compose([
                A.LongestMaxSize(max_size=IMG_SIZE),
                A.PadIfNeeded(min_height=IMG_SIZE, min_width=IMG_SIZE, border_mode=0, fill=0, fill_mask=0),
                A.D4(p=0.5),
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


def dice_loss(logits, targets, eps=1e-6):
    probs = torch.sigmoid(logits)
    dims = (0, 2, 3)
    intersection = (probs * targets).sum(dims)
    union = probs.sum(dims) + targets.sum(dims)
    return 1 - ((2 * intersection + eps) / (union + eps)).mean()


def focal_loss(logits, targets, alpha=0.25, gamma=2.0):
    bce = F.binary_cross_entropy_with_logits(logits, targets, reduction="none")
    probs = torch.sigmoid(logits)
    pt = probs * targets + (1 - probs) * (1 - targets)
    return (alpha * (1 - pt).pow(gamma) * bce).mean()


def boundary_weight_map(mask_channel, dilation=3):
    kernel = torch.ones(1, 1, dilation * 2 + 1, dilation * 2 + 1, device=mask_channel.device)
    dilated = F.conv2d(mask_channel.unsqueeze(1), kernel, padding=dilation).clamp(0, 1)
    eroded = 1 - F.conv2d(1 - mask_channel.unsqueeze(1), kernel, padding=dilation).clamp(0, 1)
    boundary = (dilated - eroded).clamp(0, 1)
    return (1.0 + 4.0 * boundary).squeeze(1)


def combined_loss(logits, targets):
    d = dice_loss(logits, targets)
    f = focal_loss(logits, targets)
    wall_logits, wall_targets = logits[:, 0], targets[:, 0]
    w = boundary_weight_map(wall_targets)
    wall_bce = F.binary_cross_entropy_with_logits(wall_logits, wall_targets, weight=w, reduction="mean")
    return d + f + 0.5 * wall_bce


def compute_iou(logits, targets, thresh=0.5, eps=1e-6):
    preds = (torch.sigmoid(logits) > thresh).float()
    dims = (0, 2, 3)
    intersection = (preds * targets).sum(dims)
    union = preds.sum(dims) + targets.sum(dims) - intersection
    return ((intersection + eps) / (union + eps)).cpu().numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("/workspace/dataset_seg"))
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--out", type=Path, default=Path("/workspace/lraspp"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"device={DEVICE}")
    train_ds = SegDataset(args.data_root, "train", augment=True)
    val_ds = SegDataset(args.data_root, "val", augment=False)
    print(f"train={len(train_ds)} val={len(val_ds)}")
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=8, pin_memory=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)

    model = lraspp_mobilenet_v3_large(
        weights=None,
        weights_backbone=MobileNet_V3_Large_Weights.IMAGENET1K_V1,
        num_classes=NUM_CLASSES,
    ).to(DEVICE)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.cuda.amp.GradScaler(enabled=(DEVICE == "cuda"))

    best_val_iou = -1.0
    epochs_no_improve = 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss_sum = 0.0
        for img, mask in train_loader:
            img, mask = img.to(DEVICE, non_blocking=True), mask.to(DEVICE, non_blocking=True)
            optimizer.zero_grad()
            with torch.autocast(device_type="cuda", enabled=(DEVICE == "cuda")):
                logits = model(img)["out"]
                loss = combined_loss(logits, mask)
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
                logits = model(img)["out"]
                ious.append(compute_iou(logits, mask))
        ious = np.stack(ious).mean(axis=0)
        mean_iou = float(ious.mean())
        print(
            f"epoch {epoch}/{args.epochs} train_loss={train_loss:.4f} "
            f"val_iou_mean={mean_iou:.4f} val_iou_wall={ious[0]:.4f} "
            f"val_iou_door={ious[1]:.4f} val_iou_window={ious[2]:.4f} "
            f"lr={scheduler.get_last_lr()[0]:.2e}",
            flush=True,
        )
        if mean_iou > best_val_iou:
            best_val_iou = mean_iou
            epochs_no_improve = 0
            torch.save(model.state_dict(), args.out / "lraspp_best.pt")
            print(f"  -> new best (val_iou_mean={mean_iou:.4f}), saved lraspp_best.pt", flush=True)
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= args.patience:
                print(f"early stopping at epoch {epoch}", flush=True)
                break

    print("training done, exporting best checkpoint to ONNX", flush=True)
    model.load_state_dict(torch.load(args.out / "lraspp_best.pt", map_location=DEVICE))
    model.eval()

    class Wrapper(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m
        def forward(self, x):
            return self.m(x)["out"]

    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE, device=DEVICE)
    onnx_path = args.out / "lraspp.onnx"
    torch.onnx.export(
        Wrapper(model), dummy, str(onnx_path),
        input_names=["input"], output_names=["output"],
        opset_version=17, dynamic_axes=None,
    )
    print(f"exported {onnx_path} ({onnx_path.stat().st_size / 1e6:.2f} MB)", flush=True)
    os.system(f"onnxslim {onnx_path} {args.out / 'lraspp_slim.onnx'}")
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
