import runpod

from pipeline import analyze_source


def handler(job):
    payload = job.get("input") or {}
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported input schema version.")
    source = payload.get("source")
    if not isinstance(source, dict):
        raise ValueError("A source object is required.")
    if source.get("kind") not in ("image", "pdf"):
        raise ValueError("Only image and PDF sources are supported in V1.")
    return analyze_source(source)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
