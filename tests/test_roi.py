from PIL import Image, ImageDraw

from app.roi import propose_plan_regions


def test_roi_proposal_prefers_large_plan_like_ink_region():
    image = Image.new("RGB", (1000, 700), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 680, 580), outline="black", width=12)
    draw.rectangle((770, 560, 950, 660), outline="black", width=8)
    proposal = propose_plan_regions(image)
    assert proposal["mode"] == "shadow"
    assert proposal["selected"] is not None
    assert proposal["selected"]["x"] < 200
    assert proposal["selected"]["width"] > 500


def test_roi_proposal_abstains_when_two_regions_have_near_equal_scores():
    image = Image.new("RGB", (800, 400), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 50, 330, 350), outline="black", width=10)
    draw.rectangle((470, 50, 770, 350), outline="black", width=10)
    proposal = propose_plan_regions(image)
    assert proposal["selected"] is None
    assert proposal["ambiguous"] is True
