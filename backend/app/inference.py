"""GPU inference boundary.

The worker validates immutable artifacts before loading them. The decoding
adapter is intentionally isolated: supplying trained artifacts is a deployment
operation, never a silent fall-back to fabricated geometry.
"""
from pathlib import Path
from time import perf_counter
from functools import lru_cache
import cv2
import numpy as np
from PIL import Image
from skimage.morphology import medial_axis
from .fusion import Segment, fuse, ranked_opening_hosts, reproject_opening_host
from .manifests import manifest_by_id, verify_artifact
from .mask_refinement import refine_wall_mask
from .reconciliation import reconcile_walls
from .quality import score_walls
from .source_normalization import normalize_source
from .topology import assemble_topology
from .tiling import blend_tiled_probability
from .verification import verify_rendered_plan

# Wall vectorizer: threshold -> connected components -> medial_axis skeleton
# (skeleton + per-pixel distance transform in one call) -> skeleton-graph
# polyline tracing -> cv2.approxPolyDP simplification. Direct port of
# ml/vectorize.py's vectorize_walls() (this project's own client-side
# vectorizer, corbel/src/lib/plan-import/vectorize.ts, is an independent
# TS re-implementation of the same algorithm) -- replaces the placeholder
# bounding-box-centerline extractor this file previously used, which
# recovered a small fraction of the wall structure a real skeletonizer
# does on the same mask (2 vs. 53 walls on this project's own test image).
MIN_COMPONENT_AREA = 25  # px^2, drop tiny noise blobs before skeletonizing
APPROX_EPSILON_FRAC = 0.02  # fraction of polyline arc length, for approxPolyDP
APPROX_EPSILON_MIN_PX = 3.0  # floor on approxPolyDP's epsilon: a boundary bump
# that doesn't create a skeleton branch still shifts the medial-axis
# centerline a couple of px off-straight in that stretch (no junction
# involved, so _prune_skeleton_spurs can't touch it) -- the previous 1.0px
# floor was tighter than that typical deviation and left it unsimplified.
MIN_SPUR_LENGTH_PX = 8  # skeleton branches this short or shorter, dead-ending
# at a real junction, are pruned before tracing -- see _prune_skeleton_spurs.
MIN_SEGMENT_LENGTH_PX = 3.0  # approxPolyDP always preserves a polyline's exact
# first/last point, but is free to also keep an intermediate point very close
# to that endpoint if needed to satisfy its epsilon tolerance -- this happens
# more often at junctions with more incoming branches, producing a near-
# coincident point pair that becomes a ~1-2px "stub" wall with an essentially
# random angle. See _drop_near_duplicate_points.


def _sigmoid(data: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-data))


@lru_cache(maxsize=2)
def _onnx_sessions(g0_model_path: str, yolo_model_path: str):
    """Reuse immutable model sessions within one worker process.

    Jobs still verify the pinned artifact before calling this cache. A bounded
    cache keeps the active manifest and one shadow candidate warm without
    letting researcher experiments grow GPU memory without limit.
    """
    import onnxruntime as ort
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return (
        ort.InferenceSession(g0_model_path, providers=providers),
        ort.InferenceSession(yolo_model_path, providers=providers),
    )


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


