from app.fusion import Segment, collinear_within_offset, fuse, opening_width_along_wall, project_opening_to_walls, reproject_opening_host


def test_collinear_within_offset_accepts_a_clean_collinear_pair():
    assert collinear_within_offset(Segment("a", (0, 0), (20, 0), 10, 0.8), Segment("b", (20, 0), (40, 0), 10, 0.8), 2)


def test_collinear_within_offset_rejects_a_perpendicular_pair():
    assert not collinear_within_offset(Segment("a", (0, 0), (20, 0), 10, 0.8), Segment("b", (20, 0), (20, 20), 10, 0.8), 2)


def test_collinear_within_offset_rejects_a_short_l_corner_at_the_noise_tolerance():
    # A 3px offset is deliberately generous for hatch ripple, but must never
    # turn two minimal vectorizer segments into a diagonal wall.
    assert not collinear_within_offset(Segment("horizontal", (0, 0), (3, 0), 10, 0.8), Segment("vertical", (3, 0), (3, 3), 10, 0.8), 3)


def test_collinear_within_offset_accepts_short_jittery_but_overall_straight_fragments():
    # Models hatch-texture boundary ripple: short (~10px) segments with ~2-3px
    # lateral jitter around an overall-straight run. A raw angle-between-
    # direction-vectors test amplifies this jitter into a large apparent
    # angle on segments this short; the chord-offset test does not.
    a = Segment("a", (0, 0), (10, 2), 10, 0.8)
    b = Segment("b", (10, 2), (20, -1), 10, 0.8)
    assert collinear_within_offset(a, b, 3)


def test_projects_yolo_opening_to_g0_wall():
    walls = [Segment("wall-1", (0, 0), (100, 0), 225, 0.9)]
    found = project_opening_to_walls(50, 10, walls)
    assert found and found[0] == "wall-1"
    _, openings, diagnostics = fuse(walls, [{"kind": "door", "confidence": 0.8, "bbox": [40, 0, 60, 20]}])
    assert openings[0]["wallId"] == "wall-1"
    assert openings[0]["widthPx"] == 20
    assert "swing" not in openings[0]
    assert not diagnostics


def test_rejects_unattached_opening():
    walls = [Segment("wall-1", (0, 0), (100, 0), 225, 0.9)]
    _, openings, diagnostics = fuse(walls, [{"kind": "window", "confidence": 0.8, "bbox": [40, 300, 60, 320]}])
    assert openings == []
    assert diagnostics[0]["id"].startswith("unattached-opening")


def test_opening_width_is_projected_along_its_host_wall_axis():
    wall = Segment("vertical", (50, 0), (50, 100), 10, 0.9)
    assert opening_width_along_wall([40, 20, 60, 80], wall) == 60


def test_reprojected_opening_keeps_its_source_position_on_a_logical_wall():
    opening = {"id": "door", "wallId": "fragment", "offsetRatio": 0.5, "widthPx": 10}
    result = reproject_opening_host(
        opening,
        Segment("fragment", (50, 0), (100, 0), 10, 0.8),
        Segment("logical", (0, 0), (100, 0), 10, 0.8),
    )
    assert result["wallId"] == "logical"
    assert result["offsetRatio"] == 0.75


def test_fusion_abstains_when_an_opening_has_equally_plausible_hosts():
    walls = [
        Segment("top", (0, 0), (100, 0), 10, 0.9),
        Segment("bottom", (0, 10), (100, 10), 10, 0.9),
    ]
    _, openings, diagnostics = fuse(walls, [{"kind": "door", "confidence": 0.9, "bbox": [40, 0, 60, 10]}])
    assert openings == []
    assert diagnostics[0]["id"].startswith("ambiguous-opening")
