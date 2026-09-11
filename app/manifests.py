import hashlib
import json
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .config import settings
from .models import ModelAlias


def _validate_topology(manifest: dict) -> None:
    topology = manifest.get("topology")
    if topology is None:
        return
    required = {
        "version", "junctionSnapPx", "maxCollinearAngleDeg", "maxLineOffsetPx",
        "maxGapPx", "maxThicknessRatioDelta", "minLogicalWallLengthPx",
    }
    if not isinstance(topology, dict) or required - topology.keys():
        raise HTTPException(status_code=500, detail="Model manifest topology configuration is incomplete.")
    if any(not isinstance(topology[key], (int, float)) or topology[key] < 0 for key in required - {"version"}):
        raise HTTPException(status_code=500, detail="Model manifest topology thresholds are invalid.")
    verification = manifest.get("verification")
    verification_required = {"maxCentrelineDistancePx", "minimumSupport", "maxUnsupportedShortWallPx"}
    if not isinstance(verification, dict) or verification_required - verification.keys():
        raise HTTPException(status_code=500, detail="Model manifest verification configuration is incomplete.")
    if not 0 <= verification["minimumSupport"] <= 1:
        raise HTTPException(status_code=500, detail="Model manifest verification threshold is invalid.")


def _validate_tiling(manifest: dict) -> None:
    tiling = manifest.get("tiling")
    if tiling is None:
        return
    required = {"version", "tileSizePx", "overlapPx", "blendWeight"}
    if not isinstance(tiling, dict) or required - tiling.keys():
        raise HTTPException(status_code=500, detail="Model manifest tiling configuration is incomplete.")
    if not isinstance(tiling["tileSizePx"], int) or tiling["tileSizePx"] <= 0:
        raise HTTPException(status_code=500, detail="Model manifest tile size is invalid.")
    if not isinstance(tiling["overlapPx"], int) or not 0 <= tiling["overlapPx"] < tiling["tileSizePx"]:
        raise HTTPException(status_code=500, detail="Model manifest tile overlap is invalid.")
    if not isinstance(tiling["blendWeight"], (int, float)) or not 0 <= tiling["blendWeight"] <= 1:
        raise HTTPException(status_code=500, detail="Model manifest tile blend weight is invalid.")


def _validate_reconciliation(manifest: dict) -> None:
    reconciliation = manifest.get("reconciliation")
    if reconciliation is None:
        return
    required = {
        "version", "maxCollinearAngleDeg", "maxLineOffsetPx", "maxThicknessRatioDelta",
        "junctionGuardPx", "maxBridgeGapPx", "minimumBridgeSupport", "maxSourceEdgeDistancePx", "sourceEdgeWeight",
    }
    if not isinstance(reconciliation, dict) or required - reconciliation.keys():
        raise HTTPException(status_code=500, detail="Model manifest reconciliation configuration is incomplete.")
    if not 0 <= reconciliation["minimumBridgeSupport"] <= 1 or not 0 <= reconciliation["sourceEdgeWeight"] <= 1:
        raise HTTPException(status_code=500, detail="Model manifest reconciliation threshold is invalid.")
    if any(not isinstance(reconciliation[key], (int, float)) or reconciliation[key] < 0 for key in required - {"version", "minimumBridgeSupport", "sourceEdgeWeight"}):
        raise HTTPException(status_code=500, detail="Model manifest reconciliation values are invalid.")


def _validate_mask_refinement(manifest: dict) -> None:
    refinement = manifest.get("maskRefinement")
    if refinement is None:
        return
    required = {"version", "kernelSizePx", "minThicknessPxForSmoothing"}
    if not isinstance(refinement, dict) or required - refinement.keys():
        raise HTTPException(status_code=500, detail="Model manifest mask refinement configuration is incomplete.")
    kernel_size = refinement["kernelSizePx"]
    if not isinstance(kernel_size, int) or kernel_size < 3 or kernel_size % 2 == 0:
        raise HTTPException(status_code=500, detail="Model manifest mask refinement kernel must be an odd integer of at least 3.")
    if not isinstance(refinement["minThicknessPxForSmoothing"], (int, float)) or refinement["minThicknessPxForSmoothing"] <= 0:
        raise HTTPException(status_code=500, detail="Model manifest mask refinement thickness threshold is invalid.")
    if "topologyProtectionPx" in refinement and (not isinstance(refinement["topologyProtectionPx"], int) or refinement["topologyProtectionPx"] < 0):
        raise HTTPException(status_code=500, detail="Model manifest mask refinement topology protection is invalid.")


def load_registry() -> dict:
    path = Path(settings.model_manifest_path)
    if not path.exists():
        raise HTTPException(status_code=503, detail="Model manifest is unavailable.")
    return json.loads(path.read_text())


def active_manifest_id(db: Session) -> str:
    alias = db.get(ModelAlias, "production")
    return alias.manifest_id if alias else str(load_registry()["activeAlias"])


def manifest_by_id(manifest_id: str) -> dict:
    manifest = load_registry().get("manifests", {}).get(manifest_id)
    if not manifest:
        raise HTTPException(status_code=400, detail="Unknown model manifest.")
    _validate_topology(manifest)
    _validate_tiling(manifest)
    _validate_reconciliation(manifest)
    _validate_mask_refinement(manifest)
    return manifest


def promote(db: Session, manifest_id: str) -> None:
    if manifest_id not in load_registry().get("manifests", {}):
        raise HTTPException(status_code=404, detail="Unknown model manifest.")
    alias = db.get(ModelAlias, "production")
    if alias:
        alias.manifest_id = manifest_id
    else:
        db.add(ModelAlias(name="production", manifest_id=manifest_id))
    db.commit()


def verify_artifact(path_name: str, expected_sha256: str) -> Path:
    path = Path(settings.model_artifact_dir) / path_name
    if not path.is_file():
        raise RuntimeError(f"Required model artifact is missing: {path_name}")
    if expected_sha256.startswith("REPLACE_"):
        raise RuntimeError(f"Required model artifact checksum is not configured: {path_name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest.lower() != expected_sha256.lower():
        raise RuntimeError(f"Model artifact checksum mismatch: {path_name}")
    return path
