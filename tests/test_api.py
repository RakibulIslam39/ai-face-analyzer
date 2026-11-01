"""API endpoint tests for AI Face Analyzer."""

from __future__ import annotations

import io

import pytest
from PIL import Image


class TestHealthEndpoint:
    """Tests for GET /health."""

    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_has_security_headers(self, client):
        resp = client.get("/health")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


class TestIndexEndpoint:
    """Tests for GET / (frontend)."""

    def test_index_returns_html(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        assert "AI Face Analyzer" in resp.text


class TestAnalyzeValidation:
    """Validation tests for POST /api/analyze."""

    def test_no_file_returns_422(self, client):
        resp = client.post("/api/analyze")
        assert resp.status_code == 422

    def test_empty_file_returns_400(self, client):
        resp = client.post(
            "/api/analyze",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_invalid_mime_type_returns_400(self, client):
        resp = client.post(
            "/api/analyze",
            files={"file": ("test.txt", b"hello world", "text/plain")},
        )
        assert resp.status_code == 400

    def test_non_image_file_returns_400(self, client):
        resp = client.post(
            "/api/analyze",
            files={"file": ("fake.jpg", b"this is not an image", "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_tiny_image_returns_400(self, client, tiny_image):
        resp = client.post(
            "/api/analyze",
            files={"file": ("tiny.jpg", tiny_image, "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]

    def test_corrupt_jpeg_returns_400(self, client):
        corrupt = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        resp = client.post(
            "/api/analyze",
            files={"file": ("corrupt.jpg", corrupt, "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_valid_image_no_face_returns_422(self, client, valid_face_jpeg):
        resp = client.post(
            "/api/analyze",
            files={"file": ("solid.jpg", valid_face_jpeg, "image/jpeg")},
        )
        # Solid colour image → no face → 422
        assert resp.status_code == 422
        data = resp.json()
        assert "মুখ" in data["detail"]

    def test_png_accepted(self, client, valid_png):
        resp = client.post(
            "/api/analyze",
            files={"file": ("test.png", valid_png, "image/png")},
        )
        # Should be 422 (no face) not 400 (validation)
        assert resp.status_code == 422

    def test_webp_mime_accepted(self, client):
        """WebP content-type header is accepted (even if file isn't truly webp)."""
        img = Image.new("RGB", (100, 100), color=(0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, format="WEBP")
        resp = client.post(
            "/api/analyze",
            files={"file": ("test.webp", buf.getvalue(), "image/webp")},
        )
        # Should pass validation (422 = no face, not 400)
        assert resp.status_code == 422


class TestAnalyzeSuccess:
    """Integration tests with real face images."""

    def test_real_face_analysis(self, client, real_face_jpeg):
        if real_face_jpeg is None:
            pytest.skip("No real face image available at /home/ubuntu/test_face.jpg")

        resp = client.post(
            "/api/analyze",
            files={"file": ("face.jpg", real_face_jpeg, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        assert data["face_count"] >= 1
        assert len(data["faces"]) >= 1
        assert "thumbnail" in data

        face = data["faces"][0]
        assert isinstance(face["age"], (int, float))
        assert face["age"] > 0

        # Emotion
        assert "dominant" in face["emotion"]
        assert "dominant_bn" in face["emotion"]
        assert "scores" in face["emotion"]
        assert len(face["emotion"]["scores"]) == 7

        # Gender
        assert face["gender"]["dominant"] in ("Man", "Woman")
        assert "dominant_bn" in face["gender"]
        assert len(face["gender"]["scores"]) == 2

        # Ethnicity
        assert "dominant" in face["ethnicity"]
        assert "dominant_bn" in face["ethnicity"]
        assert len(face["ethnicity"]["scores"]) >= 5

        # Face region
        assert "x" in face["face_region"]
        assert "y" in face["face_region"]

    def test_response_values_are_native_python(self, client, real_face_jpeg):
        """Ensure no numpy types leak into the JSON response."""
        if real_face_jpeg is None:
            pytest.skip("No real face image available")

        resp = client.post(
            "/api/analyze",
            files={"file": ("face.jpg", real_face_jpeg, "image/jpeg")},
        )
        assert resp.status_code == 200
        # If numpy types leaked, json() would raise or values would be unusual
        data = resp.json()
        face = data["faces"][0]
        assert type(face["age"]) in (int, float)
        for v in face["emotion"]["scores"].values():
            assert type(v) is float
        for v in face["gender"]["scores"].values():
            assert type(v) is float


class TestRateLimiting:
    """Rate limiting tests."""

    def test_rate_limit_not_triggered_on_normal_use(self, client, valid_face_jpeg):
        """A few requests should succeed (validation-wise, not rate-limited)."""
        for _ in range(5):
            resp = client.post(
                "/api/analyze",
                files={"file": ("solid.jpg", valid_face_jpeg, "image/jpeg")},
            )
            assert resp.status_code != 429


class TestSecurityHeaders:
    """Verify security headers on various endpoints."""

    def test_api_response_headers(self, client, valid_face_jpeg):
        resp = client.post(
            "/api/analyze",
            files={"file": ("solid.jpg", valid_face_jpeg, "image/jpeg")},
        )
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"

    def test_static_files_served(self, client):
        resp = client.get("/static/style.css")
        assert resp.status_code == 200
        assert "text/css" in resp.headers.get("content-type", "")

    def test_static_js_served(self, client):
        resp = client.get("/static/app.js")
        assert resp.status_code == 200

    def test_nonexistent_path_returns_404(self, client):
        resp = client.get("/api/nonexistent")
        assert resp.status_code in (404, 405)
