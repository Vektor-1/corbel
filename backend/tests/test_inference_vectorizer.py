import numpy as np
from app.inference import (
    _clean_binary_mask,
    _drop_near_duplicate_points,
    _g0_segments,
    _prune_skeleton_spurs,
    _trace_skeleton_polylines,
)
from skimage.morphology import medial_axis

# Real skeletonization vectorizer (docs/... "ship G0" plan, ported from
# ml/vectorize.py -- the same algorithm this project's own client-side
# corbel/src/lib/plan-import/vectorize.ts independently re-implements).
# Covers exactly the cases that session's own test suites settled on:
# horizontal/vertical/thin wall, one L-junction, plus the area-filter step.


def _rect_mask(h: int, w: int, y0: int, x0: int, rh: int, rw: int) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y0:y0 + rh, x0:x0 + rw] = 1
    return mask


def test_clean_binary_mask_drops_small_components_keeps_large():
    mask = np.zeros((20, 20), dtype=np.uint8)
    mask[2:8, 2:8] = 1  # 6x6 = 36px^2, above the 25px^2 threshold
    mask[15, 15] = 1  # lone 1px speck, below threshold
    cleaned = _clean_binary_mask(mask)
    assert cleaned.sum() == 36
    assert cleaned[15, 15] == 0


def test_g0_segments_horizontal_wall_produces_mostly_horizontal_segments():
    mask = _rect_mask(40, 100, 15, 10, 10, 80)  # 10px thick, 80px long
    segments = _g0_segments(mask)
    assert len(segments) >= 1
    dx = sum(abs(s.end[0] - s.start[0]) for s in segments)
    dy = sum(abs(s.end[1] - s.start[1]) for s in segments)
    assert dx > dy, f"expected horizontal extent to dominate (dx={dx}, dy={dy})"
    for s in segments:
        assert 2 < s.thickness_mm < 20, f"thickness {s.thickness_mm} out of range for a 10px-thick wall"
        assert s.confidence == 0.65


def test_g0_segments_vertical_wall_produces_mostly_vertical_segments():
    mask = _rect_mask(100, 40, 10, 15, 80, 10)
    segments = _g0_segments(mask)
    assert len(segments) >= 1
    dx = sum(abs(s.end[0] - s.start[0]) for s in segments)
    dy = sum(abs(s.end[1] - s.start[1]) for s in segments)
    assert dy > dx, f"expected vertical extent to dominate (dx={dx}, dy={dy})"


def test_g0_segments_thin_wall_does_not_crash_and_stays_finite():
    mask = _rect_mask(20, 100, 9, 10, 2, 80)  # 2px thick
    segments = _g0_segments(mask)
    for s in segments:
        assert all(np.isfinite(v) for v in (*s.start, *s.end))
        assert np.isfinite(s.thickness_mm) and s.thickness_mm >= 0


def test_g0_segments_l_junction_traces_both_arms():
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[10:20, 10:80] = 1  # horizontal arm
    mask[10:80, 10:20] = 1  # vertical arm
    segments = _g0_segments(mask)
    assert len(segments) >= 1
    total_arc = sum(np.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]) for s in segments)
    # Each arm is ~70px along its long axis; a degenerate trace (e.g. only
    # the corner) would be far shorter than this.
    assert total_arc > 60, f"expected combined arc length to cover most of the L shape, got {total_arc}"


def test_g0_segments_empty_mask_returns_no_segments():
    mask = np.zeros((50, 50), dtype=np.uint8)
    assert _g0_segments(mask) == []


def test_trace_skeleton_polylines_matches_medial_axis_output_shape():
    mask = _clean_binary_mask(_rect_mask(40, 100, 15, 10, 10, 80))
    skel, dist = medial_axis(mask.astype(bool), return_distance=True)
    polylines = _trace_skeleton_polylines(skel, dist)
    assert len(polylines) >= 1
    points, thickness = polylines[0]
    assert len(points) >= 2
    assert thickness > 0


def _skeleton_from_pixels(shape, pixels):
    skel = np.zeros(shape, dtype=bool)
    for y, x in pixels:
        skel[y, x] = True
    return skel


def test_prune_skeleton_spurs_removes_short_branch_off_a_real_junction():
    # A straight horizontal run y=5, x=0..20, with a 2px spur sticking up
    # from x=10 (a false branch, the pattern medial_axis produces from a
    # single-pixel mask-boundary bump under 8-connectivity: the spur pixel
    # touching x=10 inflates degree at that attachment point). Both spur
    # pixels are artifacts of the bump, not part of the true straight line,
    # and should be removed -- the main run must survive untouched.
    main_run = [(5, x) for x in range(21)]
    spur = [(4, 10), (3, 10)]
    skel = _skeleton_from_pixels((10, 21), main_run + spur)

    pruned = _prune_skeleton_spurs(skel, min_spur_length=8)

    assert not pruned[3, 10] and not pruned[4, 10], "spur pixels should be removed"
    for y, x in main_run:
        assert pruned[y, x], "the main straight run must be untouched"
    assert pruned.sum() == len(main_run)


