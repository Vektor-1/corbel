# ml/

Training and dataset-preparation code for Corbel's wall-segmentation and
opening-detection models. This directory holds source code and small
configuration files only; trained checkpoints, the CubiCasa5K-derived
dataset, and other large artifacts are intentionally excluded from git
(see the repository-root `.gitignore`) and must be provided locally.

## Expected local layout (not tracked in git)

Scripts in this directory expect a dataset directory at:

```
ml/dataset -> <path-to-your-checkout>/datasets/dataset
```

Recreate this as a local symlink (or copy the data directly into
`ml/dataset/`) before running the training or conversion scripts. It is
not committed because the dataset is large and not redistributable from
this repository.

Other local-only, gitignored directories used by these scripts:

- `ml/dataset_seg/` — segmentation ground-truth masks derived from the
  dataset above (see `convert_cubicasa_seg.py`).
- `ml/cubicasa5k_coco/` — COCO-format annotation JSON derived from the
  dataset above (see `convert_cubicasa.py`).
- `ml/g0/`, `ml/colab-checkpoints/`, `ml/runs/` — training run outputs,
  logs, and exported `.onnx` / `.pt` checkpoints.
- `ml/.venv_vectorize/` — a Python virtual environment for the
  vectorization scripts; recreate with `pip install -r requirements.txt`.

## Contents

- `convert_cubicasa.py`, `convert_cubicasa_seg.py` — dataset conversion
  scripts (CubiCasa5K to COCO / segmentation masks).
- `train.py`, `train3.py`, `train4.py`, `train_seg_g0.py`,
  `train_lraspp_g0.py` and their `*_colab.ipynb` counterparts — model
  training entry points and Colab notebooks.
- `evaluate_masks.py`, `evaluate_vectorizer.py` — evaluation scripts for
  segmentation masks and the vectorization pipeline.
- `vectorize.py` — mask-to-vector conversion used by the reconstruction
  pipeline (see `backend/`).
- `synth/` — synthetic floor-plan generation for training data
  augmentation.
