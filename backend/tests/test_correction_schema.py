from app.schemas import CorrectionCreate, DimensionConstraintsCreate


def test_correction_schema_accepts_explicit_unchanged_training_example():
    payload = CorrectionCreate(
        approvedGeometry={"walls": [], "openings": []},
        editDeltas=[],
        trainingConsent=True,
        acceptedUnchanged=True,
    )
    assert payload.acceptedUnchanged is True
    assert payload.trainingConsent is True


def test_dimension_constraint_schema_requires_bounded_geometry():
    payload = DimensionConstraintsCreate(constraints=[{
        "id": "dimension-1",
        "start": {"x": 0, "y": 0},
        "end": {"x": 360, "y": 0},
        "valueMm": 3600,
        "confidence": 0.9,
    }])
    assert payload.constraints[0].valueMm == 3600
