import numpy as np
from PIL import Image

from app.inference import _TTA_TRANSFORMS, _g0_probability, _g0_probability_tta, _load_rgb_image


class _FakeSession:
    """Deterministic stand-in for an onnxruntime session: 'predicts' the
    mean of the red channel per pixel as a single-class logit map, so
    different (correctly transformed) inputs produce different, checkable
    outputs instead of a constant."""

    def get_inputs(self):
        class _Input:
            name = "input"

        return [_Input()]

    def run(self, output_names, feed):
        input_data = feed["input"]  # shape (1, 3, size, size)
        logits = input_data[:, 0, :, :]  # shape (1, size, size)
        return [logits[:, None, :, :]]  # shape (1, 1, size, size) -> logits[0][0] is (size, size)


def _asymmetric_image(size: int = 32) -> Image.Image:
    # A gradient, not symmetric under any flip/rotation, so a wrongly-wired
    # transform/restore pair would show up as a real numeric mismatch.
    array = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(size):
        for x in range(size):
            array[y, x] = (x * 4 % 256, y * 4 % 256, (x + y) % 256)
    return Image.fromarray(array, mode="RGB")


def test_each_tta_transform_pair_is_a_true_involution():
    rng = np.random.default_rng(0)
    array = rng.random((16, 20)).astype(np.float32)
    for name, (_, restore_array) in _TTA_TRANSFORMS.items():
        twice = restore_array(restore_array(array))
        assert np.allclose(twice, array), f"{name} is not self-inverse"


def test_tta_with_only_identity_matches_a_plain_single_pass():
    image = _asymmetric_image()
    session = _FakeSession()
    size = 32

    plain_input, _, _, _ = _load_rgb_image(image, size, fill=0)
    plain = _g0_probability(session, plain_input)

    tta = _g0_probability_tta(session, image, size, {"transforms": ["identity"]})

    assert np.allclose(tta, plain)


def test_tta_averages_multiple_transforms_and_stays_in_probability_range():
    image = _asymmetric_image()
    session = _FakeSession()
    size = 32

    tta = _g0_probability_tta(session, image, size, {"transforms": ["identity", "hflip", "vflip", "rot180"]})

    assert tta.shape == (size, size)
    assert np.all(tta >= 0) and np.all(tta <= 1)  # sigmoid output stays a valid probability after averaging
