from app.evaluation import aggregate_scores, score_reconstruction


def wall(identifier, start, end):
    return {"id": identifier, "kind": "wall", "start": {"x": start[0], "y": start[1]}, "end": {"x": end[0], "y": end[1]}}


def test_scores_matching_walls_and_host_aware_openings():
    reference = {
        "walls": [wall("reference-wall", (0, 0), (100, 0))],
        "openings": [{"id": "reference-door", "kind": "door", "wallId": "reference-wall", "offsetRatio": 0.5}],
    }
    result = {
        "geometry": {
            "walls": [wall("wall-1", (0, 0), (100, 0))],
            "openings": [{"id": "door-1", "kind": "door", "wallId": "wall-1", "offsetRatio": 0.51}],
        },
        "diagnostics": [],
    }
    score = score_reconstruction(result, reference)
    assert score["wall"]["centrelineF1"] == 1
    assert score["opening"]["f1"] == 1
    assert not score["abstained"]


def test_openings_on_wrong_host_do_not_receive_credit():
    reference = {
        "walls": [wall("r1", (0, 0), (100, 0)), wall("r2", (0, 20), (100, 20))],
        "openings": [{"id": "door", "kind": "door", "wallId": "r1", "offsetRatio": 0.5}],
    }
    result = {"geometry": {"walls": [wall("p1", (0, 0), (100, 0)), wall("p2", (0, 20), (100, 20))], "openings": [{"id": "d", "kind": "door", "wallId": "p2", "offsetRatio": 0.5}]}}
    assert score_reconstruction(result, reference)["opening"]["f1"] == 0


def test_opening_receives_credit_when_its_logical_host_merges_reference_segments():
    reference = {
        "walls": [wall("r-left", (0, 0), (50, 0)), wall("r-right", (50, 0), (100, 0))],
        "openings": [{"id": "door", "kind": "door", "wallId": "r-right", "offsetRatio": 0.4}],
    }
    result = {
        "geometry": {
            "walls": [wall("logical-wall", (0, 0), (100, 0))],
            "openings": [{"id": "d", "kind": "door", "wallId": "logical-wall", "offsetRatio": 0.7}],
        }
    }
    assert score_reconstruction(result, reference)["opening"]["f1"] == 1


def test_opening_on_crossing_wall_does_not_receive_credit():
    reference = {
        "walls": [wall("horizontal", (0, 0), (100, 0)), wall("vertical", (50, -50), (50, 50))],
        "openings": [{"id": "door", "kind": "door", "wallId": "horizontal", "offsetRatio": 0.5}],
    }
    result = {"geometry": {"walls": reference["walls"], "openings": [{"id": "d", "kind": "door", "wallId": "vertical", "offsetRatio": 0.5}]}}
    assert score_reconstruction(result, reference)["opening"]["f1"] == 0


def test_aggregate_reports_latency_and_correction_burden():
    score = {"wall": {"centrelinePrecision": 1, "centrelineRecall": 1, "centrelineF1": 1}, "opening": {"precision": 1, "recall": 1, "f1": 1}, "abstained": False}
    aggregate = aggregate_scores([{**score, "latencyMs": 10}, {**score, "latencyMs": 30}], [2, 4])
    assert aggregate["latencyMs"] == {"p50": 10.0, "p95": 30.0}
    assert aggregate["correctionBurden"] == 3
