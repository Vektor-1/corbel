from app.fusion import Segment
from app.quality import score_walls


def test_quality_scores_distinguish_evidence_backed_walls_from_weak_walls():
    walls, features = score_walls(
        [Segment("strong", (0, 0), (10, 0), 10, 0.65), Segment("weak", (0, 10), (10, 10), 10, 0.65)],
        {
            "strong": {"centreline": 1.0, "sourceEdge": 1.0, "combined": 1.0},
            "weak": {"centreline": 0.2, "sourceEdge": 0.1, "combined": 0.18},
        },
    )
    assert walls[0].confidence > walls[1].confidence
    assert features["strong"]["reviewScore"] == walls[0].confidence
