"""Load testing for AI Face Analyzer using Locust.

Run with:
    locust -f tests/locustfile.py --host http://localhost:8000 --headless \
        -u 10 -r 2 --run-time 30s
"""

from __future__ import annotations

import io

from locust import HttpUser, between, task
from PIL import Image


def _make_test_image(w: int = 200, h: int = 200) -> bytes:
    """Create a simple JPEG in memory."""
    img = Image.new("RGB", (w, h), color=(180, 140, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


class FaceAnalyzerUser(HttpUser):
    """Simulated user interacting with the AI Face Analyzer."""

    wait_time = between(1, 3)

    def on_start(self):
        self.test_image = _make_test_image()

    @task(5)
    def load_homepage(self):
        """Load the main page."""
        self.client.get("/", name="GET /")

    @task(3)
    def health_check(self):
        """Hit the health endpoint."""
        self.client.get("/health", name="GET /health")

    @task(2)
    def load_static_css(self):
        """Load CSS."""
        self.client.get("/static/style.css", name="GET /static/style.css")

    @task(2)
    def load_static_js(self):
        """Load JS."""
        self.client.get("/static/app.js", name="GET /static/app.js")

    @task(10)
    def analyze_image(self):
        """Submit an image for analysis (expect 422 = no face in test image)."""
        self.client.post(
            "/api/analyze",
            files={"file": ("test.jpg", self.test_image, "image/jpeg")},
            name="POST /api/analyze",
        )

    @task(1)
    def analyze_empty(self):
        """Submit an empty file (expect 400)."""
        self.client.post(
            "/api/analyze",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
            name="POST /api/analyze (empty)",
        )

    @task(1)
    def analyze_invalid_type(self):
        """Submit a non-image file (expect 400)."""
        self.client.post(
            "/api/analyze",
            files={"file": ("test.txt", b"not an image", "text/plain")},
            name="POST /api/analyze (invalid type)",
        )
