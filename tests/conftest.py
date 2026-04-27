"""Shared fixtures for AI Face Analyzer tests."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture()
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture()
def valid_face_jpeg() -> bytes:
    """Generate a simple JPEG image (solid colour, no real face)."""
    img = Image.new("RGB", (200, 200), color=(180, 140, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture()
def valid_png() -> bytes:
    """Generate a simple PNG image."""
    img = Image.new("RGB", (200, 200), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def tiny_image() -> bytes:
    """A 10x10 image — below minimum dimension."""
    img = Image.new("RGB", (10, 10), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture()
def large_image_bytes() -> bytes:
    """Simulated >10 MB payload."""
    return b"\xff\xd8" + b"\x00" * (11 * 1024 * 1024)


@pytest.fixture()
def real_face_jpeg() -> bytes | None:
    """Load a real face image if available on disk (for integration tests)."""
    path = Path("/home/ubuntu/test_face.jpg")
    if path.exists():
        return path.read_bytes()
    return None
