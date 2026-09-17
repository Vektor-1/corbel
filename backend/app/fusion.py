from dataclasses import dataclass
from math import acos, degrees, hypot


@dataclass
class Segment:
    id: str
    start: tuple[float, float]
    end: tuple[float, float]
    thickness_mm: int
    confidence: float


MAX_CHORD_DIRECTION_DEVIATION_DEG = 35.0


def _direction_deviation_degrees(
    start: tuple[float, float], end: tuple[float, float], chord_start: tuple[float, float], chord_end: tuple[float, float]
) -> float:
    """Return the unsigned deviation between a segment and a shared chord."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    chord_dx, chord_dy = chord_end[0] - chord_start[0], chord_end[1] - chord_start[1]
    length, chord_length = hypot(dx, dy), hypot(chord_dx, chord_dy)
    if not length or not chord_length:
        return 180.0
    # Segment endpoint order is arbitrary, so the opposing direction is equally valid.
    cosine = abs((dx * chord_dx + dy * chord_dy) / (length * chord_length))
    return degrees(acos(max(-1.0, min(1.0, cosine))))


def collinear_within_offset(a: Segment, b: Segment, max_offset_px: float) -> bool:
    """True if a and b's 4 endpoints all lie within max_offset_px of the chord
    through the two most distant of those endpoints.

    Deliberately not a raw angle-between-direction-vectors test: that amplifies
    noise on short segments (2px of lateral jitter over an 8px segment is
    already ~14 degrees of apparent angle), rejecting exactly the short,
    slightly-noisy-but-genuinely-collinear fragments a hatch-textured source
    mask produces. A fixed-pixel chord-offset test instead gives short
    segments proportionally more angular slack while staying just as strict
    (in absolute pixel terms) on long ones, since angular drift over a long
    baseline already produces a large offset on its own.
    """
    points = (a.start, a.end, b.start, b.end)
    chord_start, chord_end = max(
        ((first, second) for index, first in enumerate(points) for second in points[index + 1:]),
        key=lambda pair: hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]),
    )
    dx, dy = chord_end[0] - chord_start[0], chord_end[1] - chord_start[1]
    chord_length = hypot(dx, dy)
    if chord_length == 0:
        return False
    if not all(
        abs((point[0] - chord_start[0]) * dy - (point[1] - chord_start[1]) * dx) / chord_length <= max_offset_px
        for point in points
    ):
        return False
    # Offset alone is intentionally permissive for short segments, but at the
    # configured 3px tolerance it would also accept a 3px-by-3px L corner as
    # its diagonal chord. This generous fixed cap preserves the documented
    # hatch-ripple fragments while refusing a material change in wall direction.
    return all(
        _direction_deviation_degrees(start, end, chord_start, chord_end) <= MAX_CHORD_DIRECTION_DEVIATION_DEG
        for start, end in ((a.start, a.end), (b.start, b.end))
    )


def project_opening_to_walls(cx: float, cy: float, walls: list[Segment], maximum_distance: float = 40.0):
    best = None
    for wall in walls:
        dx, dy = wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]
        length_sq = dx * dx + dy * dy
        if not length_sq:
            continue
        ratio = max(0.0, min(1.0, ((cx - wall.start[0]) * dx + (cy - wall.start[1]) * dy) / length_sq))
        px, py = wall.start[0] + ratio * dx, wall.start[1] + ratio * dy
        distance = hypot(cx - px, cy - py)
        if best is None or distance < best[2]:
            best = (wall.id, ratio, distance)
    return best if best and best[2] <= maximum_distance else None


def opening_width_along_wall(bbox: list[float], wall: Segment) -> int:
    """Measure a detected opening along its host wall, in source pixels."""
    dx, dy = wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]
    length = hypot(dx, dy)
    if not length:
        return 0

    unit_x, unit_y = dx / length, dy / length
    x0, y0, x1, y1 = bbox
    projections = [
        x * unit_x + y * unit_y
        for x, y in ((x0, y0), (x0, y1), (x1, y0), (x1, y1))
    ]
    return round(max(projections) - min(projections))


def reproject_opening_host(opening: dict, source_wall: Segment, target_wall: Segment) -> dict:
    """Express an opening hosted on a source fragment in a target wall's axis.

    A topology pass may replace a short source fragment with a longer logical
    wall. Carrying the old offset ratio forward would relocate the opening, so
    project its source-space centre onto the final wall instead.
    """
    source_dx, source_dy = source_wall.end[0] - source_wall.start[0], source_wall.end[1] - source_wall.start[1]
    centre_x = source_wall.start[0] + source_dx * float(opening["offsetRatio"])
    centre_y = source_wall.start[1] + source_dy * float(opening["offsetRatio"])
    target_dx, target_dy = target_wall.end[0] - target_wall.start[0], target_wall.end[1] - target_wall.start[1]
    length_squared = target_dx * target_dx + target_dy * target_dy
    if not length_squared:
        raise ValueError("Cannot reproject an opening onto a zero-length wall.")
    ratio = max(0.0, min(1.0, ((centre_x - target_wall.start[0]) * target_dx + (centre_y - target_wall.start[1]) * target_dy) / length_squared))
    return {**opening, "wallId": target_wall.id, "offsetRatio": ratio}


def ranked_opening_hosts(cx: float, cy: float, walls: list[Segment], maximum_distance: float = 40.0):
    """Rank hosts using centreline distance, wall confidence, and wall width."""
    candidates = []
    for wall in walls:
        dx, dy = wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]
        length_sq = dx * dx + dy * dy
        if not length_sq:
            continue

        raw_ratio = ((cx - wall.start[0]) * dx + (cy - wall.start[1]) * dy) / length_sq
        # An opening beyond a wall end is not a valid host, even if its endpoint is nearby.
        if raw_ratio < -0.05 or raw_ratio > 1.05:
            continue
        ratio = max(0.0, min(1.0, raw_ratio))
        px, py = wall.start[0] + ratio * dx, wall.start[1] + ratio * dy
        distance = hypot(cx - px, cy - py)
        allowed_distance = max(maximum_distance, wall.thickness_mm / 2 + 5)
        if distance > allowed_distance:
            continue
        score = wall.confidence * (1 - distance / allowed_distance)
        candidates.append((wall, ratio, distance, score))
    return sorted(candidates, key=lambda candidate: candidate[3], reverse=True)


def fuse(g0_walls: list[Segment], yolo_openings: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """G0 owns wall topology; all inferred dimensions remain pixel-native."""
    walls = [{"id": w.id, "kind": "wall", "confidence": w.confidence, "start": {"x": w.start[0], "y": w.start[1]}, "end": {"x": w.end[0], "y": w.end[1]}, "thicknessPx": w.thickness_mm, "role": "partition"} for w in g0_walls]
    openings, diagnostics = [], []
    for index, raw in enumerate(yolo_openings):
        x0, y0, x1, y1 = raw["bbox"]
        candidates = ranked_opening_hosts((x0 + x1) / 2, (y0 + y1) / 2, g0_walls)
        if not candidates:
            diagnostics.append({"id": f"unattached-opening-{index}", "severity": "warning", "message": "Opening candidate was not attached to a G0 wall."})
            continue
        if len(candidates) > 1 and candidates[0][3] - candidates[1][3] < 0.08:
            diagnostics.append({"id": f"ambiguous-opening-{index}", "severity": "warning", "message": "Opening candidate has multiple equally plausible G0 wall hosts."})
            continue
        wall, ratio, _, host_score = candidates[0]
        width_px = opening_width_along_wall(raw["bbox"], wall)
        # A detection box contains no hinge or arc-direction evidence. Leaving
        # swing absent is an explicit abstention; the editor may ask for it.
        openings.append({"id": f"yolo-o{index}", "kind": raw["kind"], "confidence": raw["confidence"], "wallId": wall.id, "offsetRatio": ratio, "widthPx": width_px, "hostScore": round(host_score, 4)})
    return walls, openings, diagnostics
