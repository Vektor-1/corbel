#!/bin/bash
# Claude Vision vs YOLO - Real API Benchmark with Live Output
#
# REQUIREMENTS:
#   1. Set your Anthropic API key:
#      export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
#   2. Run this script from corbel directory:
#      cd /Users/admin/Projects/Vektor-1/project/corbel
#      bash scripts/RUN_REAL_BENCHMARK.sh

set -e

VENV=/Users/admin/Projects/Vektor-1/project/corbel/scripts/.venv
PYTHON=$VENV/bin/python
SCRIPT_DIR=/Users/admin/Projects/Vektor-1/project/corbel/scripts

# Check if API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║ ERROR: ANTHROPIC_API_KEY not set                              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "To run Claude Vision benchmark with REAL data, you need to:"
    echo ""
    echo "1. Get your API key from: https://console.anthropic.com/account/keys"
    echo ""
    echo "2. Set it in your shell:"
    echo "   export ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE"
    echo ""
    echo "3. Then run this script again:"
    echo "   bash scripts/RUN_REAL_BENCHMARK.sh"
    echo ""
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║  🔍 CLAUDE VISION vs YOLO FLOOR PLAN DETECTION BENCHMARK                  ║"
echo "║     Real API Data with Live Terminal Output                               ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# CLAUDE VISION BENCHMARK (Real API)
# ============================================================
echo "1️⃣  Running Claude Vision benchmark (Real API)..."
echo ""

$PYTHON $SCRIPT_DIR/benchmark_claude_live.py \
    --n 10 \
    --seed 13 \
    --out $SCRIPT_DIR/.bench-cache/claude_vision_real.json

CLAUDE_RESULT=$?

if [ $CLAUDE_RESULT -eq 0 ]; then
    echo "✅ Claude Vision benchmark completed successfully"
else
    echo "❌ Claude Vision benchmark failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================
# YOLO BASELINE BENCHMARK
# ============================================================
echo "2️⃣  Running YOLO baseline benchmark..."
echo ""

cd /Users/admin/Projects/Vektor-1/project/corbel

$PYTHON $SCRIPT_DIR/benchmark.py \
    --n 10 \
    --seed 13 \
    --pipelines yolo \
    --out $SCRIPT_DIR/.bench-cache/yolo_baseline.json

YOLO_RESULT=$?

if [ $YOLO_RESULT -eq 0 ]; then
    echo ""
    echo "✅ YOLO baseline benchmark completed successfully"
else
    echo "❌ YOLO baseline benchmark failed"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║  📊 FINAL COMPARISON                                                       ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Extract and display comparison
CLAUDE_F1=$(jq -r '.summary.overall_f1' $SCRIPT_DIR/.bench-cache/claude_vision_real.json 2>/dev/null || echo "ERROR")
CLAUDE_WALL=$(jq -r '.summary.per_class.wall.f1' $SCRIPT_DIR/.bench-cache/claude_vision_real.json 2>/dev/null || echo "ERROR")
CLAUDE_DOOR=$(jq -r '.summary.per_class.door.f1' $SCRIPT_DIR/.bench-cache/claude_vision_real.json 2>/dev/null || echo "ERROR")
CLAUDE_WINDOW=$(jq -r '.summary.per_class.window.f1' $SCRIPT_DIR/.bench-cache/claude_vision_real.json 2>/dev/null || echo "ERROR")
CLAUDE_LATENCY=$(jq -r '.summary.mean_latency_ms' $SCRIPT_DIR/.bench-cache/claude_vision_real.json 2>/dev/null || echo "ERROR")

YOLO_F1=$(jq -r '.pipelines.yolo_hybrid.summary.overall_f1' $SCRIPT_DIR/.bench-cache/yolo_baseline.json 2>/dev/null || echo "ERROR")
YOLO_WALL=$(jq -r '.pipelines.yolo_hybrid.summary.per_class.wall.f1' $SCRIPT_DIR/.bench-cache/yolo_baseline.json 2>/dev/null || echo "ERROR")
YOLO_DOOR=$(jq -r '.pipelines.yolo_hybrid.summary.per_class.door.f1' $SCRIPT_DIR/.bench-cache/yolo_baseline.json 2>/dev/null || echo "ERROR")
YOLO_WINDOW=$(jq -r '.pipelines.yolo_hybrid.summary.per_class.window.f1' $SCRIPT_DIR/.bench-cache/yolo_baseline.json 2>/dev/null || echo "ERROR")
YOLO_LATENCY=$(jq -r '.pipelines.yolo_hybrid.summary.mean_latency_ms' $SCRIPT_DIR/.bench-cache/yolo_baseline.json 2>/dev/null || echo "ERROR")

cat << EOF

  OVERALL F1 SCORE:
  ┌─────────────────┬──────────┬────────────┬──────────┐
  │ Model           │ F1 Score │ vs Baseline│ Latency  │
  ├─────────────────┼──────────┼────────────┼──────────┤
  │ Claude Vision   │ $CLAUDE_F1   │     ---    │ ${CLAUDE_LATENCY}ms   │
  │ YOLO Baseline   │ $YOLO_F1   │     ---    │ ${YOLO_LATENCY}ms   │
  └─────────────────┴──────────┴────────────┴──────────┘

  PER-CLASS BREAKDOWN:
  ┌─────────────┬─────────────────┬─────────────────┬──────────────┐
  │ Class       │ Claude Vision   │ YOLO Baseline   │ Delta        │
  ├─────────────┼─────────────────┼─────────────────┼──────────────┤
  │ Walls       │ ${CLAUDE_WALL}             │ ${YOLO_WALL}             │ $(python3 -c "print(f'{float($CLAUDE_WALL) - float($YOLO_WALL):+.4f}')" 2>/dev/null || echo "ERROR") │
  │ Doors       │ ${CLAUDE_DOOR}             │ ${YOLO_DOOR}             │ $(python3 -c "print(f'{float($CLAUDE_DOOR) - float($YOLO_DOOR):+.4f}')" 2>/dev/null || echo "ERROR") │
  │ Windows     │ ${CLAUDE_WINDOW}             │ ${YOLO_WINDOW}             │ $(python3 -c "print(f'{float($CLAUDE_WINDOW) - float($YOLO_WINDOW):+.4f}')" 2>/dev/null || echo "ERROR") │
  └─────────────┴─────────────────┴─────────────────┴──────────────┘

  Full results saved to:
    • Claude Vision: $SCRIPT_DIR/.bench-cache/claude_vision_real.json
    • YOLO Baseline: $SCRIPT_DIR/.bench-cache/yolo_baseline.json

  View results:
    jq '.summary, .comparison' $SCRIPT_DIR/.bench-cache/claude_vision_real.json
    jq '.pipelines.yolo_hybrid.summary' $SCRIPT_DIR/.bench-cache/yolo_baseline.json

EOF

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║  ✅ Benchmark complete! Results ready for documentation.                   ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
