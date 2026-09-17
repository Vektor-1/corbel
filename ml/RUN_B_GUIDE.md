# Run B: Synthetic Data Fine-Tuning — Quick Start

## Status
✓ **Synthetic data generated** (800 floor plans + labels)  
✓ **Train4 scripts ready** (Python + Colab notebook)  
⏳ **Next: Run on Colab T4**

## What is Run B?
- **Input**: Run A checkpoint (yolov8s, 81.0% overall F1)
- **Data**: Base dataset (4,200 images) + 800 synthetic procedurally-generated floor plans
- **Output**: Fine-tuned yolov8s ONNX (Run B model, target: 85%+ overall, 90%+ door/window)
- **Expected time**: 5-8 hours on Colab T4

---

## Quick Start: Choose Your Method

### Method 1: Automated Colab CLI (Recommended if `colab` CLI is installed)

```bash
cd ml
bash run_runB.sh
```

This handles everything:
1. Provision Colab T4 GPU
2. Download base dataset
3. Upload 800 synthetic images
4. Run training in background (detached process)
5. Polls progress every 15 min
6. Downloads final ONNX when complete
7. Stops the VM to save compute

**Monitor progress:**
```bash
colab log -s corbel-runB
```

**When done, download ONNX manually (if the script didn't):**
```bash
colab download -s corbel-runB \
  /content/drive/MyDrive/corbel-runs/corbel-runB/weights/best.onnx \
  ml/train4.onnx
```

**Stop the VM (IMPORTANT — saves compute units):**
```bash
colab stop -s corbel-runB
```

---

### Method 2: Manual Colab (Familiar browser-based workflow)

1. Open Colab: https://colab.research.google.com/
2. Upload `ml/train4_colab.ipynb` or create new notebook
3. Copy/paste the cells from `ml/train4_colab.ipynb`:

**Cell 1: GPU Check & Mount Drive**
```python
!nvidia-smi --query-gpu=name,memory.total --format=csv
from google.colab import drive
drive.mount('/content/drive')
```

**Cell 2: Dataset Setup**
```python
!unzip -q /content/drive/MyDrive/fyp-dataset/corbel-dataset.zip -d /content/
!sed -i 's|^path:.*|path: /content/dataset|' /content/dataset/cubicasa.yaml
print("✓ Base dataset ready")
```

**Cell 3: Install Ultralytics**
```python
!pip install -q ultralytics
```

**Cell 4: Upload & Merge Synthetic Images**
- Use Colab's file upload UI to upload `ml/synth/output/images/` and `ml/synth/output/labels/`
- Or drag-drop the directories into the left sidebar
- Then run the merge script (see notebook)

**Cell 5: Fine-Tune (100 epochs, ~5-8 hours)**
```python
from ultralytics import YOLO
import os

# Load Run A checkpoint
model = YOLO('/content/drive/MyDrive/corbel-runs/corbel-runA-transfer/weights/best.pt')

# Fine-tune on merged dataset
model.train(
    data='/content/dataset/cubicasa.yaml',
    epochs=100,
    patience=40,
    imgsz=640,
    optimizer='AdamW',
    batch=-1,
    lr0=0.001,
    lrf=0.0001,
    warmup_epochs=5,
    copy_paste=0.3,
    mixup=0.1,
    degrees=5.0,
    erasing=0.25,
    project='/content/drive/MyDrive/corbel-runs',
    name='corbel-runB',
    exist_ok=True,
)
```

**Cell 6: Export ONNX**
```python
from ultralytics import YOLO
model = YOLO('/content/drive/MyDrive/corbel-runs/corbel-runB/weights/best.pt')
onnx_path = model.export(format='onnx', imgsz=640, opset=17)
print(f"✓ ONNX exported: {onnx_path}")
```

---

## After Training Completes

### 1. Download the ONNX
```bash
colab download -s corbel-runB \
  /content/drive/MyDrive/corbel-runs/corbel-runB/weights/best.onnx \
  ml/train4.onnx
```

Or from Colab: Download from Google Drive manually.

### 2. Benchmark Run B

```bash
cd corbel
node --experimental-strip-types scripts/benchmark-local-yolo.ts \
  --split test --n 400 \
  --model ../ml/train4.onnx \
  --out scripts/.bench-cache/yolo_test_runB.json
```

### 3. Compare Results

| Model | Wall | Door | Window | Overall |
|-------|------|------|--------|---------|
| Baseline (yolov8n, 50ep) | 74.5% | 81.1% | 80.1% | 78.5% |
| Retrain (yolov8n, 142ep) | 76.2% | 82.9% | 81.3% | 80.1% |
| Run A (yolov8s transfer) | 76.5% | 84.6% | 81.9% | **81.0%** |
| **Run B (yolov8s + synth)** | TBD | TBD | TBD | **TBD** |

### 4. Decide on Promotion

- **If door ≥ 90% and window ≥ 90%**: Promote to production ✓
  ```bash
  cp ml/train4.onnx corbel/public/models/corbel-detect.onnx
  ```
  
- **If 85–89%**: Acceptable improvement; promote with thesis note
  
- **If < 85%**: Iterate (yolov8m, more data, or accept lower targets)

---

## Files Reference

| File | Purpose |
|------|---------|
| `ml/train4.py` | Training script (Python) |
| `ml/train4_colab.ipynb` | Colab notebook cells |
| `ml/run_runB.sh` | Full Colab CLI automation |
| `ml/synth/generate_simple.py` | Synthetic data generator |
| `ml/synth/output/images/` | 800 generated floor plans |
| `ml/synth/output/labels/` | Corresponding YOLO labels |

---

## Troubleshooting

**Q: Colab says "out of quota" on T4**
A: Fallback to N1 (CPU-only) — much slower but free. Adjust `colab new -s corbel-runB --gpu T4` to `--cpu N1`.

**Q: Synthetic images failed to upload to Colab**
A: The script tries via `colab upload`. If network is flaky, upload manually in Colab's sidebar instead.

**Q: Training is taking longer than expected**
A: Colab T4s are shared; during peak hours they're slower. 8h is typical; 12h isn't unreasonable.

**Q: How do I monitor progress mid-training?**
A: CLI: `colab log -s corbel-runB`. Browser: Colab's Training cell output updates in real-time.

---

## Success Criteria

| Metric | Baseline | Run A | Run B Target |
|--------|----------|-------|-------------|
| Door F1 | 81.1% | 84.6% | **90%+** |
| Window F1 | 80.1% | 81.9% | **90%+** |
| Wall F1 | 74.5% | 76.5% | 80% (geometric ceiling) |
| Overall F1 | 78.5% | 81.0% | **85%+** |

---

**Ready? Start with Method 1 (CLI) or Method 2 (Browser). Good luck! 🚀**
