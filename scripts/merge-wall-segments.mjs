// Merges wall boxes that are collinear segments of the same straight wall run
// (the model naturally breaks a wall at every T-junction; CubiCasa's ground
// truth spans the whole straight run instead). Exported so both the sweep
// script and a future local-ml.ts port can share one implementation.

function orientation(box) {
  return box.x1 - box.x0 >= box.y1 - box.y0 ? 'h' : 'v';
}

function bandOverlap(a0, a1, b0, b1) {
  const inter = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const union = Math.max(a1, b1) - Math.min(a0, b0);
  return union > 0 ? inter / union : 0;
}

// Union-find over one orientation's boxes: merge i,j when their thickness
// bands overlap enough and the gap between their run-axis extents is small.
function mergeAxis(boxes, runAxis, { gapTolerance, minBandOverlap }) {
  const n = boxes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = boxes[i], b = boxes[j];
      const [aBand0, aBand1, aRun0, aRun1] = runAxis === 'x' ? [a.y0, a.y1, a.x0, a.x1] : [a.x0, a.x1, a.y0, a.y1];
      const [bBand0, bBand1, bRun0, bRun1] = runAxis === 'x' ? [b.y0, b.y1, b.x0, b.x1] : [b.x0, b.x1, b.y0, b.y1];
      if (bandOverlap(aBand0, aBand1, bBand0, bBand1) < minBandOverlap) continue;
      const gap = Math.max(aRun0, bRun0) - Math.min(aRun1, bRun1); // negative/zero if overlapping
      const runOverlap = Math.min(aRun1, bRun1) - Math.max(aRun0, bRun0);
      if (gap <= gapTolerance || runOverlap > 0) union(i, j);
    }
  }

  const groups = new Map();
  boxes.forEach((box, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(box);
  });

  return [...groups.values()].map((group) => ({
    cls: group[0].cls,
    confidence: Math.max(...group.map((b) => b.confidence)),
    x0: Math.min(...group.map((b) => b.x0)),
    y0: Math.min(...group.map((b) => b.y0)),
    x1: Math.max(...group.map((b) => b.x1)),
    y1: Math.max(...group.map((b) => b.y1)),
  }));
}

/** Merge collinear wall-box fragments into full straight-run boxes. Only
 *  affects cls===0 (wall); doors/windows pass through untouched. */
export function mergeWallSegments(boxes, options = {}) {
  const { gapTolerance = 20, minBandOverlap = 0.3 } = options;
  const walls = boxes.filter((b) => b.cls === 0);
  const others = boxes.filter((b) => b.cls !== 0);
  const horizontal = walls.filter((b) => orientation(b) === 'h');
  const vertical = walls.filter((b) => orientation(b) === 'v');
  const mergedH = mergeAxis(horizontal, 'x', { gapTolerance, minBandOverlap });
  const mergedV = mergeAxis(vertical, 'y', { gapTolerance, minBandOverlap });
  return [...others, ...mergedH, ...mergedV];
}
