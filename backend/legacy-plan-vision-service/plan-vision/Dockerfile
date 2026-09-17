FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MAX_SOURCE_BYTES=52428800

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py pipeline.py ./
CMD ["python", "-u", "handler.py"]