def _prune_skeleton_spurs(skel: np.ndarray, min_spur_length: int = MIN_SPUR_LENGTH_PX) -> np.ndarray:
    """Remove short dead-end branches ("spurs") from a skeleton before tracing.

    medial_axis routinely grows tiny 1-5px spurious branches off an otherwise
    clean skeleton from ordinary single-pixel irregularities in a predicted
    mask's boundary -- a textbook property of pixel-grid skeletonization, not
    a defect of any one mask. Left in place, each spur creates a false
    junction node in _trace_skeleton_polylines, chopping what should be one
    long straight wall into many short, oddly-angled pieces at every spurious
    branch point (confirmed empirically: 56% of traced segments under 15px,
    median adjacent-segment angle delta 31 degrees on a real test image --
    not consistent with jitter along a straight line).

    A branch is a candidate spur if walking from a free endpoint (degree 1)
    along consecutive degree-2 pixels reaches a non-degree-2 pixel within
    min_spur_length steps. Whether that terminal pixel is itself part of the
    spur (an artifact of the bump, safe to remove) or a real junction shared
    by two legitimate branches (e.g. an L-corner) can't be told from its
    degree alone -- under 8-connectivity, a single spur pixel touching a
    straight run inflates the degree of several nearby "real" pixels too.
    The reliable test is connectivity: remove the candidate branch and check
    whether the rest of the skeleton is still a single connected piece. If
    so, the branch (terminal pixel included) was never load-bearing --
    prune it. If removing it would split the skeleton in two, the terminal
    pixel is a genuine shared junction -- keep it, pruning only up to it.

    A branch whose walk exceeds min_spur_length before terminating is a real
    long arm, not a spur, and is left untouched -- this is also what
    protects a legitimately short/isolated segment (both ends free, no
    junction anywhere) from ever being pruned regardless of length.
    """
    skel = skel.copy()
    for _ in range(10):  # bounded passes; most spurs resolve in one or two
        pixels = set(zip(*np.nonzero(skel)))
        if len(pixels) < 3:
            break
        degree = {p: len(_skeleton_neighbors(skel, *p)) for p in pixels}
        endpoints = [p for p, d in degree.items() if d == 1]

        changed = False
        for start in endpoints:
            if not skel[start]:
                continue  # removed earlier in this pass
            path = [start]
            prev, cur = None, start
            while True:
                nbrs = [n for n in _skeleton_neighbors(skel, *cur) if n != prev]
                if len(nbrs) != 1:
                    break
                prev, cur = cur, nbrs[0]
                path.append(cur)
                if degree.get(cur, 0) != 2:
                    break
            if len(path) - 1 > min_spur_length or degree.get(path[-1], 0) < 3:
                continue  # too long to be a spur, or terminates at a free endpoint

            for candidate in (path, path[:-1]):  # try removing the terminal junction pixel too, then without it
                trial = skel.copy()
                for (y, x) in candidate:
                    trial[y, x] = False
                if trial.sum() == 0:
                    continue
                num_components = cv2.connectedComponents(trial.astype(np.uint8), connectivity=8)[0] - 1
                if num_components <= 1:
                    for (y, x) in candidate:
                        skel[y, x] = False
                    changed = True
                    break
        if not changed:
            break
    return skel


def _drop_near_duplicate_points(
    points: list[tuple[float, float]], min_dist_px: float = MIN_SEGMENT_LENGTH_PX
) -> list[tuple[float, float]]:
    """Collapse near-duplicate points left by approxPolyDP, without ever
    moving the polyline's true first/last point -- other polylines from
    different skeleton branches connect to a shared junction at that exact
    pixel, so shifting an endpoint would break wall connectivity there.
    """
    if len(points) <= 2:
        return points
    result = [points[0]]
    for point in points[1:-1]:
        last = result[-1]
        if np.hypot(point[0] - last[0], point[1] - last[1]) >= min_dist_px:
            result.append(point)
    result.append(points[-1])
    # The specific pattern seen in practice: the kept point right before the
    # true endpoint is itself a near-duplicate of that endpoint (a "stub"
    # right at the junction) -- drop it too, as long as there's still
    # something left to connect the true endpoints.
    if len(result) > 2 and np.hypot(result[-2][0] - result[-1][0], result[-2][1] - result[-1][1]) < min_dist_px:
        del result[-2]
    return result


