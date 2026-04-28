FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY app/ app/
COPY static/ static/
COPY templates/ templates/

RUN pip install --no-cache-dir .

# Pre-download DeepFace models at build time so first request is fast
RUN python -c "from deepface import DeepFace; DeepFace.build_model('Emotion'); DeepFace.build_model('Age'); DeepFace.build_model('Gender'); DeepFace.build_model('Race')" 2>/dev/null || true

EXPOSE 8000

# Render sets PORT env var; default to 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
