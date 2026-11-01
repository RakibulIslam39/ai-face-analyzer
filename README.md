# AI Face Analyzer

AI Face Analyzer is a FastAPI web application that analyzes faces in uploaded images. It uses DeepFace with OpenCV detection to estimate age, emotion, gender, and race, then presents the results through a responsive HTML/CSS/JavaScript interface.

The frontend supports image upload, drag and drop, and browser camera capture. Results include one entry per detected face, localized labels, confidence scores, face regions, and a thumbnail preview.

## Features

- Age estimation
- Seven emotion categories: angry, disgust, fear, happy, sad, surprise, and neutral
- Gender and race estimation
- Multiple-face analysis
- Camera capture and image upload from desktop or mobile browsers
- Drag-and-drop upload
- Bengali labels and error messages in the UI and API responses
- JPEG, PNG, WebP, GIF, and BMP validation
- File size and image-dimension limits
- Per-IP rate limiting and security response headers
- Docker and Render deployment support

## Technology

| Area           | Technology                         |
| -------------- | ---------------------------------- |
| Backend        | Python 3.10+, FastAPI, Uvicorn     |
| Analysis       | DeepFace, TensorFlow/Keras, OpenCV |
| Image handling | Pillow, NumPy                      |
| Frontend       | HTML, CSS, vanilla JavaScript      |
| Deployment     | Docker, Render                     |
| Testing        | pytest, HTTPX, Locust              |

## Project Structure

```
ai-face-analyzer/
├── app/
│   ├── __init__.py
│   └── main.py             # FastAPI application and API routes
├── static/
│   ├── app.js              # Upload, camera, and results logic
│   └── style.css           # Frontend styles
├── templates/
│   └── index.html           # Single-page frontend
├── tests/
│   ├── conftest.py          # Test fixtures
│   ├── locustfile.py        # Load-test scenario
│   └── test_api.py          # API and validation tests
├── Dockerfile
├── pyproject.toml           # Runtime and test dependencies
├── render.yaml              # Render service configuration
└── README.md
```

## Local Development

Python 3.10 or newer is required. DeepFace downloads its model files on first use; the Docker image preloads the configured models during the build.

```bash
git clone https://github.com/RakibulIslam39/ai-face-analyzer.git
cd ai-face-analyzer

python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -e .

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open <http://localhost:8000> after the server starts. Interactive API documentation is available at <http://localhost:8000/docs>.

## Docker

```bash
docker build -t ai-face-analyzer .
docker run --rm -p 8000:8000 ai-face-analyzer
```

The container listens on `PORT` when that environment variable is provided, or port `8000` by default.

## Render Deployment

This repository includes `render.yaml` and a Dockerfile for Render. The configured service is named `ai-face-analyzer`, uses the Docker runtime, listens on port `8000`, and checks `GET /health` for service health.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/RakibulIslam39/ai-face-analyzer)

DeepFace and TensorFlow are resource-intensive. A Render plan with enough memory for model loading is recommended; the Docker build also downloads the Age, Emotion, Gender, and Race models.

## Testing

Install the optional test dependencies and run the test suite:

```bash
pip install -e ".[test]"
pytest -v
```

The real-face integration tests use `/home/ubuntu/test_face.jpg` when that fixture is available; otherwise those tests are skipped. Most validation and endpoint tests run without a real face image.

For a basic Locust load test, start the application first and run:

```bash
locust -f tests/locustfile.py --host http://localhost:8000 --headless -u 10 -r 2 --run-time 30s
```

## API

### `GET /`

Serves the web interface.

### `GET /health`

Returns the service status:

```json
{ "status": "ok", "version": "1.1.0" }
```

### `POST /api/analyze`

Accepts `multipart/form-data` with an image in the required `file` field.

Successful responses contain one result for every detected face:

```json
{
  "success": true,
  "face_count": 1,
  "faces": [
    {
      "age": 25,
      "emotion": {
        "dominant": "happy",
        "dominant_bn": "খুশি",
        "scores": { "happy": 95.2, "neutral": 3.1 }
      },
      "gender": {
        "dominant": "Man",
        "dominant_bn": "পুরুষ",
        "scores": { "Man": 98.5, "Woman": 1.5 }
      },
      "ethnicity": {
        "dominant": "asian",
        "dominant_bn": "এশিয়ান",
        "scores": { "asian": 85.3, "indian": 10.2 }
      },
      "face_region": { "x": 120, "y": 80, "w": 200, "h": 200 }
    }
  ],
  "thumbnail": "data:image/jpeg;base64,..."
}
```

Example request:

```bash
curl -X POST http://localhost:8000/api/analyze \
  -F "file=@/path/to/photo.jpg"
```

Common responses include:

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `400`  | Invalid, empty, unsupported, corrupt, too-small, or too-large image |
| `413`  | Request image exceeds 10 MB                                         |
| `422`  | No face was detected                                                |
| `429`  | More than 20 analysis requests in one minute from the same IP       |
| `500`  | Analysis or unexpected server error                                 |

Accepted images must be between 50 and 4096 pixels in each dimension and no larger than 10 MB. Accepted formats are JPEG, PNG, WebP, GIF, and BMP.

## Security Notes

- Uploads are checked by MIME type, extension, magic bytes, Pillow verification, size, and dimensions.
- Analysis is limited to 20 requests per IP address per 60-second window.
- Responses include `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, and `Permissions-Policy` headers.
- DeepFace age, gender, and race results are estimates and should not be treated as definitive personal attributes.

## License

MIT
