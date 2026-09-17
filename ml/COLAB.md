# Full training run on Colab (free GPU)

Local smoke test first (`train.py --epochs 1`), then this for the real run.

**2026-09-05 update:** a benchmark against 200 held-out val images showed the
currently-shipped model's wall/door/window boxes are imprecise in a way no
amount of confidence/NMS threshold tuning or post-processing (box merging,
ground-truth re-splitting) can fix — see `corbel/benchmark_out/comparison-40/`
for the full writeup. That points at undertraining, so the recommended epoch
count below is now 150 (up from the original 50) with `patience=30` early
stopping as a safety net. This is a reasonable starting point based on that
diagnosis, not a hyperparameter search — nobody has actually run it yet (no
GPU was available in that session). Wall bbox-IoU may not reach 95% even with
this — axis-aligned boxes are inherently a hard fit for thin elongated shapes,
which is a task/metric property, not something more training reliably fixes.
Door/window (compact objects) are the more realistic 95% target.

## 1. Package the dataset

```bash
cd ml
zip -qr corbel-dataset.zip dataset/
```

(~1.9 GB. Upload to Google Drive once; reuse across sessions.)

## 2. Colab notebook cells

New notebook at colab.research.google.com, Runtime → Change runtime type → T4 GPU.

```python
# Cell 1 — mount Drive and unpack
from google.colab import drive
drive.mount('/content/drive')
!unzip -q /content/drive/MyDrive/corbel-dataset.zip -d /content/
```

```python
# Cell 2 — install
!pip install -q ultralytics
```

```python
# Cell 3 — fix dataset path (yaml has an absolute local path)
!sed -i 's|^path:.*|path: /content/dataset|' /content/dataset/cubicasa.yaml
```

```python
# Cell 4 — train (T4: roughly 2-4h/50 epochs at 640px; up to ~6-12h for the
# full 150, though patience=30 will stop earlier if val loss plateaus)
from ultralytics import YOLO
model = YOLO('yolov8n.pt')
model.train(data='/content/dataset/cubicasa.yaml', epochs=150, patience=30, imgsz=640,
            project='/content/drive/MyDrive/corbel-runs', name='corbel', exist_ok=True)
```

```python
# Cell 5 — export ONNX
best = '/content/drive/MyDrive/corbel-runs/corbel/weights/best.pt'
YOLO(best).export(format='onnx', imgsz=640, opset=17)
```

Weights + ONNX land in Drive at `corbel-runs/corbel/weights/`.

## 3. Bring the model back

Download `best.onnx` from Drive, then:

```bash
mkdir -p corbel/public/models
cp best.onnx corbel/public/models/corbel-detect.onnx
```

## Alternative: Hugging Face AutoTrain / Spaces GPU

HF free tier has no persistent free GPU for arbitrary training jobs; Colab free T4
is the simpler path. If using HF anyway: upload `dataset/` as a HF dataset repo,
run the same ultralytics commands in a paid Space or local GPU. Colab recommended.
