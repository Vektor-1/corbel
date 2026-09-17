# Claude Vision vs YOLO Benchmark - Quick Start

Real API data with live terminal output showing F1 scores as it processes.

## Step 1: Get Your API Key

Go to: https://console.anthropic.com/account/keys
Copy your API key (starts with `sk-ant-`)

## Step 2: Run the Benchmark

### Option A: Complete Comparison (Claude Vision + YOLO)

Copy and paste this entire command:

```bash
export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE && \
bash /Users/admin/Projects/Vektor-1/project/corbel/scripts/RUN_REAL_BENCHMARK.sh
```

This will:
1. Run Claude Vision on 10 floor plan images (real API calls)
2. Run YOLO baseline on same 10 images
3. Display live F1 scores for each image in terminal
4. Show final comparison table with per-class breakdowns
5. Save full JSON results to `.bench-cache/`

**Runtime:** ~20-30 seconds (Claude adds ~1-2 sec per image for API latency)

### Option B: Claude Vision Only

```bash
export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE && \
/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv/bin/python \
  /Users/admin/Projects/Vektor-1/project/corbel/scripts/benchmark_claude_live.py \
  --n 10 --seed 13 \
  --out /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/claude_results.json
```

**Runtime:** ~10-15 seconds

## Step 3: View Results

After the benchmark completes, results are in JSON format:

```bash
# View Claude Vision summary:
jq '.summary, .comparison' /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/claude_vision_real.json

# View YOLO summary:
jq '.pipelines.yolo_hybrid.summary' /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/yolo_baseline.json
```

## Expected Output

Terminal will show live progress like this:

```
==========================================================================================
  🔍 CLAUDE VISION FLOOR PLAN DETECTION BENCHMARK (Real API)
==========================================================================================

  Processing 10 floor plan images...

  Image ID                                     F1       W/D/W                Latency
  ──────────────────────────────────────────────────────────────────────────────────
    [ 1/10] ✓ high_quality_architectural_1856   0.9804 | W:0.941 D:1.000 W:1.000 | 1200ms
    [ 2/10] ✓ high_quality_architectural_3024   0.8778 | W:0.892 D:0.800 W:0.941 |  950ms
    [ 3/10] ✓ high_quality_architectural_2179   0.9024 | W:0.942 D:0.917 W:0.848 | 1100ms
    [ 4/10] ✓ high_quality_architectural_2031   0.8822 | W:0.897 D:1.000 W:0.750 | 1050ms
    ...

==========================================================================================
  RESULTS SUMMARY
==========================================================================================

  OVERALL F1 SCORE:
    Claude Vision:  0.8695
    YOLO Baseline:  0.8423
    📈 Delta:       +0.0272

  PER-CLASS BREAKDOWN:

    WALLS:
      Claude Vision: F1=0.9264 (P=0.9626, R=0.8927)
      YOLO Baseline: F1=0.7785
      Delta: +0.1479

    DOORS:
      Claude Vision: F1=0.8251 (P=0.8000, R=0.8519)
      YOLO Baseline: F1=0.8789
      Delta: -0.0538

    WINDOWS:
      Claude Vision: F1=0.8571 (P=0.8969, R=0.8208)
      YOLO Baseline: F1=0.8696
      Delta: -0.0125

  STATISTICS:
    Images tested:   10
    Mean latency:    1050.0ms

==========================================================================================
```

## What Gets Saved

All results are saved as JSON in: `/Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/`

### Claude Vision Results
File: `claude_vision_real.json`

Contains:
- Per-image detections and F1 scores
- Aggregate statistics (precision, recall, F1 by class)
- Latency metrics
- Comparison with YOLO baseline

### YOLO Results
File: `yolo_baseline.json`

Contains:
- Per-image detections and F1 scores
- Aggregate statistics
- Configuration details

## Copy Results to Document

After running, copy the terminal output directly:

1. Run the benchmark command
2. When it completes, select all terminal output (Cmd+A if using Terminal.app)
3. Copy (Cmd+C)
4. Paste into your document

The output includes all F1 scores, precision/recall metrics, and comparison table.

Alternatively, export as JSON:

```bash
# Pretty-print for documentation
jq '.' /Users/admin/Projects/Vektor-1/project/corbel/scripts/.bench-cache/claude_vision_real.json
```

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Make sure you set it in your shell:
```bash
export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

It must start with `sk-ant-`

### "Could not resolve authentication method"
The API key wasn't found. Try:
```bash
echo $ANTHROPIC_API_KEY
```

If it's empty, the export didn't work.

### "ModuleNotFoundError: anthropic"
Install the SDK:
```bash
/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv/bin/pip install anthropic
```

### API rate limit errors
If you get rate limit errors, reduce `--n` to fewer images:
```bash
--n 5
```

## File Reference

| File | Purpose |
|------|---------|
| `benchmark_claude_live.py` | Main benchmark with live terminal output |
| `RUN_REAL_BENCHMARK.sh` | Complete runner (Claude Vision + YOLO) |
| `CLAUDE_VISION_BENCHMARK.md` | Technical details and implementation info |
| `BENCHMARK_COMMANDS.md` | All command variations |
| `QUICKSTART.md` | This file |

## Next Steps

1. Run the benchmark with your API key
2. Copy the terminal output to your documentation
3. Review the JSON results in `.bench-cache/`
4. Compare Claude Vision performance with YOLO baseline
