import json
import sys
from pathlib import Path

from PIL import ImageDraw

from pipeline import _render_source, _resize, analyze_local


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "../../test-fixtures/floor-plans").resolve()
    output = root / "results"
    output.mkdir(parents=True, exist_ok=True)
    supported = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
    rows = []

    for path in sorted(root.iterdir()):
        if path.suffix.lower() not in supported:
            continue
        kind = "pdf" if path.suffix.lower() == ".pdf" else "image"
        try:
            result = analyze_local(path, kind=kind)
            result_name = f"{path.stem}-{path.suffix.lower().lstrip('.')}"
            (output / f"{result_name}.json").write_text(json.dumps(result, indent=2))

            source = result["source"]
            preview = _resize(_render_source(source, path.read_bytes())).convert("RGB")
            draw = ImageDraw.Draw(preview, "RGBA")
            for detection in result["detections"]:
                if detection["kind"] == "wall":
                    draw.line(
                        [
                            (detection["start"]["x"], detection["start"]["y"]),
                            (detection["end"]["x"], detection["end"]["y"]),
                        ],
                        fill=(210, 35, 35, 190),
                        width=3,
                    )
                elif detection["kind"] == "label":
                    point = detection["position"]
                    draw.ellipse((point["x"] - 5, point["y"] - 5, point["x"] + 5, point["y"] + 5), fill=(35, 110, 210, 220))
            preview.save(output / f"{result_name}-overlay.jpg", quality=88)
            counts = {}
            for detection in result["detections"]:
                counts[detection["kind"]] = counts.get(detection["kind"], 0) + 1
            rows.append({
                "file": path.name,
                "status": "ok",
                "confidence": result["overallConfidence"],
                "detections": counts,
            })
        except Exception as error:
            rows.append({"file": path.name, "status": "failed", "error": str(error)})

    (output / "summary.json").write_text(json.dumps(rows, indent=2))
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
