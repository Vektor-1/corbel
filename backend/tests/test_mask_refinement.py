import numpy as np

from app.mask_refinement import refine_wall_mask


CONFIG = {"version": "adaptive-thickness-smooth-v1", "kernelSizePx": 3, "minThicknessPxForSmoothing": 6}
DIRECTIONAL_CONFIG = {**CONFIG, "version": "directional-protected-v2", "mode": "directional-protected-v2", "topologyProtectionPx": 2}
CONTOUR_CONFIG = {"version": "contour-smooth-v3", "mode": "contour-smooth-v3", "boundarySmoothingSigmaPx": 1.2, "minThicknessPxForSmoothing": 6}


def test_thin_wall_strip_is_preserved_exactly():
    # A 3px-wide strip never clears the 3px half-thickness safety gate, so
    # it must come out pixel-identical -- this is the whole point of the
    # adaptive gate over the earlier, rejected fixed global kernel.
    mask = np.zeros((30, 60), dtype=np.uint8)
    mask[14:17, 5:55] = 1

    refined = refine_wall_mask(mask, CONFIG)

    assert np.array_equal(refined.astype(np.uint8), mask)


def test_thick_wall_region_gets_boundary_noise_smoothed():
    # A 25px-thick band with an isolated 1px hatch-texture-style protrusion
    # on its boundary. The protrusion sits well within the safe-to-smooth
    # interior (far from any thin/edge region) and should be removed.
    mask = np.zeros((60, 60), dtype=np.uint8)
    mask[10:35, :] = 1  # 25px-thick horizontal band
    mask[9, 30] = 1  # single-pixel spur poking out of the top boundary

    refined = refine_wall_mask(mask, CONFIG)

    assert refined[9, 30] == 0  # the protrusion is gone
    assert not np.array_equal(refined.astype(np.uint8), mask)  # something changed
    # the bulk of the thick region is still wall
    assert refined[20, 30] == 1


def test_doorway_gap_in_a_thick_wall_is_never_bridged():
    mask = np.zeros((40, 80), dtype=np.uint8)
    mask[10:30, 0:35] = 1  # thick wall segment
    mask[10:30, 45:80] = 1  # thick wall segment, other side of a doorway
    # columns 35:45 are a genuine 10px gap (a doorway) -- must stay empty

    refined = refine_wall_mask(mask, CONFIG)

    assert refined[10:30, 35:45].sum() == 0


def test_directional_refinement_preserves_a_narrow_doorway_gap_at_protected_endpoints():
    mask = np.zeros((50, 100), dtype=np.uint8)
    mask[15:35, 0:49] = 1
    mask[15:35, 51:100] = 1

    refined = refine_wall_mask(mask, DIRECTIONAL_CONFIG)

    assert refined[15:35, 49:51].sum() == 0


def test_directional_refinement_preserves_a_true_l_corner():
    mask = np.zeros((80, 80), dtype=np.uint8)
    mask[25:45, 10:60] = 1
    mask[25:70, 10:30] = 1

    refined = refine_wall_mask(mask, DIRECTIONAL_CONFIG)

    assert refined[34, 20]
    assert refined[55, 20]
    assert refined[34, 50]


def test_no_config_smoothing_threshold_means_everything_thinner_than_default_is_safe():
    # An empty mask is a no-op, not an error.
    mask = np.zeros((10, 10), dtype=np.uint8)
    refined = refine_wall_mask(mask, CONFIG)
    assert refined.sum() == 0


def test_contour_smoothing_removes_repeated_sawtooth_boundary_ripple():
    # Several isolated 1px hatch-texture-style spikes along the top edge,
    # spaced well apart (unlike a dense comb, where every local smoothing
    # window straddles multiple teeth and the boundary shifts as a whole
    # rather than flattening back to the base level -- a real limitation
    # worth remembering, but not the shape of real hatch ripple, which is
    # sparser and irregular, not a tight periodic zigzag).
    mask = np.zeros((60, 60), dtype=np.uint8)
    mask[10:35, :] = 1
    mask[9, 10:50:8] = 1  # a spike every 8px along the top edge

    refined = refine_wall_mask(mask, CONTOUR_CONFIG)

    spikes_before = int(mask[9, :].sum())
    spikes_after = int(refined[9, :].astype(np.uint8).sum())
    assert spikes_after < spikes_before
    assert refined[20, 30]  # the bulk of the wall survives


def test_contour_smoothing_preserves_a_thin_wall_strip():
    mask = np.zeros((30, 60), dtype=np.uint8)
    mask[14:17, 5:55] = 1

    refined = refine_wall_mask(mask, CONTOUR_CONFIG)

    assert np.array_equal(refined.astype(np.uint8), mask)


def test_contour_smoothing_never_bridges_a_doorway_gap():
    mask = np.zeros((40, 80), dtype=np.uint8)
    mask[10:30, 0:35] = 1
    mask[10:30, 45:80] = 1

    refined = refine_wall_mask(mask, CONTOUR_CONFIG)

    assert refined[10:30, 35:45].sum() == 0


def test_contour_smoothing_preserves_a_true_l_corner():
    # An L-shaped thick region. At a conservative sigma the corner should
    # survive recognizably (both arms present, the concave notch still
    # empty) rather than being rounded into a diagonal cut.
    mask = np.zeros((80, 80), dtype=np.uint8)
    mask[25:45, 10:60] = 1
    mask[25:70, 10:30] = 1

    refined = refine_wall_mask(mask, CONTOUR_CONFIG)

    assert refined[34, 50]  # far arm of the horizontal leg
    assert refined[60, 20]  # far arm of the vertical leg
    assert not refined[60, 50]  # the concave notch outside the L is still empty
