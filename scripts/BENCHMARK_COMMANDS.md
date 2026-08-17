# Quick Benchmark Commands

Copy and paste these commands to test Claude Vision vs YOLO benchmarks.

## Claude Vision Benchmark

**Fast (Simulated - no API key needed, instant results):**

```bash
cd /Users/admin/Projects/Vektor-1/project/corbel && \
/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv/bin/python scripts/benchmark_claude_vision.py --n 10 --seed 13 --out scripts/.bench-cache/claude_vision.json 2>&1 | tee scripts/.bench-cache/claude_vision_log.txt
```

**Real API (requires ANTHROPIC_API_KEY):**

```bash
export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE && \
cd /Users/admin/Projects/Vektor-1/project/corbel && \
/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv/bin/python scripts/benchmark_claude_vision.py --n 10 --seed 13 --real --out scripts/.bench-cache/claude_vision_real.json 2>&1 | tee scripts/.bench-cache/claude_vision_real_log.txt
```

## YOLO Baseline Benchmark

```bash
cd /Users/admin/Projects/Vektor-1/project/corbel && \
/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv/bin/python scripts/benchmark.py --n 10 --seed 13 --pipelines yolo --out scripts/.bench-cache/yolo_baseline.json 2>&1 | tee scripts/.bench-cache/yolo_baseline_log.txt
```

## View Results

After running, view the JSON results:

**Claude Vision:**
```bash
cat /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/claude_vision.json | jq '.comparison, .summary'
```

**YOLO:**
```bash
cat /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/yolo_baseline.json | jq '.summary'
```

## Quick Summary Comparison

```bash
echo "=== CLAUDE VISION ===" && \
jq '.summary | {overall_f1: .overall_f1, wall: .per_class.wall.f1, door: .per_class.door.f1, window: .per_class.window.f1}' \
  /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/claude_vision.json && \
echo "" && \
echo "=== YOLO BASELINE ===" && \
jq '.summary | {overall_f1: .overall_f1, wall: .per_class.wall.f1, door: .per_class.door.f1, window: .per_class.window.f1}' \
  /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/yolo_baseline.json
```

## Expected Output Format

Each benchmark outputs JSON with this structure:

```json
{
  "summary": {
    "overall_f1": 0.8695,
    "per_class": {
      "wall": {"f1": 0.9264, "precision": 0.9626, "recall": 0.8927},
      "door": {"f1": 0.8251, "precision": 0.8000, "recall": 0.8519},
      "window": {"f1": 0.8571, "precision": 0.8969, "recall": 0.8208}
    },
    "n": 10,
    "mean_latency_ms": 0.0
  },
  "comparison": {
    "claude_vision_f1": 0.8695,
    "yolo_baseline_f1": 0.8423,
    "delta_f1": 0.0272
  }
}
```

## Paste Results Here

Run the commands above and paste the output here:

### Claude Vision Results
```
[Paste output here]
```

### YOLO Baseline Results
```
[Paste output here]
```

### Summary
```
Claude Vision F1: 
YOLO Baseline F1: 
Delta: 
```
