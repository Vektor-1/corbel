import numpy as np

from app.fusion import Segment
from app.reconciliation import reconcile_walls


CONFIG = {
    "version": "evidence-gated-wall-reconcile-v1",
    "maxCollinearAngleDeg": 5,
    "maxLineOffsetPx": 3,
    "maxThicknessRatioDelta": 0.35,
    "junctionGuardPx": 3,
    "maxBridgeGapPx": 20,
    "minimumBridgeSupport": 0.7,
    "maxSourceEdgeDistancePx": 2,
    "sourceEdgeWeight": 0.2,
}


def test_reconciliation_merges_a_collinear_gap_with_raster_evidence():
    evidence = np.zeros((40, 120), dtype=np.float32)
    evidence[18:23, 10:100] = 1
    result = reconcile_walls(
        [Segment("left", (10, 20), (50, 20), 10, 0.8), Segment("right", (60, 20), (100, 20), 10, 0.8)],
        evidence,
        None,
        CONFIG,
    )
    assert len(result.walls) == 1
    assert result.metrics["mergedWallPairs"] == 1


def test_reconciliation_does_not_bridge_an_unsupported_gap():
    evidence = np.zeros((40, 120), dtype=np.float32)
    evidence[18:23, 10:50] = 1
    evidence[18:23, 60:100] = 1
    result = reconcile_walls(
        [Segment("left", (10, 20), (50, 20), 10, 0.8), Segment("right", (60, 20), (100, 20), 10, 0.8)],
        evidence,
        None,
        CONFIG,
    )
    assert len(result.walls) == 2
    assert result.metrics["rejectedBridgeCandidates"] == 1


def test_reconciliation_bridges_short_jittery_but_collinear_fragments():
    # Models hatch-texture jitter: short fragments a raw angle-between-
    # direction-vectors test would reject as non-collinear, but that are
    # still evidence-backed and within a few px of one shared chord.
    evidence = np.ones((10, 40), dtype=np.float32)
    result = reconcile_walls(
        [Segment("left", (0, 2), (10, 4), 10, 0.8), Segment("right", (16, 1), (26, 3), 10, 0.8)],
        evidence,
        None,
        CONFIG,
    )
    assert len(result.walls) == 1
    assert result.metrics["mergedWallPairs"] == 1


def test_reconciliation_preserves_non_collinear_walls():
    evidence = np.ones((100, 100), dtype=np.float32)
    result = reconcile_walls(
        [Segment("horizontal", (10, 20), (50, 20), 10, 0.8), Segment("vertical", (55, 25), (55, 70), 10, 0.8)],
        evidence,
        None,
        CONFIG,
    )
    assert len(result.walls) == 2


def test_reconciliation_does_not_merge_at_a_branch_junction():
    result = reconcile_walls(
        [
            Segment("left", (10, 20), (50, 20), 10, 0.8),
            Segment("right", (60, 20), (100, 20), 10, 0.8),
            Segment("branch", (50, 20), (50, 60), 10, 0.8),
        ],
        np.ones((100, 120), dtype=np.float32),
        None,
        CONFIG,
    )
    assert len(result.walls) == 3
