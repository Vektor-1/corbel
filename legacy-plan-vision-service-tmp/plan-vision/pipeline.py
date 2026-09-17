import io
import math
import os
import re
from pathlib import Path
from urllib.parse import urlparse

import cv2
import fitz
import numpy as np
import pytesseract
import requests
from PIL import Image

MAX_SOURCE_BYTES = int(os.getenv("MAX_SOURCE_BYTES", str(50 * 1024 * 1024)))
ROOM_WORDS = {
    "bedroom", "bed", "kitchen", "bathroom", "bath", "living", "dining",
    "store", "storage", "hall", "corridor", "porch", "veranda", "office",
    "classroom", "garage", "laundry", "wc", "toilet", "lobby",
}


def _allowed_host(url):
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    configured = [item.strip().lower() for item in os.getenv("PLAN_IMPORT_ALLOWED_HOSTS", "").split(",") if item.strip()]
    return host.endswith(".blob.vercel-storage.com") or host in configured


def _download(url):
    if not _allowed_host(url):
        raise ValueError("Source host is not allowed by the vision worker.")
    response = requests.get(url, timeout=30, stream=True)
    response.raise_for_status()
    chunks = []
    size = 0
    for chunk in response.iter_content(1024 * 1024):
        size += len(chunk)
        if size > MAX_SOURCE_BYTES:
            raise ValueError("Source exceeds the worker size limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _render_source(source, raw):
    if source["kind"] == "pdf":
        document = fitz.open(stream=raw, filetype="pdf")
        page_index = max(0, int(source.get("page", 1)) - 1)
        if page_index >= len(document):
            raise ValueError("Requested PDF page does not exist.")
        pixmap = document[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        document.close()
        return image
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _resize(image, maximum=2600):
    width, height = image.size
    ratio = min(1.0, maximum / max(width, height))
    if ratio == 1:
        return image
    return image.resize((round(width * ratio), round(height * ratio)), Image.Resampling.LANCZOS)


def _canonical_line(line):
    x1, y1, x2, y2 = [int(value) for value in line]
    if (x2, y2) < (x1, y1):
        return x2, y2, x1, y1
    return x1, y1, x2, y2


def _merge_axis_lines(lines, coordinate_tolerance=5, gap_tolerance=14):
    normalized = []
    for x1, y1, x2, y2, _ in lines:
        horizontal = abs(x2 - x1) >= abs(y2 - y1)
        if horizontal:
            normalized.append(["h", (y1 + y2) / 2, min(x1, x2), max(x1, x2)])
        else:
            normalized.append(["v", (x1 + x2) / 2, min(y1, y2), max(y1, y2)])
    normalized.sort(key=lambda item: (item[0], item[1], item[2]))

    merged = []
    for axis, coordinate, start, end in normalized:
        match = None
        for candidate in reversed(merged):
            if candidate[0] != axis:
                continue
            if abs(candidate[1] - coordinate) <= coordinate_tolerance and start <= candidate[3] + gap_tolerance:
                match = candidate
                break
            if candidate[1] < coordinate - coordinate_tolerance:
                break
        if match:
            total = (match[3] - match[2]) + (end - start)
            match[1] = (match[1] * (match[3] - match[2]) + coordinate * (end - start)) / max(1, total)
            match[2] = min(match[2], start)
            match[3] = max(match[3], end)
        else:
            merged.append([axis, coordinate, start, end])

    output = []
    for axis, coordinate, start, end in merged:
        if axis == "h":
            output.append((round(start), round(coordinate), round(end), round(coordinate), end - start))
        else:
            output.append((round(coordinate), round(start), round(coordinate), round(end), end - start))
    return output


def _axis_record(line):
    x1, y1, x2, y2, length = line
    if abs(x2 - x1) >= abs(y2 - y1):
        return ["h", (y1 + y2) / 2, min(x1, x2), max(x1, x2), length]
    return ["v", (x1 + x2) / 2, min(y1, y2), max(y1, y2), length]


def _collapse_wall_boundaries(lines, image_size):
    records = [_axis_record(line) for line in lines]
    maximum = max(image_size)
    max_thickness = max(14, maximum * 0.018)
    used = set()
    centerlines = []

    for index, first in enumerate(records):
        if index in used:
            continue
        best = None
        best_score = 0
        for other_index in range(index + 1, len(records)):
            if other_index in used:
                continue
            second = records[other_index]
            if first[0] != second[0]:
                continue
            distance = abs(first[1] - second[1])
            if distance < 3 or distance > max_thickness:
                continue
            overlap_start = max(first[2], second[2])
            overlap_end = min(first[3], second[3])
            overlap = max(0, overlap_end - overlap_start)
            overlap_ratio = overlap / max(1, min(first[4], second[4]))
            if overlap_ratio < 0.62:
                continue
            score = overlap_ratio - distance / (max_thickness * 4)
            if score > best_score:
                best = (other_index, second, overlap_start, overlap_end, overlap_ratio)
                best_score = score

        if best:
            other_index, second, start, end, overlap_ratio = best
            used.update((index, other_index))
            coordinate = (first[1] + second[1]) / 2
            if first[0] == "h":
                centerlines.append((round(start), round(coordinate), round(end), round(coordinate), end - start, 0.54 + overlap_ratio * 0.13))
            else:
                centerlines.append((round(coordinate), round(start), round(coordinate), round(end), end - start, 0.54 + overlap_ratio * 0.13))
        elif first[4] >= maximum * 0.11:
            # Preserve unusually long single strokes at lower confidence. They may
            # represent centerline-style walls, but often include dimensions.
            if first[0] == "h":
                centerlines.append((round(first[2]), round(first[1]), round(first[3]), round(first[1]), first[4], 0.34))
            else:
                centerlines.append((round(first[1]), round(first[2]), round(first[1]), round(first[3]), first[4], 0.34))

    return centerlines


def _snap_wall_network(lines, tolerance=16):
    mutable = [list(line) for line in lines]
    for horizontal in mutable:
        if abs(horizontal[2] - horizontal[0]) < abs(horizontal[3] - horizontal[1]):
            continue
        y = (horizontal[1] + horizontal[3]) / 2
        for endpoint_index in (0, 2):
            x = horizontal[endpoint_index]
            candidates = []
            for vertical in mutable:
                if abs(vertical[2] - vertical[0]) >= abs(vertical[3] - vertical[1]):
                    continue
                vx = (vertical[0] + vertical[2]) / 2
                low, high = sorted((vertical[1], vertical[3]))
                if abs(vx - x) <= tolerance and low - tolerance <= y <= high + tolerance:
                    candidates.append((abs(vx - x), vx))
            if candidates:
                horizontal[endpoint_index] = round(min(candidates)[1])

    for vertical in mutable:
        if abs(vertical[2] - vertical[0]) >= abs(vertical[3] - vertical[1]):
            continue
        x = (vertical[0] + vertical[2]) / 2
        for endpoint_index in (1, 3):
            y = vertical[endpoint_index]
            candidates = []
            for horizontal in mutable:
                if abs(horizontal[2] - horizontal[0]) < abs(horizontal[3] - horizontal[1]):
                    continue
                hy = (horizontal[1] + horizontal[3]) / 2
                low, high = sorted((horizontal[0], horizontal[2]))
                if abs(hy - y) <= tolerance and low - tolerance <= x <= high + tolerance:
                    candidates.append((abs(hy - y), hy))
            if candidates:
                vertical[endpoint_index] = round(min(candidates)[1])

    return [tuple(line) for line in mutable if math.hypot(line[2] - line[0], line[3] - line[1]) >= 20]


def _detect_walls(rgb):
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    height, width = binary.shape
    minimum = max(30, round(max(width, height) * 0.025))

    # Long morphological kernels discard text, furniture details and dotted grids
    # before the Hough transform. This remains a candidate generator, not a
    # substitute for the learned wall segmentation adapter.
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (minimum, 1)))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, minimum)))
    line_mask = cv2.bitwise_or(horizontal, vertical)
    lines = cv2.HoughLinesP(line_mask, 1, np.pi / 180, threshold=35, minLineLength=minimum, maxLineGap=10)
    if lines is None:
        return []

    accepted = []
    for raw_line in lines[:, 0]:
        x1, y1, x2, y2 = _canonical_line(raw_line)
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < minimum:
            continue
        angle = abs(math.degrees(math.atan2(dy, dx))) % 180
        axis_error = min(angle, abs(90 - angle), abs(180 - angle))
        if axis_error <= 3:
            accepted.append((x1, y1, x2, y2, length))

    merged = _merge_axis_lines(accepted)
    centerlines = _collapse_wall_boundaries(merged, (width, height))
    snapped = _snap_wall_network(centerlines, tolerance=max(10, round(max(width, height) * 0.007)))
    snapped.sort(key=lambda item: item[4], reverse=True)
    return snapped[:120]


