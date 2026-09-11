import numpy as np

from app.fusion import Segment
from app.verification import verify_rendered_plan


CONFIG = {
    "maxCentrelineDistancePx": 3,
    "maxSourceEdgeDistancePx": 2,
    "minimumSupport": 0.7,
    "maxUnsupportedShortWallPx": 12,
    "wallEvidenceThreshold": 0.35,
    "sourceEdgeWeight": 0.2,
}


def test_render_verifier_keeps_wall_supported_by_mask_evidence():
    evidence = np.zeros((50, 100), dtype=np.uint8)
    evidence[23:28, 10:90] = 1
    result = verify_rendered_plan([Segment("wall", (10, 25), (90, 25), 10, 0.8)], evidence, CONFIG)

    assert [wall.id for wall in result.walls] == ["wall"]
    assert not result.review_required
    assert result.metrics["renderedEvidenceOverlap"] >= 0.65
    assert result.metrics["perWallSupport"]["wall"]["combined"] >= 0.65


def test_render_verifier_removes_only_a_short_unsupported_spur():
    evidence = np.zeros((50, 100), dtype=np.uint8)
    evidence[23:28, 10:90] = 1
    walls = [
        Segment("wall", (10, 25), (90, 25), 10, 0.8),
        Segment("spur", (95, 5), (99, 5), 10, 0.3),
    ]
    result = verify_rendered_plan(walls, evidence, CONFIG)

    assert [wall.id for wall in result.walls] == ["wall"]
    assert any(item["id"] == "verification-removed-unsupported-spur" for item in result.diagnostics)


def test_render_verifier_scores_probability_strip_and_source_edge_evidence():
    probability = np.zeros((50, 100), dtype=np.float32)
    probability[22:29, 10:90] = 0.9
    source_edges = np.zeros((50, 100), dtype=np.uint8)
    source_edges[25, 10:90] = 1

    result = verify_rendered_plan(
        [Segment("wall", (10, 25), (90, 25), 10, 0.8)], probability, CONFIG, source_edges
    )

    assert result.metrics["meanSourceEdgeSupport"] >= 0.9
    assert result.metrics["renderedWallIoU"] >= 0.5
