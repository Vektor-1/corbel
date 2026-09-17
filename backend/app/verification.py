"""Conservative render-and-compare verification for assembled wall geometry."""
from dataclasses import dataclass

import cv2
import numpy as np

from .fusion import Segment


@dataclass
class VerificationResult:
    walls: list[Segment]
    diagnostics: list[dict]
    review_required: bool
    metrics: dict


def _support_ratio(wall: Segment, evidence_distance: np.ndarray, max_distance: float) -> float:
    length = max(1, int(round(np.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]))))
    xs = np.clip(np.rint(np.linspace(wall.start[0], wall.end[0], length + 1)).astype(int), 0, evidence_distance.shape[1] - 1)
    ys = np.clip(np.rint(np.linspace(wall.start[1], wall.end[1], length + 1)).astype(int), 0, evidence_distance.shape[0] - 1)
    return float(np.mean(evidence_distance[ys, xs] <= max_distance))


def verify_rendered_plan(
    walls: list[Segment],
    wall_evidence: np.ndarray,
    config: dict,
    source_edges: np.ndarray | None = None,
) -> VerificationResult:
    """Compare rerendered wall strips with G0 probability and source-edge evidence."""
    evidence = (wall_evidence >= config.get("wallEvidenceThreshold", 0.5)).astype(np.uint8)
    distance = cv2.distanceTransform((1 - evidence).astype(np.uint8), cv2.DIST_L2, 3)
    inside_distance = cv2.distanceTransform(evidence, cv2.DIST_L2, 3)
    edge_distance = None
    if source_edges is not None and np.any(source_edges):
        edge_distance = cv2.distanceTransform((source_edges == 0).astype(np.uint8), cv2.DIST_L2, 3)
    supported, diagnostics, support_values, edge_support_values, per_wall_support = [], [], [], [], {}
    rendered = np.zeros_like(evidence)
    for wall in walls:
        support = _support_ratio(wall, distance, config["maxCentrelineDistancePx"])
        support_values.append(support)
        edge_support = _support_ratio(wall, edge_distance, config.get("maxSourceEdgeDistancePx", 2)) if edge_distance is not None else None
        if edge_support is not None:
            edge_support_values.append(edge_support)
        combined_support = support if edge_support is None else (1 - config.get("sourceEdgeWeight", 0.2)) * support + config.get("sourceEdgeWeight", 0.2) * edge_support
        per_wall_support[wall.id] = {
            "centreline": round(support, 3),
            "sourceEdge": round(edge_support, 3) if edge_support is not None else round(support, 3),
            "combined": round(combined_support, 3),
        }
        length = float(np.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]))
        if combined_support < config["minimumSupport"] and length <= config["maxUnsupportedShortWallPx"]:
            diagnostics.append({"id": "verification-removed-unsupported-spur", "severity": "warning", "message": f"Removed unsupported short wall candidate {wall.id}."})
            continue
        if combined_support < config["minimumSupport"]:
            diagnostics.append({"id": f"verification-low-support-{wall.id}", "severity": "warning", "message": f"Wall {wall.id} has weak raster support and needs review."})
        supported.append(wall)
    for wall in supported:
        sample_length = max(1, int(round(np.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]))))
        xs = np.clip(np.rint(np.linspace(wall.start[0], wall.end[0], sample_length + 1)).astype(int), 0, distance.shape[1] - 1)
        ys = np.clip(np.rint(np.linspace(wall.start[1], wall.end[1], sample_length + 1)).astype(int), 0, distance.shape[0] - 1)
        thickness = max(1, round(float(np.median(inside_distance[ys, xs])) * 2))
        cv2.line(
            rendered,
            (round(wall.start[0]), round(wall.start[1])),
            (round(wall.end[0]), round(wall.end[1])),
            1,
            thickness,
            lineType=cv2.LINE_AA,
        )
    review_required = any(item["id"].startswith("verification-low-support") for item in diagnostics)
    rendered_pixels = rendered > 0
    rendered_overlap = float(np.mean(evidence[rendered_pixels] > 0)) if np.any(rendered_pixels) else 0.0
    intersection = int(np.logical_and(rendered_pixels, evidence > 0).sum())
    union = int(np.logical_or(rendered_pixels, evidence > 0).sum())
    return VerificationResult(supported, diagnostics, review_required, {
        "meanCentrelineSupport": round(float(np.mean(support_values)) if support_values else 0.0, 3),
        "renderedEvidenceOverlap": round(rendered_overlap, 3),
        "renderedWallIoU": round(intersection / union if union else 0.0, 3),
        "meanSourceEdgeSupport": round(float(np.mean(edge_support_values)) if edge_support_values else 0.0, 3),
        "perWallSupport": per_wall_support,
    })
