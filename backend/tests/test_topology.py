from app.fusion import Segment
from app.topology import assemble_topology


CONFIG = {
    "version": "deterministic-topology-v1",
    "junctionSnapPx": 4,
    "maxCollinearAngleDeg": 5,
    "maxLineOffsetPx": 3,
    "maxGapPx": 6,
    "maxThicknessRatioDelta": 0.35,
    "minLogicalWallLengthPx": 3,
}


def test_t_junction_keeps_a_continuous_logical_run_and_graph_branch():
    edges = [
        Segment("left", (0, 0), (50, 0), 10, 0.8),
        Segment("right", (50, 0), (100, 0), 10, 0.8),
        Segment("branch", (50, 0), (50, 60), 10, 0.8),
    ]

    topology = assemble_topology(edges, CONFIG)

    horizontal = [wall for wall in topology.logical_walls if abs(wall.end[0] - wall.start[0]) >= 90]
    assert len(horizontal) == 1
    assert {edge["id"] for edge in topology.edges if edge["logicalWallId"] == horizontal[0].id} == {"left", "right"}
    assert any(node["kind"] == "t" and node["degree"] == 3 for node in topology.nodes)


def test_l_junction_and_parallel_walls_are_not_merged():
    edges = [
        Segment("horizontal", (0, 0), (50, 0), 10, 0.8),
        Segment("vertical", (50, 0), (50, 50), 10, 0.8),
        Segment("parallel", (0, 20), (50, 20), 10, 0.8),
    ]

    topology = assemble_topology(edges, CONFIG)

    assert len(topology.logical_walls) == 3


def test_minimum_length_l_corner_is_not_replaced_by_a_diagonal():
    topology = assemble_topology(
        [Segment("horizontal", (0, 0), (3, 0), 10, 0.8), Segment("vertical", (3, 0), (3, 3), 10, 0.8)],
        CONFIG,
    )

    assert len(topology.logical_walls) == 2
    assert all({wall.start, wall.end} != {(0, 0), (3, 3)} for wall in topology.logical_walls)


def test_hatch_texture_jitter_still_merges_into_one_logical_wall():
    # Models the documented failure mode: a straight ~40px wall vectorized as
    # 4 short (~10px) fragments with alternating ~2-3px lateral jitter from
    # hatch-pattern boundary noise, rather than one clean segment.
    edges = [
        Segment("a", (0, 0), (10, 2), 10, 0.8),
        Segment("b", (10, 2), (20, -1), 10, 0.8),
        Segment("c", (20, -1), (30, 2), 10, 0.8),
        Segment("d", (30, 2), (40, 0), 10, 0.8),
    ]

    topology = assemble_topology(edges, CONFIG)

    assert len(topology.logical_walls) == 1
    assert {edge["id"] for edge in topology.edges} == {"a", "b", "c", "d"}


def test_gap_is_never_invented_and_requires_review():
    edges = [
        Segment("left", (0, 0), (40, 0), 10, 0.8),
        Segment("right", (55, 0), (100, 0), 10, 0.8),
    ]

    topology = assemble_topology(edges, CONFIG)

    assert len(topology.logical_walls) == 2
    assert topology.review_required
    assert any(item["id"] == "topology-gap" for item in topology.diagnostics)