def _ocr(rgb):
    detections = []
    try:
        data = pytesseract.image_to_data(rgb, output_type=pytesseract.Output.DICT, config="--psm 11")
    except Exception:
        return detections

    for index, raw_text in enumerate(data.get("text", [])):
        text = raw_text.strip()
        if not text:
            continue
        try:
            confidence = max(0.0, min(1.0, float(data["conf"][index]) / 100))
        except (ValueError, TypeError):
            confidence = 0.0
        x = data["left"][index] + data["width"][index] / 2
        y = data["top"][index] + data["height"][index] / 2
        normalized = re.sub(r"[^a-z]", "", text.lower())

        if normalized in ROOM_WORDS:
            detections.append({
                "id": f"label-{index}", "kind": "label", "confidence": confidence,
                "text": text, "position": {"x": x, "y": y}, "role": "room-name",
            })
            continue

        match = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?", text.lower())
        if match:
            value = float(match.group(1).replace(",", "."))
            unit = match.group(2) or "mm"
            value_mm = value * (1000 if unit == "m" else 10 if unit == "cm" else 1)
            detections.append({
                "id": f"dimension-{index}", "kind": "dimension", "confidence": confidence,
                "start": {"x": x - data["width"][index] / 2, "y": y},
                "end": {"x": x + data["width"][index] / 2, "y": y},
                "valueMm": value_mm, "text": text,
            })
    return detections


