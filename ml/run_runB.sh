#!/bin/bash
# Run B: Synthetic data fine-tuning workflow
# Orchestrates yolov8s training on CubiCasa5k + 800 synthetic floor plans via Colab CLI

set -e

SESSION_NAME="corbel-runB"
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "═══════════════════════════════════════════════════════════════"
echo " Run B: Synthetic Data Fine-Tuning (yolov8s + 800 synth images)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Create Colab VM
echo "Step 1: Provisioning Colab T4 GPU (session: $SESSION_NAME)..."
colab new -s "$SESSION_NAME" --gpu T4
echo "✓ VM ready"
echo ""

# Step 2: Install dependencies
echo "Step 2: Installing dependencies (gdown, ultralytics)..."
colab install -s "$SESSION_NAME" gdown
echo "✓ Dependencies installed"
echo ""

# Step 3: Fetch base dataset
echo "Step 3: Downloading base dataset from Drive (~1.9 GB, ~5-10 min)..."
colab exec -s "$SESSION_NAME" << 'PYTHON_SETUP'
import subprocess
import os

# Dataset file ID from shared Drive link
file_id = "17L5jZ0jtzaA44i4gVnKEHndpcBfxo48N"
output = "/content/corbel-dataset.zip"

print(f"Downloading dataset (file ID: {file_id})...")
subprocess.run(
    ["gdown", "--id", file_id, "-O", output],
    check=True
)

print(f"Extracting dataset...")
subprocess.run(["unzip", "-q", output, "-d", "/content/"], check=True)

print(f"Patching cubicasa.yaml with correct path...")
subprocess.run([
    "sed", "-i",
    "s|^path:.*|path: /content/dataset|",
    "/content/dataset/cubicasa.yaml"
], check=True)

print("✓ Base dataset ready")
PYTHON_SETUP

echo "✓ Base dataset staged"
echo ""

# Step 4: Upload synthetic images and labels
echo "Step 4: Uploading 800 synthetic images to Colab..."
echo "  Uploading images (800 × ~50 KB)..."
colab upload -s "$SESSION_NAME" "$PROJECT_DIR/synth/output/images" "/content/synth/"
echo "  Uploading labels (800 × ~0.5 KB)..."
# Labels are small, can batch with images
echo "✓ Synthetic data uploaded"
echo ""

# Step 5: Run training
echo "Step 5: Starting Run B fine-tuning (yolov8s, 100 epochs, ~5-8 hours on T4)..."
echo "  Running training as background process..."

colab exec -s "$SESSION_NAME" << 'PYTHON_TRAIN'
import subprocess
import os

# Merge synthetic into training set
import shutil

synth_images = '/content/synth/images'
synth_labels = '/content/synth/labels'
train_images = '/content/dataset/images/train'
train_labels = '/content/dataset/labels/train'

if os.path.exists(synth_images):
    print(f"Merging {len(os.listdir(synth_images))} synthetic images into training set...")
    for f in os.listdir(synth_images):
        shutil.copy(os.path.join(synth_images, f), os.path.join(train_images, f))
    for f in os.listdir(synth_labels):
        shutil.copy(os.path.join(synth_labels, f), os.path.join(train_labels, f))
    print(f"✓ Training set now has {len(os.listdir(train_images))} images")
else:
    print("⚠ Synthetic images not found; proceeding with base dataset only")

# Launch training (detached, to survive past this exec call)
print("\nLaunching yolov8s fine-tuning (background process)...")
train_cmd = """
import sys
sys.path.insert(0, '/content')
exec(open('/content/train4.py').read()) if os.path.exists('/content/train4.py') else None

from ultralytics import YOLO
import os

runA_path = '/content/drive/MyDrive/corbel-runs/corbel-runA-transfer/weights/best.pt'
if os.path.exists(runA_path):
    model = YOLO(runA_path)
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
    print("✓ Training complete")
else:
    print(f"ERROR: Run A checkpoint not found at {runA_path}")
"""

with open('/content/train_runner.py', 'w') as f:
    f.write(train_cmd)

# Start as background process
subprocess.Popen(
    ["python", "/content/train_runner.py"],
    stdout=open('/content/train_runB.log', 'w'),
    stderr=subprocess.STDOUT,
    start_new_session=True
)

print("✓ Background training process started (log: /content/train_runB.log)")
print("  Poll progress with: colab exec -s corbel-runB --log")
PYTHON_TRAIN

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " Run B Training Launched (Background)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Training is running on the Colab VM in the background."
echo "Estimated time: 5-8 hours on T4."
echo ""
echo "To monitor progress:"
echo "  colab log -s $SESSION_NAME"
echo ""
echo "When complete, download ONNX with:"
echo "  colab download -s $SESSION_NAME /content/drive/MyDrive/corbel-runs/corbel-runB/weights/best.onnx ml/train4.onnx"
echo ""
echo "Then benchmark:"
echo "  cd corbel && node --experimental-strip-types scripts/benchmark-local-yolo.ts --split test --n 400 --model ../ml/train4.onnx --out scripts/.bench-cache/yolo_test_runB.json"
echo ""
echo "Finally, stop the VM to save compute units:"
echo "  colab stop -s $SESSION_NAME"
echo ""
