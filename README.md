# 🧠 AI Face Analyzer — মুখ বিশ্লেষক

ক্যামেরা বা ছবি আপলোড থেকে AI ব্যবহার করে মুখ বিশ্লেষণ করুন।

## Features / ফিচার সমূহ

- **বয়স অনুমান** — ছবি থেকে আনুমানিক বয়স বের করে
- **ইমোশন ডিটেকশন** — খুশি, রাগ, দুঃখ, অবাক সহ ৭ ধরনের ইমোশন শনাক্ত করে
- **জেন্ডার ডিটেকশন** — পুরুষ/নারী শনাক্ত করে
- **এথনিসিটি অনুমান** — এশিয়ান, ভারতীয়, আফ্রিকান, ইউরোপীয় ইত্যাদি অনুমান করে
- **মাল্টিপল ফেস** — একটি ছবিতে একাধিক মুখ শনাক্ত ও বিশ্লেষণ করতে পারে
- **বাংলা ইন্টারফেস** — সম্পূর্ণ বাংলায় ফলাফল প্রদর্শন
- **লাইভ ক্যামেরা** — ব্রাউজারে সরাসরি ক্যামেরা থেকে ছবি তোলা যায়
- **ড্র্যাগ & ড্রপ** — ছবি ড্র্যাগ করে আপলোড করা যায়

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend   | Python, FastAPI |
| AI/ML     | DeepFace, TensorFlow/Keras |
| Frontend  | Vanilla HTML/CSS/JS |
| Detection | OpenCV (face detection) |

## Quick Start / দ্রুত শুরু

```bash
# 1. Clone the repo
git clone https://github.com/RakibulIslam39/ai-face-analyzer.git
cd ai-face-analyzer

# 2. Install dependencies
pip install -e .

# 3. Run the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. Open browser
# http://localhost:8000
```

## API

### `POST /api/analyze`

Upload an image file to analyze faces.

**Request:** `multipart/form-data` with a `file` field.

**Response:**
```json
{
  "success": true,
  "face_count": 1,
  "faces": [
    {
      "age": 25,
      "emotion": {
        "dominant": "happy",
        "dominant_bn": "খুশি 😊",
        "scores": { "happy": 95.2, "neutral": 3.1, ... }
      },
      "gender": {
        "dominant": "Man",
        "dominant_bn": "পুরুষ 👨",
        "scores": { "Man": 98.5, "Woman": 1.5 }
      },
      "ethnicity": {
        "dominant": "asian",
        "dominant_bn": "এশিয়ান",
        "scores": { "asian": 85.3, ... }
      },
      "face_region": { "x": 120, "y": 80, "w": 200, "h": 200 }
    }
  ],
  "thumbnail": "data:image/jpeg;base64,..."
}
```

### `GET /health`

Health check endpoint.

## Project Structure

```
ai-face-analyzer/
├── app/
│   ├── __init__.py
│   └── main.py          # FastAPI application
├── static/
│   ├── style.css        # Dark-themed UI styles
│   └── app.js           # Frontend logic (camera, upload, results)
├── templates/
│   └── index.html       # Single-page app
├── pyproject.toml       # Project config & dependencies
└── README.md
```

## License

MIT
