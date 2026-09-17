"""Deterministic topology assembly for G0 wall edges.

This layer makes graph structure explicit before the editor sees geometry. It
can merge evidence-backed collinear edge chains into a logical wall run, but
never closes a room or creates a wall across an unsupported large gap.
"""
from dataclasses import dataclass
from math import hypot

from .fusion import Segment, collinear_within_offset


@dataclass
class TopologyAssembly:
    logical_walls: list[Segment]
    nodes: list[dict]
    edges: list[dict]
    diagnostics: list[dict]
    review_required: bool


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return hypot(a[0] - b[0], a[1] - b[1])


def _same_run(a: Segment, b: Segment, config: dict) -> bool:
    if not collinear_within_offset(a, b, config["maxLineOffsetPx"]):
        return False
    thickness_delta = abs(a.thickness_mm - b.thickness_mm) / max(a.thickness_mm, b.thickness_mm, 1)
    if thickness_delta > config["maxThicknessRatioDelta"]:
        return False
    return min(_distance(a.start, b.start), _distance(a.start, b.end), _distance(a.end, b.start), _distance(a.end, b.end)) <= config["maxGapPx"]


def _merged_segment(segments: list[Segment], identifier: str) -> Segment:
    endpoints = [point for segment in segments for point in (segment.start, segment.end)]
    start, end = max(
        ((first, second) for index, first in enumerate(endpoints) for second in endpoints[index + 1:]),
        key=lambda pair: _distance(*pair),
    )
    lengths = [hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]) for segment in segments]
    total = sum(lengths) or 1
    return Segment(
        identifier,
        start,
        end,
        round(sum(segment.thickness_mm * length for segment, length in zip(segments, lengths)) / total),
        round(sum(segment.confidence * length for segment, length in zip(segments, lengths)) / total, 3),
    )


def _nodes(edges: list[Segment], snap: float) -> list[dict]:
    clusters: list[list[tuple[float, float]]] = []
    for point in (point for edge in edges for point in (edge.start, edge.end)):
        cluster = next((candidate for candidate in clusters if any(_distance(point, member) <= snap for member in candidate)), None)
        if cluster is None:
            cluster = []
            clusters.append(cluster)
        cluster.append(point)
    nodes = []
    for index, cluster in enumerate(clusters):
        x, y = sum(point[0] for point in cluster) / len(cluster), sum(point[1] for point in cluster) / len(cluster)
        degree = len(cluster)
        nodes.append({"id": f"g1-n{index}", "x": round(x, 3), "y": round(y, 3), "degree": degree, "kind": "x" if degree >= 4 else "t" if degree == 3 else "l" if degree == 2 else "end"})
    return nodes


def _near_collinear_gap(a: Segment, b: Segment, config: dict) -> bool:
    relaxed = {**config, "maxGapPx": config["maxGapPx"] * 3}
    return _same_run(a, b, relaxed) and not _same_run(a, b, config)


def assemble_topology(raw_edges: list[Segment], config: dict) -> TopologyAssembly:
    """Group only safe collinear chains; retain graph provenance for review.

    Grouping is exactly connected-components under "some pair of members is
    _same_run-compatible": two groups merge iff any raw pair across them
    matches, and merging is transitive. A union-find over every raw pair,
    checked once, reaches the identical final partition as repeatedly
    rescanning groups to a fixed point (the previous implementation) --
    same result, without redoing O(n^2) work after every single merge.
    """
    sorted_edges = sorted(raw_edges, key=lambda edge: edge.id)
    parent = list(range(len(sorted_edges)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for i in range(len(sorted_edges)):
        for j in range(i + 1, len(sorted_edges)):
            root_i, root_j = find(i), find(j)
            if root_i == root_j:
                continue
            if _same_run(sorted_edges[i], sorted_edges[j], config):
                # Lower original index stays root, matching the old
                # algorithm's "earlier group absorbs later group" order, so
                # the g1-lwN ids assigned below stay stable/deterministic.
                if root_i < root_j:
                    parent[root_j] = root_i
                else:
                    parent[root_i] = root_j

    grouped: dict[int, list[Segment]] = {}
    for index, edge in enumerate(sorted_edges):
        grouped.setdefault(find(index), []).append(edge)
    groups = [grouped[root] for root in sorted(grouped)]

    logical_walls, edge_rows = [], []
    for index, group in enumerate(groups):
        identifier = f"g1-lw{index}"
        logical = _merged_segment(group, identifier)
        if hypot(logical.end[0] - logical.start[0], logical.end[1] - logical.start[1]) < config["minLogicalWallLengthPx"]:
            continue
        logical_walls.append(logical)
        for edge in group:
            edge_rows.append({"id": edge.id, "start": {"x": edge.start[0], "y": edge.start[1]}, "end": {"x": edge.end[0], "y": edge.end[1]}, "logicalWallId": identifier, "confidence": edge.confidence})

    diagnostics = []
    if any(_near_collinear_gap(a, b, config) for index, a in enumerate(raw_edges) for b in raw_edges[index + 1:]):
        diagnostics.append({"id": "topology-gap", "severity": "warning", "message": "A near-collinear wall gap was left for review rather than inferred."})
    nodes = _nodes(raw_edges, config["junctionSnapPx"])
    return TopologyAssembly(logical_walls, nodes, edge_rows, diagnostics, bool(diagnostics))
