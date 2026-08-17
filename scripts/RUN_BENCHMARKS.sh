#!/bin/bash
# Claude Vision vs YOLO Benchmark Commands
# Copy and paste these commands to test both pipelines

set -e

VENV=/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv
PYTHON=$VENV/bin/python
SCRIPT_DIR=/Users/admin/Projects/Vektor-1/project/corbel/scripts
CACHE_DIR=$SCRIPT_DIR/.bench-cache
OUTPUT_DIR=$CACHE_DIR

mkdir -p $OUTPUT_DIR

echo "=========================================="
echo "Floor Plan Detection Benchmark Commands"
echo "=========================================="
echo ""

# ============================================================
# OPTION 1: Run Claude Vision (Simulated - instant)
# ============================================================
echo "1. CLAUDE VISION BENCHMARK (Simulated - instant, no API key needed)"
echo "   Command to copy and run:"
echo ""
echo "$PYTHON $SCRIPT_DIR/benchmark_claude_vision.py --n 10 --seed 13 --out $OUTPUT_DIR/claude_vision.json"
echo ""
echo "Run it with:"
echo "-------"
eval "$PYTHON $SCRIPT_DIR/benchmark_claude_vision.py --n 10 --seed 13 --out $OUTPUT_DIR/claude_vision.json" 2>&1 | tee $OUTPUT_DIR/claude_vision_log.txt
echo "-------"
echo ""
echo "Results saved to: $OUTPUT_DIR/claude_vision.json"
echo ""

# ============================================================
# OPTION 2: Run YOLO Baseline
# ============================================================
echo "2. YOLO BASELINE BENCHMARK"
echo "   Command to copy and run:"
echo ""
echo "$PYTHON $SCRIPT_DIR/benchmark.py --n 10 --seed 13 --pipelines yolo --out $OUTPUT_DIR/yolo_baseline.json"
echo ""
echo "Run it with:"
echo "-------"
eval "$PYTHON $SCRIPT_DIR/benchmark.py --n 10 --seed 13 --pipelines yolo --out $OUTPUT_DIR/yolo_baseline.json" 2>&1 | tee $OUTPUT_DIR/yolo_baseline_log.txt
echo "-------"
echo ""
echo "Results saved to: $OUTPUT_DIR/yolo_baseline.json"
echo ""

# ============================================================
# OPTION 3: Run Both and Compare
# ============================================================
echo "3. COMPARISON SUMMARY"
echo "=========================================="
echo ""

# Extract F1 scores
CLAUDE_F1=$(jq -r '.summary.overall_f1' $OUTPUT_DIR/claude_vision.json 2>/dev/null || echo "N/A")
CLAUDE_WALL=$(jq -r '.summary.per_class.wall.f1' $OUTPUT_DIR/claude_vision.json 2>/dev/null || echo "N/A")
CLAUDE_DOOR=$(jq -r '.summary.per_class.door.f1' $OUTPUT_DIR/claude_vision.json 2>/dev/null || echo "N/A")
CLAUDE_WINDOW=$(jq -r '.summary.per_class.window.f1' $OUTPUT_DIR/claude_vision.json 2>/dev/null || echo "N/A")

YOLO_F1=$(jq -r '.summary.overall_f1' $OUTPUT_DIR/yolo_baseline.json 2>/dev/null || echo "N/A")
YOLO_WALL=$(jq -r '.summary.per_class.wall.f1' $OUTPUT_DIR/yolo_baseline.json 2>/dev/null || echo "N/A")
YOLO_DOOR=$(jq -r '.summary.per_class.door.f1' $OUTPUT_DIR/yolo_baseline.json 2>/dev/null || echo "N/A")
YOLO_WINDOW=$(jq -r '.summary.per_class.window.f1' $OUTPUT_DIR/yolo_baseline.json 2>/dev/null || echo "N/A")

cat << EOF

BENCHMARK RESULTS
=================

CLAUDE VISION F1: $CLAUDE_F1
  Wall:   $CLAUDE_WALL
  Door:   $CLAUDE_DOOR
  Window: $CLAUDE_WINDOW

YOLO BASELINE F1: $YOLO_F1
  Wall:   $YOLO_WALL
  Door:   $YOLO_DOOR
  Window: $YOLO_WINDOW

Full results:
  Claude Vision: $OUTPUT_DIR/claude_vision.json
  YOLO Baseline: $OUTPUT_DIR/yolo_baseline.json

EOF

echo "=========================================="
echo "Done!"
