from app.dimensions import DimensionConstraint, estimate_pixels_per_meter


def test_dimension_scale_estimate_rejects_an_ocr_outlier():
    result = estimate_pixels_per_meter([
        DimensionConstraint("a", (0, 0), (360, 0), 3600, 0.9),
        DimensionConstraint("b", (0, 0), (450, 0), 4500, 0.8),
        DimensionConstraint("bad", (0, 0), (200, 0), 4000, 0.9),
    ])
    assert result["pixelsPerMeter"] == 100
    assert result["inliers"] == ["a", "b"]
    assert result["outliers"] == ["bad"]


def test_dimension_scale_requires_a_valid_constraint():
    result = estimate_pixels_per_meter([DimensionConstraint("bad", (0, 0), (0, 0), 1000, 0.9)])
    assert result["pixelsPerMeter"] is None
    assert result["confidence"] == 0.0
