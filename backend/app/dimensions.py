"""Conservative dimension-constraint estimation for geometry grounding."""
from dataclasses import dataclass
from math import hypot
from statistics import median


@dataclass(frozen=True)
class DimensionConstraint:
    id: str
    start: tuple[float, float]
    end: tuple[float, float]
    value_mm: float
    confidence: float


def estimate_pixels_per_meter(constraints: list[DimensionConstraint], maximum_relative_residual: float = 0.08) -> dict:
    """Estimate scale from dimension-line geometry, rejecting OCR outliers.

    This intentionally produces diagnostics only. A later constrained solver
    may consume the inliers, but no wall coordinates are moved in this phase.
    """
    candidates = []
    for constraint in constraints:
        length_px = hypot(constraint.end[0] - constraint.start[0], constraint.end[1] - constraint.start[1])
        if constraint.value_mm <= 0 or length_px <= 0 or not 0 <= constraint.confidence <= 1:
            continue
        candidates.append((constraint, length_px * 1000 / constraint.value_mm))
    if not candidates:
        return {"pixelsPerMeter": None, "confidence": 0.0, "inliers": [], "outliers": []}

    initial = median(scale for _, scale in candidates)
    inliers = [(constraint, scale) for constraint, scale in candidates if abs(scale - initial) / initial <= maximum_relative_residual]
    if not inliers:
        return {"pixelsPerMeter": None, "confidence": 0.0, "inliers": [], "outliers": [constraint.id for constraint, _ in candidates]}
    estimate = median(scale for _, scale in inliers)
    outliers = [constraint.id for constraint, scale in candidates if abs(scale - estimate) / estimate > maximum_relative_residual]
    weighted_confidence = sum(constraint.confidence for constraint, _ in inliers) / len(inliers)
    coverage = len(inliers) / len(candidates)
    return {
        "pixelsPerMeter": round(estimate, 3),
        "confidence": round(weighted_confidence * coverage, 3),
        "inliers": [constraint.id for constraint, _ in inliers],
        "outliers": outliers,
    }
