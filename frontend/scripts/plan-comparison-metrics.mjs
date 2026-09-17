export function scoreCounts(tp, fp, fn) {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, precision, recall, f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0 };
}

// Maximum-cardinality one-to-one matching. A prediction cannot claim two labels.
export function matchPoints(predicted, expected, tolerance) {
  const owner = new Array(expected.length).fill(-1);
  const assign = (p, seen) => {
    for (let t = 0; t < expected.length; t++) {
      if (seen.has(t) || Math.hypot(predicted[p][0] - expected[t][0], predicted[p][1] - expected[t][1]) > tolerance) continue;
      seen.add(t);
      if (owner[t] < 0 || assign(owner[t], seen)) { owner[t] = p; return true; }
    }
    return false;
  };
  let tp = 0;
  for (let p = 0; p < predicted.length; p++) if (assign(p, new Set())) tp++;
  return scoreCounts(tp, predicted.length - tp, expected.length - tp);
}

export function polylinesToSegments(lines) {
  return lines.flatMap(line => {
    const result = [];
    for (let i = 0; i + 3 < line.length; i += 2) result.push(line.slice(i, i + 4));
    return result;
  });
}

function distance(x, y, [ax, ay, bx, by]) {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// Length-weighted sampled centreline coverage, invariant to segment splitting.
function coveredLength(from, to, tolerance) {
  let total = 0, covered = 0;
  for (const [ax, ay, bx, by] of from) {
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length));
    total += length;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      if (to.some(segment => distance(ax + t * (bx - ax), ay + t * (by - ay), segment) <= tolerance)) covered += length / steps;
    }
  }
  return { total, covered };
}

export function matchLines(predicted, expected, tolerance) {
  const p = coveredLength(predicted, expected, tolerance);
  const r = coveredLength(expected, predicted, tolerance);
  const precision = p.total ? p.covered / p.total : 0;
  const recall = r.total ? r.covered / r.total : 0;
  return { predictedLength: p.total, referenceLength: r.total, supportedLength: p.covered, recoveredLength: r.covered,
    precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

export function boxIou(a, b) {
  const area = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - area;
  return union > 0 ? area / union : 0;
}

export function matchBoxes(predicted, expected, threshold = 0.5) {
  const used = new Set();
  let tp = 0;
  for (const p of [...predicted].sort((a, b) => b.confidence - a.confidence)) {
    let best = -1, overlap = threshold;
    expected.forEach((t, index) => {
      if (!used.has(index) && boxIou(p, t) >= overlap) { best = index; overlap = boxIou(p, t); }
    });
    if (best >= 0) { used.add(best); tp++; }
  }
  return scoreCounts(tp, predicted.length - tp, expected.length - tp);
}