def analyze_source(source):
    raw = _download(source["url"])
    image = _resize(_render_source(source, raw))
    rgb = np.asarray(image)
    walls = _detect_walls(rgb)
    detections = []

    for index, (x1, y1, x2, y2, length, structure_confidence) in enumerate(walls):
        confidence = min(0.78, structure_confidence + length / max(image.size) * 0.08)
        detections.append({
            "id": f"wall-{index}", "kind": "wall", "confidence": round(confidence, 3),
            "start": {"x": x1, "y": y1}, "end": {"x": x2, "y": y2},
            "thicknessMm": 225, "role": "loadBearing",
        })

    detections.extend(_ocr(rgb))
    wall_confidences = [item["confidence"] for item in detections if item["kind"] == "wall"]
    overall = sum(wall_confidences) / len(wall_confidences) if wall_confidences else 0.1

    output_source = dict(source)
    output_source["width"], output_source["height"] = image.size
    return {
        "schemaVersion": 1,
        "source": output_source,
        "scale": {
            "pixelsPerMeter": 100,
            "confidence": 0.15,
            "method": "manual",
        },
        "detections": detections,
        "overallConfidence": round(overall, 3),
        "warnings": [
            "Classical baseline: confirm every wall and the drawing scale.",
            "Door and window recognition requires the learned CubiCasa model adapter.",
        ],
    }


def analyze_local(path, kind="image", page=1):
    raw = Path(path).read_bytes()
    source = {
        "kind": kind,
        "fileName": Path(path).name,
        "url": f"https://local.invalid/{Path(path).name}",
        "page": page,
        "width": 1,
        "height": 1,
    }
    image = _resize(_render_source(source, raw))
    rgb = np.asarray(image)
    walls = _detect_walls(rgb)
    detections = [{
        "id": f"wall-{index}", "kind": "wall", "confidence": round(min(0.78, item[5] + item[4] / max(image.size) * 0.08), 3),
        "start": {"x": item[0], "y": item[1]}, "end": {"x": item[2], "y": item[3]},
        "thicknessMm": 225, "role": "loadBearing",
    } for index, item in enumerate(walls)]
    detections.extend(_ocr(rgb))
    source["width"], source["height"] = image.size
    confidences = [item["confidence"] for item in detections if item["kind"] == "wall"]
    return {
        "schemaVersion": 1, "source": source,
        "scale": {"pixelsPerMeter": 100, "confidence": 0.15, "method": "manual"},
        "detections": detections,
        "overallConfidence": round(sum(confidences) / len(confidences), 3) if confidences else 0.1,
        "warnings": ["Local classical-baseline evaluation."],
    }
