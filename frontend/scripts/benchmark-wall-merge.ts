#!/usr/bin/env node
/**
 * Reproducible evaluator for the collinear wall-merge pass.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT
 * This runs against a synthetic plan whose fragmentation is generated from the
 * root cause documented in context.md -- hatch-pattern fill leaves a 1-3px
 * sawtooth ripple on wall boundaries, `medial_axis` faithfully reproduces it,
 * and every ripple becomes a spurious skeleton node that splits an otherwise
 * straight wall into legitimate >=3px fragments.
 *
 * Because ground truth is known here, this detects OVER-merging (collapsing a
 * real corner) as well as under-merging, which a run against live backend
 * output cannot do. What it does NOT establish is the real-world recovery rate:
 * that needs the G0 model's actual masks, which requires the GPU instance. Treat
 * these as mechanism evidence, not as a field result.
 *
 * Reference figures from the backend's own topology.py attempt (context.md,
 * measured on arch_9483): 82 -> 74 walls, 39.0% -> 41.9% under 15px. That pass
 * used a fixed 5deg/2px window, which is tighter than the ripple it was trying
 * to absorb.
 *
 * npx tsx scripts/benchmark-wall-merge.ts
 */
import { mergeCollinearWalls } from '../src/lib/plan-import/mergeWalls';
import type { DetectedWall } from '../src/lib/plan-import/types';

let seed = 42;
/** Deterministic LCG so runs are comparable across machines. */
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Four rooms sharing edges: 16 room sides lying on 7 maximal straight runs. */
function groundTruth(): Seg[] {
  const segs: Seg[] = [];
  const rooms = [
    [0, 0, 400, 300],
    [400, 0, 760, 300],
    [0, 300, 300, 640],
    [300, 300, 760, 640],
  ];
  for (const [x1, y1, x2, y2] of rooms) {
    segs.push(
      { x1, y1, x2, y2: y1 },
      { x1: x2, y1, x2, y2 },
      { x1: x2, y1: y2, x2: x1, y2 },
      { x1, y1: y2, x2: x1, y2: y1 }
    );
  }
  return segs;
}

/**
 * Hatch ripple is a sawtooth on the mask boundary, so the medial axis it produces
 * deviates SMOOTHLY rather than jumping per point, and skeleton tracing emits a
 * connected chain in which consecutive fragments share an endpoint exactly. An
 * earlier version of this harness jittered each endpoint independently, which gave
 * a 3px fragment a near-random direction and understated recovery badly.
 */
function fragment(segs: Seg[], ripplePx: number): DetectedWall[] {
  const out: DetectedWall[] = [];
  let id = 0;
  for (const seg of segs) {
    const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const ux = (seg.x2 - seg.x1) / length;
    const uy = (seg.y2 - seg.y1) / length;
    const nx = -uy;
    const ny = ux;
    const phase = rand() * Math.PI * 2;
    const frequency = 0.35 + rand() * 0.35;
    const deviation = (t: number) => ripplePx * Math.sin(t * frequency + phase);
    const pointAt = (t: number) => ({
      x: seg.x1 + ux * t + nx * deviation(t),
      y: seg.y1 + uy * t + ny * deviation(t),
    });

    let t = 0;
    while (t < length) {
      const step = Math.min(length - t, 3 + rand() * 22);
      out.push({
        id: `w${id++}`,
        kind: 'wall',
        confidence: 0.8,
        start: pointAt(t),
        end: pointAt(t + step),
        thicknessMm: 225,
      });
      t += step;
    }
  }
  return out;
}

/** Two sides of a corridor. Merging these would be worse than any fragmentation. */
const corridor = (separationPx: number): DetectedWall[] => [
  { id: 'a', kind: 'wall', confidence: 0.9, start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, thicknessMm: 225 },
  { id: 'b', kind: 'wall', confidence: 0.9, start: { x: 0, y: separationPx }, end: { x: 200, y: separationPx }, thicknessMm: 225 },
];

/** A real right-angle corner, which must survive however short its arms are. */
const corner = (armPx: number): DetectedWall[] => [
  { id: 'a', kind: 'wall', confidence: 0.9, start: { x: 0, y: 0 }, end: { x: armPx, y: 0 }, thicknessMm: 225 },
  { id: 'b', kind: 'wall', confidence: 0.9, start: { x: armPx, y: 0 }, end: { x: armPx, y: armPx }, thicknessMm: 225 },
];

function stats(walls: DetectedWall[]) {
  const lengths = walls
    .map((wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y))
    .sort((a, b) => a - b);
  return {
    count: walls.length,
    under15: (lengths.filter((l) => l < 15).length / lengths.length) * 100,
    median: lengths[Math.floor(lengths.length / 2)],
  };
}

const truth = groundTruth();
// The four rooms share edges, so 16 room sides collapse into 7 maximal straight
// runs -- that, not 16, is perfect recovery.
const IDEAL_RUNS = 7;
const SEEDS = 20;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

console.log(`Ground truth: ${truth.length} room edges forming ${IDEAL_RUNS} maximal straight runs.`);
console.log(`Medians over ${SEEDS} seeds.\n`);
console.log('ripple  fragmented  merged  <15px before/after  reduction');
console.log('──────  ──────────  ──────  ──────────────────  ─────────');

for (const ripple of [0, 1, 2, 3]) {
  const before: number[] = [];
  const after: number[] = [];
  const shortBefore: number[] = [];
  const shortAfter: number[] = [];

  for (let s = 1; s <= SEEDS; s++) {
    seed = s * 7919;
    const fragmented = fragment(truth, ripple);
    const merged = mergeCollinearWalls(fragmented);
    before.push(stats(fragmented).count);
    after.push(stats(merged.walls).count);
    shortBefore.push(stats(fragmented).under15);
    shortAfter.push(stats(merged.walls).under15);
  }

  const b = median(before);
  const a = median(after);
  console.log(
    `  ${ripple}px   ${String(b).padStart(10)}  ${String(a).padStart(6)}  ` +
      `${(median(shortBefore).toFixed(1) + '%').padStart(7)} / ${(median(shortAfter).toFixed(1) + '%').padStart(6)}  ` +
      `${(100 - (a / b) * 100).toFixed(0).padStart(6)}%`
  );
}

console.log('\nSafety guards — these must never merge:');
for (const separation of [5, 6, 8, 10]) {
  const kept = mergeCollinearWalls(corridor(separation)).walls.length === 2;
  console.log(`  corridor, ${String(separation).padStart(2)}px apart   ${kept ? 'preserved' : '** MERGED **'}`);
}
for (const arm of [3, 5, 10, 50]) {
  const kept = mergeCollinearWalls(corner(arm)).walls.length === 2;
  console.log(`  corner, ${String(arm).padStart(2)}px arms      ${kept ? 'preserved' : '** MERGED **'}`);
}

seed = 1;
const large = fragment(truth, 2);
const startedAt = Date.now();
mergeCollinearWalls(large);
console.log(`\nPerformance: ${large.length} fragments merged in ${Date.now() - startedAt}ms.`);
