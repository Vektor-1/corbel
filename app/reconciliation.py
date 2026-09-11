"""Evidence-gated global reconciliation of fragmented wall runs."""
from dataclasses import dataclass
from math import hypot

import cv2
import numpy as np

from .fusion import Segment, collinear_within_offset


@dataclass
class ReconciliationResult:
    walls: list[Segment]
    diagnostics: list[dict]
    metrics: dict


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return hypot(a[0] - b[0], a[1] - b[1])


def _nearest_endpoints(left: Segment, right: Segment) -> tuple[tuple[float, float], tuple[float, float], float]:
    start, end = min(
        ((a, b) for a in (left.start, left.end) for b in (right.start, right.end)),
        key=lambda pair: _distance(*pair),
    )
    return start, end, _distance(start, end)


def _same_run(left: Segment, right: Segment, config: dict) -> bool:
    if not collinear_within_offset(left, right, config["maxLineOffsetPx"]):
        return False
    thickness_delta = abs(left.thickness_mm - right.thickness_mm) / max(left.thickness_mm, right.thickness_mm, 1)
    return thickness_delta <= config["maxThicknessRatioDelta"]


def _line_support(start: tuple[float, float], end: tuple[float, float], evidence: np.ndarray) -> float:
    length = max(1, int(round(_distance(start, end))))
    xs = np.clip(np.rint(np.linspace(start[0], end[0], length + 1)).astype(int), 0, evidence.shape[1] - 1)
    ys = np.clip(np.rint(np.linspace(start[1], end[1], length + 1)).astype(int), 0, evidence.shape[0] - 1)
    return float(np.mean(evidence[ys, xs]))


def _merged(left: Segment, right: Segment, identifier: str) -> Segment:
    points = (left.start, left.end, right.start, right.end)
    start, end = max(
        ((first, second) for index, first in enumerate(points) for second in points[index + 1:]),
        key=lambda pair: _distance(*pair),
    )
    left_length, right_length = _distance(left.start, left.end), _distance(right.start, right.end)
    total = left_length + right_length or 1
    return Segment(
        identifier,
        start,
        end,
        round((left.thickness_mm * left_length + right.thickness_mm * right_length) / total),
        round((left.confidence * left_length + right.confidence * right_length) / total, 3),
    )


def _is_junction_endpoint(point: tuple[float, float], left: Segment, right: Segment, walls: list[Segment], tolerance: float) -> bool:
    return any(
        _distance(point, endpoint) <= tolerance
        for wall in walls
        if wall.id not in {left.id, right.id}
        for endpoint in (wall.start, wall.end)
    )


def reconcile_walls(
    walls: list[Segment],
    wall_probability: np.ndarray,
    source_edges: np.ndarray | None,
    config: dict,
) -> ReconciliationResult:
    """Merge only evidence-backed gaps between isolated, collinear wall runs."""
    edge_distance = None
    if source_edges is not None and np.any(source_edges):
        edge_distance = cv2.distanceTransform((source_edges == 0).astype(np.uint8), cv2.DIST_L2, 3)
    remaining, diagnostics, merges, skipped = list(walls), [], 0, 0
    while True:
        candidates = []
        for index, left in enumerate(remaining):
            for right in remaining[index + 1:]:
                if not _same_run(left, right, config):
                    continue
                start, end, gap = _nearest_endpoints(left, right)
                if not 0 < gap <= config["maxBridgeGapPx"]:
                    continue
                if _is_junction_endpoint(start, left, right, remaining, config["junctionGuardPx"]) or _is_junction_endpoint(end, left, right, remaining, config["junctionGuardPx"]):
                    skipped += 1
                    continue
                probability_support = _line_support(start, end, wall_probability)
                edge_support = 1.0 if edge_distance is None else _line_support(start, end, (edge_distance <= config["maxSourceEdgeDistancePx"]).astype(np.float32))
                score = (1 - config["sourceEdgeWeight"]) * probability_support + config["sourceEdgeWeight"] * edge_support
                if score >= config["minimumBridgeSupport"]:
                    candidates.append((score, left, right, gap))
                else:
                    skipped += 1
        if not candidates:
            break
        score, left, right, gap = max(candidates, key=lambda candidate: candidate[0])
        replacement = _merged(left, right, f"g2-r{merges}")
        remaining = [wall for wall in remaining if wall.id not in {left.id, right.id}] + [replacement]
        diagnostics.append({"id": f"reconciled-wall-gap-{merges}", "severity": "info", "message": f"Merged {left.id} and {right.id} across a {round(gap, 1)}px evidence-backed gap.", "score": round(score, 3)})
        merges += 1
    return ReconciliationResult(remaining, diagnostics, {"mergedWallPairs": merges, "rejectedBridgeCandidates": skipped})