def _trace_skeleton_polylines(skel: np.ndarray, dist: np.ndarray) -> list[tuple[list[tuple[float, float]], float]]:
    """Walk the skeleton graph, tracing simple chains between endpoints/junctions.
    Returns (points, mean_thickness_px) pairs -- points already simplified."""
    ys, xs = np.nonzero(skel)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    degree = {p: len(_skeleton_neighbors(skel, *p)) for p in pixels}

    nodes = {p for p, d in degree.items() if d != 2}
    if not nodes and pixels:
        nodes = {next(iter(pixels))}

    visited_edges: set[frozenset] = set()
    polylines: list[tuple[list[tuple[float, float]], float]] = []

    for start in nodes:
        for nbr in _skeleton_neighbors(skel, *start):
            edge_key0 = frozenset({start, nbr})
            if edge_key0 in visited_edges:
                continue
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
            pts = np.array([[x, y] for y, x in path], dtype=np.float32)
            arc_len = cv2.arcLength(pts.reshape(-1, 1, 2), closed=False)
            eps = max(APPROX_EPSILON_MIN_PX, APPROX_EPSILON_FRAC * arc_len)
            simplified = cv2.approxPolyDP(pts.reshape(-1, 1, 2), eps, closed=False).reshape(-1, 2)
            if len(simplified) < 2:
                continue
            cleaned_points = _drop_near_duplicate_points([(float(x), float(y)) for x, y in simplified])
            if len(cleaned_points) < 2:
                continue
            thicknesses = [dist[y, x] * 2 for y, x in path]
            polylines.append((
                cleaned_points,
                float(np.mean(thicknesses)) if thicknesses else 0.0,
            ))
    return polylines


def _g0_segments(mask: np.ndarray) -> list[Segment]:
    clean = _clean_binary_mask(mask)
    if clean.sum() == 0:
        return []
    skel, dist = medial_axis(clean.astype(bool), return_distance=True)
    skel = _prune_skeleton_spurs(skel)
    polylines = _trace_skeleton_polylines(skel, dist)
    # A multi-point traced polyline becomes consecutive 2-point Segments --
    # Segment/RawWall are both straight 2-point primitives (same split
    # segmentationVectorToGeometry() does client-side for the same reason).
    segments: list[Segment] = []
    for points, thickness in polylines:
        for i in range(len(points) - 1):
            x0, y0 = points[i]
            x1, y1 = points[i + 1]
            # _drop_near_duplicate_points already cleans up near-duplicate
            # points *within* a polyline, but a whole polyline can itself be
            # just two adjacent, individually-crowded junction pixels (more
            # likely at a busy 3+-way junction) -- too short to be a real
            # wall regardless of source, so filter by length here too.
            if np.hypot(x1 - x0, y1 - y0) < MIN_SEGMENT_LENGTH_PX:
                continue
            segments.append(Segment(f"g0-w{len(segments)}", (x0, y0), (x1, y1), round(thickness), 0.65))
    return segments


def _load_rgb_image(image: Image.Image, size: int, fill: int = 0) -> tuple[np.ndarray, int, int, dict]:
    width, height = image.size
    scale = min(size / width, size / height)
    resized = image.resize((round(width * scale), round(height * scale)))
    pad_x, pad_y = (size - resized.width) // 2, (size - resized.height) // 2
    canvas = Image.new("RGB", (size, size), (fill, fill, fill))
    canvas.paste(resized, (pad_x, pad_y))
    return np.asarray(canvas).astype(np.float32).transpose(2, 0, 1)[None] / 255.0, width, height, {"scale": scale, "padX": pad_x, "padY": pad_y}


def _g0_probability(session, input_data: np.ndarray) -> np.ndarray:
    logits = session.run(None, {session.get_inputs()[0].name: input_data})[0][0]
    return _sigmoid(logits[0])


# Axis-aligned D4 subset: each pairs (a) how to transform the source image
# before letterboxing and (b) how to transform the resulting probability map
# back to the original orientation afterward. All four are involutions
# (self-inverse) and none swap width/height, so every pass shares the exact
# same letterbox scale/padding -- no special-casing needed per transform.
_TTA_TRANSFORMS = {
    "identity": (lambda img: img, lambda arr: arr),
    "hflip": (lambda img: img.transpose(Image.FLIP_LEFT_RIGHT), np.fliplr),
    "vflip": (lambda img: img.transpose(Image.FLIP_TOP_BOTTOM), np.flipud),
    "rot180": (lambda img: img.transpose(Image.ROTATE_180), lambda arr: np.rot90(arr, 2)),
}


