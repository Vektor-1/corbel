"""Deterministic, manifest-neutral reconstruction benchmark metrics.

The benchmark intentionally scores the editor-ready geometry rather than model
logits.  That keeps a comparison meaningful when a manifest changes tiling,
topology, or fusion in addition to a neural-network weight.
"""
from __future__ import annotations

from math import hypot
from typing import Any


def _point(value: dict[str, Any]) -> tuple[float, float]:
    return float(value["x"]), float(value["y"])


def _distance_to_segment(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length_squared = dx * dx + dy * dy
    if length_squared == 0:
        return hypot(point[0] - start[0], point[1] - start[1])
    ratio = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length_squared))
    return hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy))


def _samples(wall: dict[str, Any], spacing_px: float) -> list[tuple[float, float]]:
    start, end = _point(wall["start"]), _point(wall["end"])
    length = hypot(end[0] - start[0], end[1] - start[1])
    count = max(2, round(length / max(spacing_px, 1.0)) + 1)
    return [
        (start[0] + (end[0] - start[0]) * index / (count - 1), start[1] + (end[1] - start[1]) * index / (count - 1))
        for index in range(count)
    ]


def _coverage(source: list[dict[str, Any]], target: list[dict[str, Any]], tolerance_px: float, spacing_px: float) -> float:
    samples = [point for wall in source for point in _samples(wall, spacing_px)]
    if not samples:
        return 1.0 if not target else 0.0
    if not target:
        return 0.0
    target_segments = [(_point(wall["start"]), _point(wall["end"])) for wall in target]
    covered = sum(
        min(_distance_to_segment(point, start, end) for start, end in target_segments) <= tolerance_px
        for point in samples
    )
    return covered / len(samples)


def _wall_by_id(walls: list[dict[str, Any]], identifier: object) -> dict[str, Any] | None:
    return next((wall for wall in walls if str(wall.get("id")) == str(identifier)), None)


def _opening_position(opening: dict[str, Any], walls: list[dict[str, Any]]) -> tuple[tuple[float, float], dict[str, Any]] | None:
    wall = _wall_by_id(walls, opening.get("wallId"))
    if wall is None:
        return None
    start, end = _point(wall["start"]), _point(wall["end"])
    ratio = max(0.0, min(1.0, float(opening.get("offsetRatio", 0.0))))
    return (start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio), wall


def _same_wall_axis(first: dict[str, Any], second: dict[str, Any], min_alignment: float = 0.94) -> bool:
    """Treat opposite endpoint directions as the same axis."""
    a_start, a_end = _point(first["start"]), _point(first["end"])
    b_start, b_end = _point(second["start"]), _point(second["end"])
    ax, ay, bx, by = a_end[0] - a_start[0], a_end[1] - a_start[1], b_end[0] - b_start[0], b_end[1] - b_start[1]
    lengths = hypot(ax, ay) * hypot(bx, by)
    return lengths > 0 and abs((ax * bx + ay * by) / lengths) >= min_alignment


def _f1(true_positive: int, predicted_count: int, reference_count: int) -> dict[str, float]:
    precision = true_positive / predicted_count if predicted_count else (1.0 if not reference_count else 0.0)
    recall = true_positive / reference_count if reference_count else (1.0 if not predicted_count else 0.0)
    return {"precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0}


def score_reconstruction(result: dict[str, Any], reference: dict[str, Any], *, tolerance_px: float = 8.0) -> dict[str, Any]:
    """Score a single rich backend response against a frozen annotation."""
    geometry = result.get("geometry", result)
    predicted_walls, reference_walls = geometry.get("walls", []), reference.get("walls", [])
    precision = _coverage(predicted_walls, reference_walls, tolerance_px, tolerance_px / 2)
    recall = _coverage(reference_walls, predicted_walls, tolerance_px, tolerance_px / 2)
    wall = {"centrelinePrecision": precision, "centrelineRecall": recall, "centrelineF1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0}

    available_reference = {str(opening["id"]): opening for opening in reference.get("openings", [])}
    matched_reference: set[str] = set()
    true_positive = 0
    for opening in geometry.get("openings", []):
        predicted_position = _opening_position(opening, predicted_walls)
        if predicted_position is None:
            continue
        point, predicted_host = predicted_position
        candidates = [
            (item, reference_position)
            for item in available_reference.values()
            if str(item["id"]) not in matched_reference and item.get("kind") == opening.get("kind")
            for reference_position in [_opening_position(item, reference_walls)]
            if reference_position is not None
            and _same_wall_axis(predicted_host, reference_position[1])
            and hypot(point[0] - reference_position[0][0], point[1] - reference_position[0][1]) <= tolerance_px
        ]
        if candidates:
            candidate, _ = min(candidates, key=lambda item: hypot(point[0] - item[1][0][0], point[1] - item[1][0][1]))
            matched_reference.add(str(candidate["id"]))
            true_positive += 1
    opening = _f1(true_positive, len(geometry.get("openings", [])), len(available_reference))
    diagnostics = result.get("diagnostics", [])
    abstained = any(str(item.get("id", "")).startswith(("unattached-opening", "ambiguous-opening")) for item in diagnostics)
    return {"wall": wall, "opening": opening, "abstained": abstained, "render": result.get("verification", {})}


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ranked = sorted(values)
    return ranked[round((len(ranked) - 1) * fraction)]


def aggregate_scores(scored: list[dict[str, Any]], correction_burdens: list[float] | None = None) -> dict[str, Any]:
    """Aggregate a manifest's plan scores into a promotion-report row."""
    if not scored:
        raise ValueError("A manifest needs at least one scored plan.")
    correction_burdens = correction_burdens or []
    def average(path: tuple[str, ...]) -> float:
        values = []
        for item in scored:
            value: Any = item
            for key in path:
                value = value[key]
            values.append(float(value))
        return sum(values) / len(values)
    latencies = [float(item["latencyMs"]) for item in scored if item.get("latencyMs") is not None]
    return {
        "plans": len(scored),
        "wall": {key: average(("wall", key)) for key in ("centrelinePrecision", "centrelineRecall", "centrelineF1")},
        "opening": {key: average(("opening", key)) for key in ("precision", "recall", "f1")},
        "abstentionRate": sum(bool(item["abstained"]) for item in scored) / len(scored),
        "latencyMs": {"p50": _percentile(latencies, 0.50), "p95": _percentile(latencies, 0.95)},
        "correctionBurden": sum(correction_burdens) / len(correction_burdens) if correction_burdens else None,
    }