def test_prune_skeleton_spurs_preserves_real_junction_beyond_the_threshold():
    # A spur longer than min_spur_length is a real branch (e.g. a short
    # connecting wall), not skeletonization noise -- must not be pruned.
    main_run = [(5, x) for x in range(21)]
    long_branch = [(4 - i, 10) for i in range(6)]  # 6px, longer than min_spur_length=3
    skel = _skeleton_from_pixels((10, 21), main_run + long_branch)

    pruned = _prune_skeleton_spurs(skel, min_spur_length=3)

    for y, x in long_branch:
        assert pruned[y, x], "a branch longer than the threshold must be preserved"


def test_prune_skeleton_spurs_preserves_isolated_short_segments():
    # A short skeleton run with two free endpoints (no junction at either
    # end) is a legitimately short/isolated wall, not a spur -- must survive
    # regardless of length.
    isolated = [(2, x) for x in range(5)]
    skel = _skeleton_from_pixels((10, 10), isolated)

    pruned = _prune_skeleton_spurs(skel, min_spur_length=8)

    assert pruned.sum() == len(isolated)


def test_g0_segments_straight_wall_with_boundary_bump_does_not_fragment():
    # A clean 80px horizontal wall plus a small bump on one edge -- the
    # concrete failure mode reported against a real reconstructed plan
    # (median 31deg angle delta between adjacent fragments; not consistent
    # with jitter, consistent with spurious skeleton branching). Without
    # spur pruning this fragments into 3+ oddly-angled pieces; with it, the
    # wall should stay as very few (ideally one) mostly-straight segments.
    mask = _rect_mask(40, 100, 15, 10, 10, 80)
    mask[11:15, 48:52] = 1  # small bump on the top edge, mid-wall

    segments = _g0_segments(mask)

    assert len(segments) <= 3, f"expected the bump not to fragment the wall into many pieces, got {len(segments)}"
    dx = sum(abs(s.end[0] - s.start[0]) for s in segments)
    dy = sum(abs(s.end[1] - s.start[1]) for s in segments)
    assert dx > dy, f"expected horizontal extent to still dominate (dx={dx}, dy={dy})"


def test_g0_segments_l_junction_still_has_two_arms_after_spur_pruning():
    # Regression guard: a REAL junction (not a spur) must still produce both
    # arms after spur pruning was added -- this is the same assertion as
    # test_g0_segments_l_junction_traces_both_arms, kept independent so a
    # future change to spur pruning specifically trips this one first.
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[10:20, 10:80] = 1
    mask[10:80, 10:20] = 1
    segments = _g0_segments(mask)
    total_arc = sum(np.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]) for s in segments)
    assert total_arc > 60, f"expected both arms to survive spur pruning, got total_arc={total_arc}"


# ── Junction-stub cleanup (complex/dense-junction plans) ──────────────────
# Diagnosed against real floor plans (2026-09-10): approxPolyDP always
# preserves a polyline's exact first/last point but can also keep an
# intermediate point very close to that endpoint to satisfy its epsilon
# tolerance -- more likely at junctions with more incoming branches. On a
# real complex plan (high_quality_architectural_8029.png) this produced 49
# of 132 walls under 3px, clustered at ~1.3px, with effectively random
# angle -- not real diagonal geometry, just noise at real junctions.


def test_drop_near_duplicate_points_collapses_interior_near_duplicate():
    points = [(0.0, 0.0), (10.0, 0.0), (10.6, 0.4), (40.0, 0.0)]
    cleaned = _drop_near_duplicate_points(points, min_dist_px=3.0)
    assert cleaned[0] == (0.0, 0.0), "the true first point must never move"
    assert cleaned[-1] == (40.0, 0.0), "the true last point must never move"
    assert (10.6, 0.4) not in cleaned, "the near-duplicate interior point should be dropped"


def test_drop_near_duplicate_points_drops_stub_right_before_the_true_endpoint():
    # The exact pattern seen in the diagnostic: the point right before the
    # polyline's true end is itself within min_dist_px of that end.
    points = [(0.0, 0.0), (20.0, 0.0), (39.0, 0.3), (40.0, 0.0)]
    cleaned = _drop_near_duplicate_points(points, min_dist_px=3.0)
    assert cleaned[0] == (0.0, 0.0)
    assert cleaned[-1] == (40.0, 0.0), "the true last point must never move"
    assert (39.0, 0.3) not in cleaned, "the stub adjacent to the true endpoint should be dropped"


def test_drop_near_duplicate_points_preserves_true_endpoints_even_when_short():
    # A genuinely short polyline (2 points) is returned unchanged -- nothing
    # to collapse, and the function must not touch endpoints regardless.
    points = [(0.0, 0.0), (2.0, 0.0)]
    assert _drop_near_duplicate_points(points, min_dist_px=3.0) == points


def test_g0_segments_t_junction_produces_no_stub_segments():
    # A 3-way junction (more branches converging than the L-junction test)
    # -- the case more likely to trigger approxPolyDP's near-duplicate-point
    # artifact in practice. No wall should come out under MIN_SEGMENT_LENGTH_PX.
    mask = np.zeros((100, 150), dtype=np.uint8)
    mask[15:25, 10:140] = 1  # long horizontal wall
    mask[15:70, 65:75] = 1  # vertical branch off the middle of it
    segments = _g0_segments(mask)
    lengths = [np.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]) for s in segments]
    stubs = [round(length, 2) for length in lengths if length < 3]
    assert not stubs, f"expected no sub-3px stub segments at the T-junction, got {stubs}"
    assert max(lengths) > 50, "expected at least one long arm to survive"

