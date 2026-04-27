"""AI Face Analyzer — Vercel serverless entrypoint.

Vercel auto-detects this file and creates a serverless function from the
FastAPI ``app`` instance.  Static files (CSS, JS, HTML) are served from the
``public/`` directory by Vercel's CDN — no need for ``StaticFiles`` mount.

For local development the original ``uvicorn app.main:app`` still works.
"""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import time
import traceback
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image

logger = logging.getLogger("face_analyzer")
logging.basicConfig(level=logging.INFO)

BASE_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_DIMENSION = 4096  # px
MIN_IMAGE_DIMENSION = 50  # px
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 20  # per window per IP

# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per-IP)
# ---------------------------------------------------------------------------

_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> bool:
    """Return True if the request is allowed, False if rate-limited."""
    now = time.monotonic()
    window_start = now - RATE_LIMIT_WINDOW
    timestamps = _rate_limit_store[client_ip]
    _rate_limit_store[client_ip] = [t for t in timestamps if t > window_start]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    _rate_limit_store[client_ip].append(now)
    return True


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Face Analyzer",
    description="Detect age, emotion, gender & ethnicity from a face photo.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    max_age=3600,
)


# ---------------------------------------------------------------------------
# Security middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Add security headers to every response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
    return response


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return a safe JSON response."""
    logger.error("Unhandled error on %s: %s", request.url.path, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "server_error",
            "detail": "সার্ভারে একটি অপ্রত্যাশিত সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
        },
    )


# ---------------------------------------------------------------------------
# Label maps
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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
    safe_region = (
        {k: _to_python(v) for k, v in region.items()}
        if isinstance(region, dict)
        else region
    )

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


def _validate_image_bytes(contents: bytes, filename: str | None) -> Image.Image:
    """Validate uploaded image bytes. Returns PIL Image or raises HTTPException."""
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="ফাইলের আকার ১০ MB-র বেশি হতে পারবে না।",
        )

    if not contents:
        raise HTTPException(status_code=400, detail="ফাইলটি খালি।")

    if filename:
        ext = Path(filename).suffix.lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"এই ফাইল ফরম্যাট ({ext}) সাপোর্টেড নয়। শুধুমাত্র JPG, PNG, WebP, GIF, BMP গ্রহণযোগ্য।",
            )

    if not _is_valid_image_header(contents):
        raise HTTPException(
            status_code=400,
            detail="ফাইলটি একটি বৈধ ইমেজ নয়। অনুগ্রহ করে সঠিক ইমেজ ফাইল দিন।",
        )

    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="ইমেজ ফাইলটি ক্ষতিগ্রস্ত বা পড়া যাচ্ছে না।",
        )

    w, h = img.size
    if w < MIN_IMAGE_DIMENSION or h < MIN_IMAGE_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"ইমেজটি খুব ছোট ({w}x{h}px)। সর্বনিম্ন {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION}px হতে হবে।",
        )
    if w > MAX_IMAGE_DIMENSION or h > MAX_IMAGE_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"ইমেজটি খুব বড় ({w}x{h}px)। সর্বোচ্চ {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}px হতে পারে।",
        )

    return img


def _is_valid_image_header(data: bytes) -> bool:
    """Check magic bytes to verify it's actually an image file."""
    if len(data) < 8:
        return False
    if data[:2] == b"\xff\xd8":
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:4] in (b"GIF8",):
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    if data[:2] == b"BM":
        return True
    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the single-page frontend.

    On Vercel ``public/index.html`` is served automatically by the CDN for the
    ``/`` path, so this handler only fires during local development.
    """
    html_path = BASE_DIR / "public" / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    # Fallback to templates/ for legacy local dev
    legacy = BASE_DIR / "templates" / "index.html"
    if legacy.exists():
        return HTMLResponse(legacy.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>AI Face Analyzer</h1><p>index.html not found</p>")


@app.post("/api/analyze")
async def analyze_face(request: Request, file: UploadFile = File(...)):
    """Accept an image upload and return face analysis results."""
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="অনেক বেশি রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ১ মিনিট পরে আবার চেষ্টা করুন।",
        )

    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"অগ্রহণযোগ্য ফাইল টাইপ: {file.content_type}। শুধুমাত্র ইমেজ ফাইল গ্রহণযোগ্য।",
        )

    contents = await file.read()
    img = _validate_image_bytes(contents, file.filename)

    checksum = hashlib.md5(contents).hexdigest()[:12]
    logger.info("Analyzing image: size=%d, checksum=%s, ip=%s", len(contents), checksum, client_ip)

    img_array = np.array(img)
    try:
        results = DeepFace.analyze(
            img_path=img_array,
            actions=["age", "gender", "race", "emotion"],
            enforce_detection=True,
            detector_backend="opencv",
            silent=True,
        )
    except ValueError as exc:
        logger.warning("No face detected: %s (checksum=%s)", exc, checksum)
        raise HTTPException(
            status_code=422,
            detail="কোনো মুখ শনাক্ত করা যায়নি। অনুগ্রহ করে একটি পরিষ্কার মুখের ছবি দিন যেখানে মুখ স্পষ্টভাবে দেখা যায়।",
        )
    except Exception:
        logger.error("Analysis failed (checksum=%s):\n%s", checksum, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="মুখ বিশ্লেষণে সমস্যা হয়েছে। অনুগ্রহ করে অন্য একটি ছবি দিয়ে আবার চেষ্টা করুন।",
        )

    if isinstance(results, list):
        faces = [_format_result(r) for r in results]
    else:
        faces = [_format_result(results)]

    thumb = img.copy()
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.1.0"}
