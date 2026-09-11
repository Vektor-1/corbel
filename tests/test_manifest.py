import json
from dataclasses import replace
import pytest
from app import manifests


def test_manifest_contains_immutable_model_metadata(tmp_path, monkeypatch):
    registry = {"activeAlias": "v1", "manifests": {"v1": {"id": "v1", "g0": {}, "yolo": {}}}}
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(registry))
    monkeypatch.setattr(manifests, "settings", replace(manifests.settings, model_manifest_path=str(path)))
    assert manifests.manifest_by_id("v1")["id"] == "v1"


def test_topology_manifest_requires_complete_safe_thresholds(tmp_path, monkeypatch):
    registry = {"activeAlias": "v1", "manifests": {"v1": {"id": "v1", "g0": {}, "yolo": {}, "topology": {"version": "v1"}}}}
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(registry))
    monkeypatch.setattr(manifests, "settings", replace(manifests.settings, model_manifest_path=str(path)))
    with pytest.raises(manifests.HTTPException, match="topology"):
        manifests.manifest_by_id("v1")


def test_tiled_manifest_rejects_overlap_as_large_as_a_tile(tmp_path, monkeypatch):
    registry = {"activeAlias": "v1", "manifests": {"v1": {"id": "v1", "g0": {}, "yolo": {}, "tiling": {"version": "v1", "tileSizePx": 640, "overlapPx": 640, "blendWeight": 0.7}}}}
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(registry))
    monkeypatch.setattr(manifests, "settings", replace(manifests.settings, model_manifest_path=str(path)))
    with pytest.raises(manifests.HTTPException, match="overlap"):
        manifests.manifest_by_id("v1")


def test_reconciliation_manifest_rejects_invalid_support_threshold(tmp_path, monkeypatch):
    registry = {"activeAlias": "v1", "manifests": {"v1": {"id": "v1", "g0": {}, "yolo": {}, "reconciliation": {"version": "v1", "maxCollinearAngleDeg": 5, "maxLineOffsetPx": 2, "maxThicknessRatioDelta": 0.3, "junctionGuardPx": 3, "maxBridgeGapPx": 20, "minimumBridgeSupport": 1.1, "maxSourceEdgeDistancePx": 2, "sourceEdgeWeight": 0.2}}}}
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(registry))
    monkeypatch.setattr(manifests, "settings", replace(manifests.settings, model_manifest_path=str(path)))
    with pytest.raises(manifests.HTTPException, match="reconciliation threshold"):
        manifests.manifest_by_id("v1")
