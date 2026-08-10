# Corbel plan-vision worker

RunPod Serverless worker for Corbel Trace.

## Current baseline

The worker currently provides a deployable classical-computer-vision baseline:

- HTTPS source download with host and size restrictions
- PNG/JPEG/WebP decoding
- PDF page rasterization
- image normalization
- axis-aligned wall candidate extraction
- OCR room-label and numeric-dimension candidates
- versioned `ReconstructionResultV1` output

It deliberately marks scale as low-confidence and does not claim door/window recognition. The next model adapter should replace wall candidate generation and add hosted opening detections using a floor-plan-specific trained model.

## Local evaluation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python evaluate.py ../../test-fixtures/floor-plans
```

## RunPod

Build and publish the Docker image, then create a queue-based RunPod Serverless endpoint. Configure its endpoint id and API key in the Next.js deployment.

The source allowlist defaults to Vercel Blob. Add test or private-storage hosts through `PLAN_IMPORT_ALLOWED_HOSTS`.
