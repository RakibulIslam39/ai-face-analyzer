"""AI Face Analyzer — FastAPI backend."""

from __future__ import annotations

import base64
import io
import logging
import traceback
from pathlib import Path
from typing import Any

import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

logger = logging.getLogger("face_analyzer")
logging.basicConfig(level=logging.INFO)

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="AI Face Analyzer",
    description="Detect age, emotion, gender & ethnicity from a face photo.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EMOTION_LABELS_BN: dict[str, str] = {
    "angry": "রাগান্বিত 😠",
    "disgust": "বিতৃষ্ণা 🤢",
    "fear": "ভয় 😨",
    "happy": "খুশি 😊",
    "sad": "দুঃখিত 😢",
    "surprise": "অবাক 😲",
    "neutral": "নিরপেক্ষ 😐",
}

GENDER_LABELS_BN: dict[str, str] = {
    "Man": "পুরুষ 👨",
    "Woman": "নারী 👩",
}

RACE_LABELS_BN: dict[str, str] = {
    "asian": "এশিয়ান",
    "indian": "ভারতীয় উপমহাদেশ",
    "black": "আফ্রিকান",
    "white": "ইউরোপীয়/সাদা",
    "middle eastern": "মধ্যপ্রাচ্য",
    "latino hispanic": "ল্যাটিনো/হিস্পানিক",
}


def _read_image(raw_bytes: bytes) -> np.ndarray:
    """Convert raw bytes to a numpy RGB array."""
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    return np.array(img)


def _to_python(val: Any) -> Any:
    """Convert numpy scalars to native Python types for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _format_result(analysis: dict[str, Any]) -> dict[str, Any]:
    """Normalise a single DeepFace analysis dict into a clean response."""
    dominant_emotion = str(analysis.get("dominant_emotion", "unknown"))
    dominant_gender = str(analysis.get("dominant_gender", "unknown"))
    dominant_race = str(analysis.get("dominant_race", "unknown"))

    emotion_scores = analysis.get("emotion", {})
    gender_scores = analysis.get("gender", {})
    race_scores = analysis.get("race", {})

    region = analysis.get("region", {})
    safe_region = {k: _to_python(v) for k, v in region.items()} if isinstance(region, dict) else region

    return {
        "age": _to_python(analysis.get("age")),
        "emotion": {
            "dominant": dominant_emotion,
            "dominant_bn": EMOTION_LABELS_BN.get(dominant_emotion, dominant_emotion),
            "scores": {k: round(float(v), 2) for k, v in emotion_scores.items()},
        },
        "gender": {
            "dominant": dominant_gender,
            "dominant_bn": GENDER_LABELS_BN.get(dominant_gender, dominant_gender),
            "scores": {k: round(float(v), 2) for k, v in gender_scores.items()},
        },
        "ethnicity": {
            "dominant": dominant_race,
            "dominant_bn": RACE_LABELS_BN.get(dominant_race, dominant_race),
            "scores": {k: round(float(v), 2) for k, v in race_scores.items()},
        },
        "face_region": safe_region,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the single-page frontend."""
    return FileResponse(BASE_DIR / "templates" / "index.html")


@app.post("/api/analyze")
async def analyze_face(file: UploadFile = File(...)):
    """Accept an image upload and return face analysis results."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        img_array = _read_image(contents)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        results = DeepFace.analyze(
            img_path=img_array,
            actions=["age", "gender", "race", "emotion"],
            enforce_detection=True,
            detector_backend="opencv",
            silent=True,
        )
    except ValueError as exc:
        logger.warning("No face detected: %s", exc)
        raise HTTPException(
            status_code=422,
            detail="কোনো মুখ শনাক্ত করা যায়নি। অনুগ্রহ করে একটি পরিষ্কার মুখের ছবি দিন।",
        )
    except Exception:
        logger.error("Analysis failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Face analysis failed")

    if isinstance(results, list):
        faces = [_format_result(r) for r in results]
    else:
        faces = [_format_result(results)]

    # Build a small thumbnail for the response
    thumb = Image.open(io.BytesIO(contents)).convert("RGB")
    thumb.thumbnail((400, 400))
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=80)
    thumb_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "success": True,
        "face_count": len(faces),
        "faces": faces,
        "thumbnail": f"data:image/jpeg;base64,{thumb_b64}",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
