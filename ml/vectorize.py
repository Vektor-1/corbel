"""Day 5 of docs/corbel-custom-geometry-model-plan.md: deterministic
mask-to-vector baseline.

Pipeline: threshold -> connected components -> bounded morphology ->
skimage.morphology.medial_axis (skeleton + per-pixel thickness in one call)
-> skeleton-graph polyline tracing -> cv2.approxPolyDP simplification, for
walls; connected components + cv2.findContours for door/window openings,
plus nearest-wall-polyline host attachment.

Run as a library from evaluate_vectorizer.py; `python3 vectorize.py <mask.png>`
also works standalone for a quick manual check.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field

import cv2
import numpy as np
from skimage.morphology import medial_axis

MIN_COMPONENT_AREA = 25  # px^2, drop tiny noise blobs before skeletonizing
APPROX_EPSILON_FRAC = 0.01  # fraction of polyline arc length, for approxPolyDP


@dataclass
class WallSegment:
    points: list[tuple[float, float]]  # simplified polyline, pixel space
    mean_thickness: float  # px, from medial_axis distance transform


@dataclass
class Opening:
    cls: str  # "door" | "window"
    contour: list[tuple[float, float]]
    centroid: tuple[float, float]
    bbox: tuple[float, float, float, float]  # x0,y0,x1,y1
    host_wall_idx: int | None = None


@dataclass
class VectorizedPlan:
    walls: list[WallSegment] = field(default_factory=list)
    doors: list[Opening] = field(default_factory=list)
    windows: list[Opening] = field(default_factory=list)


def _clean_binary_mask(mask: np.ndarray, min_area: int = MIN_COMPONENT_AREA) -> np.ndarray:
    mask = (mask > 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            out[labels == i] = 1
    return out


def _skeleton_neighbors(skel: np.ndarray, y: int, x: int) -> list[tuple[int, int]]:
    h, w = skel.shape
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and skel[ny, nx]:
                out.append((ny, nx))
    return out


def _trace_skeleton_polylines(skel: np.ndarray, dist: np.ndarray) -> list[WallSegment]:
    """Walk the skeleton graph, tracing simple chains between endpoints/junctions."""
    ys, xs = np.nonzero(skel)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    degree = {p: len(_skeleton_neighbors(skel, *p)) for p in pixels}

    # nodes = endpoints (degree 1) and junctions (degree >= 3)
    nodes = {p for p, d in degree.items() if d != 2}
    if not nodes and pixels:
        # a pure closed loop or single isolated chain with no clear endpoint;
        # seed with an arbitrary pixel so it still gets traced
        nodes = {next(iter(pixels))}

    visited_edges: set[frozenset] = set()
    segments: list[WallSegment] = []

    for start in nodes:
        for nbr in _skeleton_neighbors(skel, *start):
            edge_key0 = frozenset({start, nbr})
            if edge_key0 in visited_edges:
                continue
            # walk from start through nbr until hitting another node
            path = [start, nbr]
            visited_edges.add(edge_key0)
            prev, cur = start, nbr
            while cur not in nodes:
                nbrs = [n for n in _skeleton_neighbors(skel, *cur) if n != prev]
                if not nbrs:
                    break
                nxt = nbrs[0]
                edge_key = frozenset({cur, nxt})
                if edge_key in visited_edges:
                    break
                visited_edges.add(edge_key)
                path.append(nxt)
                prev, cur = cur, nxt
            if len(path) < 2:
                continue
            pts = np.array([[x, y] for y, x in path], dtype=np.float32)  # (x,y) for cv2
            arc_len = cv2.arcLength(pts.reshape(-1, 1, 2), closed=False)
            eps = max(1.0, APPROX_EPSILON_FRAC * arc_len)
            simplified = cv2.approxPolyDP(pts.reshape(-1, 1, 2), eps, closed=False).reshape(-1, 2)
            if len(simplified) < 2:
                continue
            thicknesses = [dist[y, x] * 2 for y, x in path]
            segments.append(WallSegment(
                points=[(float(x), float(y)) for x, y in simplified],
                mean_thickness=float(np.mean(thicknesses)) if thicknesses else 0.0,
            ))
    return segments


def vectorize_walls(wall_mask: np.ndarray) -> list[WallSegment]:
    clean = _clean_binary_mask(wall_mask)
    if clean.sum() == 0:
        return []
    skel, dist = medial_axis(clean.astype(bool), return_distance=True)
    return _trace_skeleton_polylines(skel, dist)


def vectorize_openings(mask: np.ndarray, cls: str) -> list[Opening]:
    clean = _clean_binary_mask(mask, min_area=9)
    if clean.sum() == 0:
        return []
    contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        if cv2.contourArea(c) < 9:
            continue
        x0, y0, w, h = cv2.boundingRect(c)
        m = cv2.moments(c)
        cx = m["m10"] / m["m00"] if m["m00"] else x0 + w / 2
        cy = m["m01"] / m["m00"] if m["m00"] else y0 + h / 2
        out.append(Opening(
            cls=cls,
            contour=[(float(p[0][0]), float(p[0][1])) for p in c],
            centroid=(float(cx), float(cy)),
            bbox=(float(x0), float(y0), float(x0 + w), float(y0 + h)),
        ))
    return out


def _point_to_segment_dist(p, a, b) -> float:
    p, a, b = np.array(p), np.array(a), np.array(b)
    ab = b - a
    if np.allclose(ab, 0):
        return float(np.linalg.norm(p - a))
    t = np.clip(np.dot(p - a, ab) / np.dot(ab, ab), 0, 1)
    proj = a + t * ab
    return float(np.linalg.norm(p - proj))


def attach_openings_to_walls(openings: list[Opening], walls: list[WallSegment], max_dist: float = 40.0) -> None:
    for op in openings:
        best_idx, best_dist = None, float("inf")
        for wi, wall in enumerate(walls):
            for i in range(len(wall.points) - 1):
                d = _point_to_segment_dist(op.centroid, wall.points[i], wall.points[i + 1])
                if d < best_dist:
                    best_dist, best_idx = d, wi
        if best_idx is not None and best_dist <= max_dist:
            op.host_wall_idx = best_idx


def vectorize_mask_rgb(mask_rgb: np.ndarray) -> VectorizedPlan:
    """mask_rgb: HxWx3 uint8, R=wall, G=door, B=window (matches
    ml/convert_cubicasa_seg.py's output and G0's channel order)."""
    walls = vectorize_walls(mask_rgb[:, :, 0])
    doors = vectorize_openings(mask_rgb[:, :, 1], "door")
    windows = vectorize_openings(mask_rgb[:, :, 2], "window")
    attach_openings_to_walls(doors + windows, walls)
    return VectorizedPlan(walls=walls, doors=doors, windows=windows)


if __name__ == "__main__":
    from PIL import Image
    path = sys.argv[1]
    mask = np.array(Image.open(path).convert("RGB"))
    plan = vectorize_mask_rgb(mask)
    print(f"walls={len(plan.walls)} doors={len(plan.doors)} windows={len(plan.windows)}")
    for w in plan.walls[:5]:
        print(f"  wall: {len(w.points)} pts, thickness={w.mean_thickness:.1f}px")
