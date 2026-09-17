#!/usr/bin/env python3
"""YOLO vs VLM reconstruction accuracy benchmark for Corbel FYP.

Primary metric (JSON): summary.overall_f1  (macro-F1 @ IoU 0.5, higher better)

Usage:
  scripts/.venv/bin/python scripts/benchmark.py [--n 20] [--pipelines yolo,vlm] [--seed 13]
  scripts/.venv/bin/python scripts/benchmark.py --config scripts/bench-config.json
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = Path("/Users/admin/Projects/Vektor-1/project/datasets/dataset")
DEFAULT_ONNX = ROOT / "public" / "models" / "corbel-detect.onnx"
CACHE_DIR = Path(__file__).resolve().parent / ".bench-cache"
SPEND_PATH = CACHE_DIR / "spend.json"
CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}

# gemini-2.0-flash-lite rough estimate (USD): image+prompt ~$0.00015, output ~$0.0004
VLM_CALL_COST_USD = 0.0006
BUDGET_USD = float(os.environ.get("BENCH_BUDGET_USD", "20"))


@dataclass
class Box:
    cls: int
    conf: float
    x0: float
    y0: float
    x1: float
    y1: float


def load_env_local() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def load_spend() -> float:
    if not SPEND_PATH.exists():
        return 0.0
    try:
        return float(json.loads(SPEND_PATH.read_text()).get("spent_usd", 0.0))
    except Exception:
        return 0.0


def add_spend(amount: float) -> float:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    spent = load_spend() + amount
    SPEND_PATH.write_text(json.dumps({"spent_usd": round(spent, 6), "budget_usd": BUDGET_USD}, indent=2))
    return spent


def list_samples(dataset: Path, split: str = "test") -> list[tuple[Path, Path]]:
    images = sorted((dataset / "images" / split).glob("*.png"))
    pairs: list[tuple[Path, Path]] = []
    for img in images:
        label = dataset / "labels" / split / f"{img.stem}.txt"
        if label.exists():
            pairs.append((img, label))
    return pairs


def read_yolo_labels(path: Path, width: int, height: int) -> list[Box]:
    boxes: list[Box] = []
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


def iou(a: Box, b: Box) -> float:
    x0 = max(a.x0, b.x0)
    y0 = max(a.y0, b.y0)
    x1 = min(a.x1, b.x1)
    y1 = min(a.y1, b.y1)
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = max(0.0, a.x1 - a.x0) * max(0.0, a.y1 - a.y0)
    area_b = max(0.0, b.x1 - b.x0) * max(0.0, b.y1 - b.y0)
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0


def match_f1(preds: list[Box], gts: list[Box], iou_thr: float = 0.5) -> dict[str, float]:
    """Per-class precision/recall/F1 via greedy IoU matching; overall_f1 = macro F1."""
    per: dict[str, dict[str, float]] = {}
    f1s: list[float] = []
    for cls_id, name in enumerate(CLASSES):
        p = sorted([b for b in preds if b.cls == cls_id], key=lambda b: -b.conf)
        g = [b for b in gts if b.cls == cls_id]
        matched_g = set()
        tp = 0
        for pb in p:
            best_j, best_iou = -1, 0.0
            for j, gb in enumerate(g):
                if j in matched_g:
                    continue
                v = iou(pb, gb)
                if v > best_iou:
                    best_iou, best_j = v, j
            if best_j >= 0 and best_iou >= iou_thr:
                matched_g.add(best_j)
                tp += 1
        fp = len(p) - tp
        fn = len(g) - tp
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per[name] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }
        f1s.append(f1)
    overall = sum(f1s) / len(f1s) if f1s else 0.0
    return {"overall_f1": round(overall, 4), "per_class": per}


# ── YOLO (ONNX) ───────────────────────────────────────────────────────────────

INPUT_SIZE = 640


def letterbox(img: Image.Image) -> tuple[np.ndarray, float, int, int]:
    w, h = img.size
    scale = min(INPUT_SIZE / w, INPUT_SIZE / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    pad_x = (INPUT_SIZE - nw) // 2
    pad_y = (INPUT_SIZE - nh) // 2
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (255, 255, 255))
    resized = img.resize((nw, nh), Image.BILINEAR)
    canvas.paste(resized, (pad_x, pad_y))
    arr = np.asarray(canvas).astype(np.float32) / 255.0
    tensor = np.transpose(arr, (2, 0, 1))[None, ...]  # 1,3,640,640
    return tensor, scale, pad_x, pad_y


def nms(boxes: list[Box], iou_thr: float) -> list[Box]:
    kept: list[Box] = []
    for cls_id in range(len(CLASSES)):
        class_boxes = sorted([b for b in boxes if b.cls == cls_id], key=lambda b: -b.conf)
        used = [False] * len(class_boxes)
        for i, a in enumerate(class_boxes):
            if used[i]:
                continue
            kept.append(a)
            for j in range(i + 1, len(class_boxes)):
                if not used[j] and iou(a, class_boxes[j]) > iou_thr:
                    used[j] = True
    return kept


class YoloRunner:
    def __init__(self, onnx_path: Path, conf: float = 0.25, iou_thr: float = 0.45):
        import onnxruntime as ort

        self.conf = conf
        self.iou_thr = iou_thr
        self.session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

    def detect(self, img: Image.Image) -> list[Box]:
        tensor, scale, pad_x, pad_y = letterbox(img.convert("RGB"))
        outputs = self.session.run(None, {self.input_name: tensor})
        out = outputs[0]
        # Expected [1, 7, 8400] or [1, 8400, 7]
        if out.ndim != 3:
            raise RuntimeError(f"Unexpected ONNX output shape: {out.shape}")
        if out.shape[1] < out.shape[2]:
            # [1, 7, N]
            data = out[0]
            num_attrs, num_anchors = data.shape
            boxes_raw: list[Box] = []
            for a in range(num_anchors):
                scores = data[4:, a]
                cls = int(np.argmax(scores))
                score = float(scores[cls])
                if score < self.conf:
                    continue
                cx, cy, w, h = map(float, data[:4, a])
                x0 = (cx - w / 2 - pad_x) / scale
                y0 = (cy - h / 2 - pad_y) / scale
                x1 = (cx + w / 2 - pad_x) / scale
                y1 = (cy + h / 2 - pad_y) / scale
                boxes_raw.append(Box(cls, score, x0, y0, x1, y1))
        else:
            # [1, N, 7]
            data = out[0]
            boxes_raw = []
            for row in data:
                cx, cy, w, h = map(float, row[:4])
                scores = row[4:]
                cls = int(np.argmax(scores))
                score = float(scores[cls])
                if score < self.conf:
                    continue
                x0 = (cx - w / 2 - pad_x) / scale
                y0 = (cy - h / 2 - pad_y) / scale
                x1 = (cx + w / 2 - pad_x) / scale
                y1 = (cy + h / 2 - pad_y) / scale
                boxes_raw.append(Box(cls, score, x0, y0, x1, y1))
        return nms(boxes_raw, self.iou_thr)


# ── VLM (Gemini one-shot boxes — comparable to YOLO for F1) ───────────────────

VLM_PROMPT = """You are detecting architectural elements on a floor plan image ({w}x{h} px).
Return ONLY a JSON object:
{{
  "detections": [
    {{"cls": "wall"|"door"|"window", "confidence": 0.0-1.0, "x0": px, "y0": px, "x1": px, "y1": px}}
  ]
}}
Rules:
- Coordinates are image pixels, origin top-left.
- Boxes must be axis-aligned tight bounds around each element.
- Include every wall segment, door, and window you can see.
- No markdown, no commentary."""


def run_vlm(img: Image.Image, model_name: str) -> list[Box]:
    import google.generativeai as genai

    key = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_GENERATIVE_AI_API_KEY not set")
    if load_spend() + VLM_CALL_COST_USD > BUDGET_USD:
        raise RuntimeError(f"Budget exceeded (${load_spend():.4f} / ${BUDGET_USD})")

    genai.configure(api_key=key)
    model = genai.GenerativeModel(model_name)
    w, h = img.size
    buf = __import__("io").BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    part = {"mime_type": "image/png", "data": buf.getvalue()}
    prompt = VLM_PROMPT.format(w=w, h=h)
    t0 = time.perf_counter()
    resp = model.generate_content(
        [prompt, part],
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        },
    )
    _ = time.perf_counter() - t0
    add_spend(VLM_CALL_COST_USD)
    text = resp.text or ""
    # strip fences if present
    raw = text.strip()
    if "```" in raw:
        import re

        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    data = json.loads(raw)
    detections = data.get("detections", data if isinstance(data, list) else [])
    boxes: list[Box] = []
    for d in detections:
        name = str(d.get("cls", "")).lower()
        if name not in CLASS_TO_ID:
            continue
        boxes.append(
            Box(
                CLASS_TO_ID[name],
                float(d.get("confidence", 0.5)),
                float(d["x0"]),
                float(d["y0"]),
                float(d["x1"]),
                float(d["y1"]),
            )
        )
    return boxes


def aggregate(per_image: list[dict[str, Any]]) -> dict[str, Any]:
    if not per_image:
        return {"overall_f1": 0.0, "per_class": {}, "n": 0, "mean_latency_ms": 0.0}
    # micro-average TP/FP/FN across images for stabler FYP numbers
    totals = {c: {"tp": 0, "fp": 0, "fn": 0} for c in CLASSES}
    latencies = []
    for row in per_image:
        latencies.append(row["latency_ms"])
        for c in CLASSES:
            pc = row["metrics"]["per_class"][c]
            totals[c]["tp"] += pc["tp"]
            totals[c]["fp"] += pc["fp"]
            totals[c]["fn"] += pc["fn"]
    per_class: dict[str, Any] = {}
    f1s = []
    for c in CLASSES:
        tp, fp, fn = totals[c]["tp"], totals[c]["fp"], totals[c]["fn"]
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_class[c] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }
        f1s.append(f1)
    return {
        "overall_f1": round(sum(f1s) / len(f1s), 4),
        "per_class": per_class,
        "n": len(per_image),
        "mean_latency_ms": round(sum(latencies) / len(latencies), 1),
    }


def run_pipeline(
    name: str,
    samples: list[tuple[Path, Path]],
    yolo: YoloRunner | None,
    vlm_model: str | None,
    iou_match: float,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for img_path, label_path in samples:
        img = Image.open(img_path)
        w, h = img.size
        gts = read_yolo_labels(label_path, w, h)
        t0 = time.perf_counter()
        if name == "yolo_hybrid":
            assert yolo is not None
            preds = yolo.detect(img)
        elif name == "vlm":
            assert vlm_model is not None
            preds = run_vlm(img, vlm_model)
        else:
            raise ValueError(name)
        latency_ms = (time.perf_counter() - t0) * 1000
        metrics = match_f1(preds, gts, iou_thr=iou_match)
        rows.append(
            {
                "id": img_path.stem,
                "latency_ms": round(latency_ms, 1),
                "n_pred": len(preds),
                "n_gt": len(gts),
                "metrics": metrics,
            }
        )
    summary = aggregate(rows)
    return {"pipeline": name, "summary": summary, "images": rows}


def main() -> int:
    load_env_local()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--onnx", type=Path, default=DEFAULT_ONNX)
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--pipelines", default="yolo,vlm", help="comma: yolo,vlm")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--nms-iou", type=float, default=0.45)
    parser.add_argument("--match-iou", type=float, default=0.5)
    parser.add_argument("--vlm-model", default=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-lite"))
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    if args.config and args.config.exists():
        cfg = json.loads(args.config.read_text())
        for k, v in cfg.items():
            if hasattr(args, k.replace("-", "_")):
                setattr(args, k.replace("-", "_"), v)
            elif k == "nms_iou":
                args.nms_iou = v
            elif k == "match_iou":
                args.match_iou = v
            elif k == "vlm_model":
                args.vlm_model = v

    pairs = list_samples(args.dataset)
    if not pairs:
        print(json.dumps({"error": f"no samples in {args.dataset}"}), file=sys.stderr)
        return 1
    rng = random.Random(args.seed)
    rng.shuffle(pairs)
    samples = pairs[: args.n]

    pipes = [p.strip() for p in args.pipelines.split(",") if p.strip()]
    yolo = None
    if "yolo" in pipes:
        if not args.onnx.exists():
            print(json.dumps({"error": f"missing onnx: {args.onnx}"}), file=sys.stderr)
            return 1
        yolo = YoloRunner(args.onnx, conf=args.conf, iou_thr=args.nms_iou)

    results: dict[str, Any] = {
        "config": {
            "n": len(samples),
            "seed": args.seed,
            "conf": args.conf,
            "nms_iou": args.nms_iou,
            "match_iou": args.match_iou,
            "pipelines": pipes,
            "vlm_model": args.vlm_model,
            "dataset": str(args.dataset),
            "sample_ids": [p[0].stem for p in samples],
        },
        "spend_usd": load_spend(),
        "pipelines": {},
        "summary": {},  # primary: filled from preferred pipeline for autoresearch
    }

    for p in pipes:
        name = "yolo_hybrid" if p == "yolo" else p
        try:
            block = run_pipeline(name, samples, yolo, args.vlm_model if name == "vlm" else None, args.match_iou)
        except Exception as e:
            block = {"pipeline": name, "error": str(e), "summary": {"overall_f1": 0.0}}
        results["pipelines"][name] = block

    # Primary metric: prefer yolo_hybrid overall_f1; if both present also expose comparison.
    primary = results["pipelines"].get("yolo_hybrid") or next(iter(results["pipelines"].values()))
    results["summary"] = {
        "overall_f1": primary.get("summary", {}).get("overall_f1", 0.0),
        "primary_pipeline": primary.get("pipeline"),
        "comparison": {
            k: v.get("summary", {})
            for k, v in results["pipelines"].items()
            if "summary" in v
        },
        "spend_usd": load_spend(),
    }

    text = json.dumps(results, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
