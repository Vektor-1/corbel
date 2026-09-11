import numpy as np
import pytest
from app.inference import _decode_yolo


def test_yolo_decoder_keeps_openings_and_suppresses_overlaps():
    output = np.zeros((1, 7, 2), dtype=np.float32)
    output[0, :4, 0] = [50, 50, 20, 20]
    output[0, 5, 0] = 0.9  # door
    output[0, :4, 1] = [51, 50, 20, 20]
    output[0, 5, 1] = 0.8
    decoded = _decode_yolo(output, {"scale": 1, "padX": 0, "padY": 0}, 100, 100, 0.25, 0.45)
    assert len(decoded) == 1
    assert decoded[0]["kind"] == "door"
    assert decoded[0]["confidence"] == pytest.approx(0.9)
    assert decoded[0]["bbox"] == [40.0, 40.0, 60.0, 60.0]