def _g0_probability_tta(session, image: Image.Image, input_size: int, config: dict) -> np.ndarray:
    """Average G0's predicted probability map across a set of D4-subset
    (axis-aligned flip/rotate) views of the same image, each restored to the
    original orientation before averaging.

    Matches ml/train_seg_g0.py's own A.D4 training augmentation -- the model
    was explicitly trained to be invariant to these transforms, so averaging
    predictions across them is a principled way to cancel out orientation-
    dependent noise (hatch-pattern texture in particular often has a
    dominant directional bias) while reinforcing signal that stays
    consistent across every view (real wall structure).
    """
    transforms = config.get("transforms", ["identity"])
    accumulated = None
    for name in transforms:
        forward_image, restore_array = _TTA_TRANSFORMS[name]
        transformed_input, _, _, _ = _load_rgb_image(forward_image(image), input_size, fill=0)
        probability = restore_array(_g0_probability(session, transformed_input))
        accumulated = probability if accumulated is None else accumulated + probability
    return accumulated / len(transforms)


def _blend_tiled_g0_probability(
    session,
    source: Image.Image,
    input_size: int,
    config: dict,
    global_probability: np.ndarray,
) -> np.ndarray:
    """Blend overlapping G0 tile predictions in source-pixel space.

    The global pass retains whole-plan context. Tiles recover details that are
    lost when a large plan is reduced to one model input. This remains
    manifest-gated because its operating point must be benchmarked before
    production promotion.
    """
    return blend_tiled_probability(
        source,
        input_size,
        config,
        global_probability,
        lambda tile_input: _g0_probability(session, tile_input),
    )


def _unletterbox(point: tuple[float, float], transform: dict) -> tuple[float, float]:
    return ((point[0] - transform["padX"]) / transform["scale"], (point[1] - transform["padY"]) / transform["scale"])


def _unletterbox_mask(mask: np.ndarray, transform: dict, width: int, height: int) -> np.ndarray:
    resized_width, resized_height = round(width * transform["scale"]), round(height * transform["scale"])
    crop = mask[transform["padY"]:transform["padY"] + resized_height, transform["padX"]:transform["padX"] + resized_width]
    return cv2.resize(crop.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST)


def _unletterbox_probability(probability: np.ndarray, transform: dict, width: int, height: int) -> np.ndarray:
    resized_width, resized_height = round(width * transform["scale"]), round(height * transform["scale"])
    crop = probability[transform["padY"]:transform["padY"] + resized_height, transform["padX"]:transform["padX"] + resized_width]
    return cv2.resize(crop.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)


