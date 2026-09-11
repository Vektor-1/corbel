"""Evidence-based review scores, designed to be replaced by a learned calibrator."""
from .fusion import Segment


def score_walls(walls: list[Segment], per_wall_support: dict[str, dict]) -> tuple[list[Segment], dict[str, dict]]:
    """Convert independent evidence into auditable, per-wall review scores.

    These are deliberately not described as learned probabilities. Approved
    correction records provide the labels for fitting a calibrated replacement.
    """
    scored, features = [], {}
    for wall in walls:
        evidence = per_wall_support.get(wall.id, {})
        centreline = float(evidence.get("centreline", 0.0))
        source_edge = float(evidence.get("sourceEdge", centreline))
        combined = float(evidence.get("combined", centreline))
        confidence = round(max(0.0, min(1.0, 0.25 * wall.confidence + 0.75 * combined)), 3)
        scored.append(Segment(wall.id, wall.start, wall.end, wall.thickness_mm, confidence))
        features[wall.id] = {
            "baseModel": wall.confidence,
            "centrelineSupport": round(centreline, 3),
            "sourceEdgeSupport": round(source_edge, 3),
            "combinedSupport": round(combined, 3),
            "reviewScore": confidence,
        }
    return scored, features