def _source_wall_edges(image: Image.Image, wall_probability: np.ndarray, threshold: float) -> np.ndarray:
    """Keep source edges only where G0 provides independent wall evidence.

    This prevents dimensions, text, furniture and hatching from becoming an
    unsupported reason to preserve or invent a wall.
    """
    gray = np.asarray(image.convert("L"))
    if gray.shape != wall_probability.shape:
        gray = cv2.resize(gray, (wall_probability.shape[1], wall_probability.shape[0]), interpolation=cv2.INTER_AREA)
    edges = cv2.Canny(gray, 60, 180) > 0
    wall_gate = cv2.dilate((wall_probability >= threshold).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    return np.logical_and(edges, wall_gate).astype(np.uint8)


def _iou(a: dict, b: dict) -> float:
    x0, y0 = max(a["bbox"][0], b["bbox"][0]), max(a["bbox"][1], b["bbox"][1])
    x1, y1 = min(a["bbox"][2], b["bbox"][2]), min(a["bbox"][3], b["bbox"][3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    area_a = (a["bbox"][2] - a["bbox"][0]) * (a["bbox"][3] - a["bbox"][1])
    area_b = (b["bbox"][2] - b["bbox"][0]) * (b["bbox"][3] - b["bbox"][1])
    return inter / (area_a + area_b - inter) if area_a + area_b > inter else 0.0


def _decode_yolo(output: np.ndarray, transform: dict, width: int, height: int, confidence_threshold: float, iou_threshold: float) -> list[dict]:
    if output.ndim != 3 or output.shape[0] != 1 or output.shape[1] != 7:
        raise RuntimeError("YOLO manifest output must be [1, 7, anchors].")
    classes = ("wall", "door", "window")
    candidates: list[dict] = []
    for anchor in range(output.shape[2]):
        scores = output[0, 4:7, anchor]
        cls_index = int(np.argmax(scores))
        confidence = float(scores[cls_index])
        if cls_index == 0 or not np.isfinite(confidence) or confidence < confidence_threshold or confidence > 1:
            continue
        cx, cy, box_w, box_h = (float(output[0, row, anchor]) for row in range(4))
        if not all(np.isfinite(value) and value > 0 for value in (box_w, box_h)):
            continue
        x0, y0 = _unletterbox((cx - box_w / 2, cy - box_h / 2), transform)
        x1, y1 = _unletterbox((cx + box_w / 2, cy + box_h / 2), transform)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(width, x1), min(height, y1)
        if x1 > x0 and y1 > y0:
            candidates.append({"kind": classes[cls_index], "confidence": confidence, "bbox": [x0, y0, x1, y1]})
    kept: list[dict] = []
    for kind in ("door", "window"):
        class_candidates = sorted((item for item in candidates if item["kind"] == kind), key=lambda item: item["confidence"], reverse=True)
        while class_candidates:
            current = class_candidates.pop(0)
            kept.append(current)
            class_candidates = [candidate for candidate in class_candidates if _iou(current, candidate) <= iou_threshold]
    return kept


def run_ensemble(source_path: Path, source: dict, manifest_id: str) -> dict:
    manifest = manifest_by_id(manifest_id)
    g0_path = verify_artifact(manifest["g0"]["path"], manifest["g0"]["sha256"])
    yolo_path = verify_artifact(manifest["yolo"]["path"], manifest["yolo"]["sha256"])
    start = perf_counter()
    g0_session, yolo_session = _onnx_sessions(str(g0_path), str(yolo_path))
    normalized = normalize_source(source_path, source["kind"])
    source_image = normalized.image
    g0_input, width, height, g0_transform = _load_rgb_image(source_image, manifest["g0"]["inputSize"], fill=0)
    if "tta" in manifest:
        wall_probability = _g0_probability_tta(g0_session, source_image, manifest["g0"]["inputSize"], manifest["tta"])
    else:
        wall_probability = _g0_probability(g0_session, g0_input)
    if "tiling" in manifest:
        global_probability = _unletterbox_probability(wall_probability, g0_transform, width, height)
        wall_probability = _blend_tiled_g0_probability(
            g0_session,
            source_image,
            manifest["g0"]["inputSize"],
            manifest["tiling"],
            global_probability,
        )
        g0_transform = {"scale": 1.0, "padX": 0, "padY": 0}
    wall_mask = wall_probability > manifest["g0"]["threshold"]
    if "maskRefinement" in manifest:
        wall_mask = refine_wall_mask(wall_mask, manifest["maskRefinement"])
    padded_walls = _g0_segments(wall_mask)
    raw_walls = [Segment(
        wall.id,
        _unletterbox(wall.start, g0_transform),
        _unletterbox(wall.end, g0_transform),
        max(75, round(wall.thickness_mm / g0_transform["scale"])),
        wall.confidence,
    ) for wall in padded_walls]
    walls = raw_walls
    topology = None
    verification = None
    reconciliation = None
    quality_features = {}
    if "topology" in manifest:
        topology = assemble_topology(raw_walls, manifest["topology"])
        wall_evidence = _unletterbox_probability(wall_probability, g0_transform, width, height)
        source_edges = _source_wall_edges(source_image, wall_evidence, manifest["verification"].get("wallEvidenceThreshold", manifest["g0"]["threshold"]))
        candidate_walls = topology.logical_walls
        if "reconciliation" in manifest:
            reconciliation = reconcile_walls(candidate_walls, wall_evidence, source_edges, manifest["reconciliation"])
            candidate_walls = reconciliation.walls
        verification = verify_rendered_plan(candidate_walls, wall_evidence, manifest["verification"], source_edges)
        walls, quality_features = score_walls(verification.walls, verification.metrics["perWallSupport"])
    # G0 was trained with black centered padding; the historical YOLO detector
    # uses white centered padding. Both transforms are manifest-pinned.
    yolo_input, _, _, yolo_transform = _load_rgb_image(source_image, manifest["yolo"]["inputSize"], fill=255)
    yolo_output = yolo_session.run(None, {yolo_session.get_inputs()[0].name: yolo_input})[0]
    yolo_openings = _decode_yolo(yolo_output, yolo_transform, width, height, manifest["yolo"]["confidenceThreshold"], manifest["yolo"]["iouThreshold"])
    if topology:
        # Host openings against the fine-grained *raw* G0 walls, not the
        # merged logical walls -- a merged wall spans more area, so two of
        # them can end up with similar host scores near a junction and get
        # dropped as ambiguous purely because of the merge, not because the
        # opening's true host is actually unclear. Remap each attached
        # opening's wallId to whichever final wall absorbed its raw host,
        # via topology's own edge->logicalWallId provenance; reconciliation/
        # verification/quality never invent new, unrelated geometry (only
        # extend or drop a wall along its own line), so a nearest-point
        # lookup against the final wall list resolves any further rename.
        walls_out, _, _ = fuse(walls, [])
        _, raw_openings, diagnostics = fuse(raw_walls, yolo_openings)
        edge_to_logical = {edge["id"]: edge["logicalWallId"] for edge in topology.edges}
        logical_by_id = {wall.id: wall for wall in topology.logical_walls}
        final_by_id = {wall.id: wall for wall in walls}
        raw_by_id = {wall.id: wall for wall in raw_walls}
        openings = []
        for opening in raw_openings:
            logical_id = edge_to_logical.get(opening["wallId"])
            logical_wall = logical_by_id.get(logical_id) if logical_id else None
            source_wall = raw_by_id.get(opening["wallId"])
            if logical_wall is None or source_wall is None:
                continue
            if logical_id in final_by_id:
                openings.append(reproject_opening_host(opening, source_wall, final_by_id[logical_id]))
                continue
            centre_x = source_wall.start[0] + (source_wall.end[0] - source_wall.start[0]) * float(opening["offsetRatio"])
            centre_y = source_wall.start[1] + (source_wall.end[1] - source_wall.start[1]) * float(opening["offsetRatio"])
            hosts = ranked_opening_hosts(centre_x, centre_y, walls)
            if hosts:
                openings.append(reproject_opening_host(opening, source_wall, hosts[0][0]))
    else:
        walls_out, openings, diagnostics = fuse(walls, yolo_openings)
    if topology:
        diagnostics.extend(topology.diagnostics)
    if verification:
        diagnostics.extend(verification.diagnostics)
    if reconciliation:
        diagnostics.extend(reconciliation.diagnostics)
    if not walls_out:
        diagnostics.append({"id": "no-walls", "severity": "error", "message": "G0 found no reviewable walls."})
    total_ms = round((perf_counter() - start) * 1000, 2)
    return {
        "schemaVersion": 2,
        "model": {"manifestId": manifest_id, "fusionVersion": manifest["fusionVersion"], "topologyVersion": manifest.get("topology", {}).get("version")},
        "source": {**source, **normalized.metadata, "width": width, "height": height},
        "geometry": {"walls": walls_out, "openings": openings},
        "diagnostics": diagnostics,
        "timings": {"totalMs": total_ms},
        "overallConfidence": round(sum(wall["confidence"] for wall in walls_out) / len(walls_out), 3) if walls_out else 0.0,
        **({"quality": {"version": "evidence-review-score-v1", "walls": quality_features}} if quality_features else {}),
        **({"topology": {"schemaVersion": 1, "nodes": topology.nodes, "edges": topology.edges, "logicalWalls": [{"id": wall.id, "edgeIds": [edge["id"] for edge in topology.edges if edge["logicalWallId"] == wall.id], "confidence": wall.confidence} for wall in topology.logical_walls], "reviewRequired": topology.review_required or verification.review_required}, "verification": verification.metrics, **({"reconciliation": reconciliation.metrics} if reconciliation else {})} if topology and verification else {}),
    }
