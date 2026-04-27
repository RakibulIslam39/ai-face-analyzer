# 🧠 AI Face Analyzer — মুখ বিশ্লেষক

ক্যামেরা বা ছবি আপলোড থেকে AI ব্যবহার করে মুখ বিশ্লেষণ করুন। এই অ্যাপটি **DeepFace** ও **FastAPI** দিয়ে তৈরি এবং **Vercel**-এ ডিপ্লয় করা যায়।

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features / ফিচার সমূহ

- **বয়স অনুমান** — ছবি থেকে আনুমানিক বয়স বের করে
- **ইমোশন ডিটেকশন** — খুশি, রাগ, দুঃখ, অবাক সহ ৭ ধরনের ইমোশন শনাক্ত করে
- **জেন্ডার ডিটেকশন** — পুরুষ/নারী শনাক্ত করে
- **এথনিসিটি অনুমান** — এশিয়ান, ভারতীয়, আফ্রিকান, ইউরোপীয় ইত্যাদি অনুমান করে
- **মাল্টিপল ফেস** — একটি ছবিতে একাধিক মুখ শনাক্ত ও বিশ্লেষণ করতে পারে
- **বাংলা ইন্টারফেস** — সম্পূর্ণ বাংলায় ফলাফল প্রদর্শন
- **লাইভ ক্যামেরা** — ব্রাউজারে সরাসরি ক্যামেরা থেকে ছবি তোলা যায় (ফ্রন্ট/ব্যাক সুইচ)
- **ড্র্যাগ & ড্রপ** — ছবি ড্র্যাগ করে আপলোড করা যায়
- **মোবাইল গ্যালারি/ক্যামেরা এক্সেস** — মোবাইলে অ্যালবাম/গুগল ফটোস থেকে ছবি নেওয়া
- **ভ্যালিডেশন** — ফাইল টাইপ, সাইজ (10MB), ডাইমেনশন (50-4096px), magic bytes চেক
- **সিকিউরিটি** — Rate limiting, security headers, input sanitization
- **এরর হ্যান্ডলিং** — সব এরর বাংলায় Toast notification দিয়ে দেখানো হয়

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| Backend   | Python 3.10+, FastAPI |
| AI/ML     | DeepFace, TensorFlow/Keras |
| Frontend  | Vanilla HTML/CSS/JS |
| Detection | OpenCV (face detection) |
| Deploy    | Vercel (Python Serverless) |
| Testing   | pytest, Locust (load testing) |

## 📁 Project Structure

```
ai-face-analyzer/
├── index.py              # FastAPI app (Vercel entrypoint)
├── public/
│   ├── index.html        # Single-page frontend
│   ├── style.css         # Dark-themed UI styles
│   └── app.js            # Frontend logic (camera, upload, results)
├── app/
│   ├── __init__.py
│   └── main.py           # Legacy local-dev entrypoint
├── templates/
│   └── index.html        # Legacy HTML (local dev)
├── static/
│   ├── style.css         # Legacy static (local dev)
│   └── app.js
├── tests/
│   ├── conftest.py       # Test fixtures
│   ├── test_api.py       # 19 unit/integration tests
│   └── locustfile.py     # Load testing config
├── vercel.json           # Vercel deployment config
├── requirements.txt      # Python dependencies (Vercel)
├── pyproject.toml        # Project config & dev dependencies
├── Dockerfile            # Docker deployment alternative
└── README.md
```

## 🚀 Deploy to Vercel / ভার্সেলে ডিপ্লয়

### এক-ক্লিক ডিপ্লয়

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/RakibulIslam39/ai-face-analyzer)

### ম্যানুয়াল ডিপ্লয়

1. [Vercel](https://vercel.com)-এ লগইন করুন
2. **"Add New Project"** ক্লিক করুন
3. GitHub থেকে `ai-face-analyzer` রিপো ইম্পোর্ট করুন
4. Framework Preset: **Other** সিলেক্ট করুন
5. **Deploy** ক্লিক করুন — Vercel স্বয়ংক্রিয়ভাবে `index.py` থেকে FastAPI অ্যাপ ডিটেক্ট করবে

### Vercel CLI দিয়ে

```bash
# Vercel CLI ইনস্টল
npm i -g vercel

# ডিপ্লয়
vercel

# প্রোডাকশন ডিপ্লয়
vercel --prod
```

> **⚠️ গুরুত্বপূর্ণ:** TensorFlow + DeepFace এর সাইজ বড় (~500MB+)। Vercel-এর Pro/Enterprise প্ল্যানে Serverless Function সাইজ লিমিট বেশি (250MB compressed)। ফ্রি টিয়ারে কাজ না করলে Vercel Pro তে আপগ্রেড করুন অথবা নিচের Docker/Railway অপশন ব্যবহার করুন।

## 💻 Local Development / লোকাল ডেভেলপমেন্ট

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

### Vercel Dev দিয়ে লোকালি রান

```bash
pip install -r requirements.txt
vercel dev
```

## 🐳 Docker দিয়ে রান

```bash
docker build -t ai-face-analyzer .
docker run -p 8000:8000 ai-face-analyzer
```

## 🧪 Testing / টেস্টিং

### Unit & Integration Tests (pytest)

```bash
# Install test dependencies
pip install -e ".[test]"

# Run tests
pytest -v

# 19 tests — validation, security, API responses, rate limiting
```

### Load Testing (Locust)

```bash
# Start the server first, then:
locust -f tests/locustfile.py --host http://localhost:8000 --headless -u 10 -r 2 --run-time 30s
```

## 📡 API Reference

### `POST /api/analyze`

Upload an image file to analyze faces.

**Request:** `multipart/form-data` with a `file` field.

**Success Response (200):**
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
        "scores": { "happy": 95.2, "neutral": 3.1 }
      },
      "gender": {
        "dominant": "Man",
        "dominant_bn": "পুরুষ 👨",
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

**Error Responses:**

| Status | Reason | Bengali Message |
|--------|--------|----------------|
| 400 | Invalid file type/format | এই ফাইল ফরম্যাট সাপোর্টেড নয় |
| 400 | Empty file | ফাইলটি খালি |
| 400 | Image too small | ইমেজটি খুব ছোট |
| 413 | File too large (>10MB) | ফাইলের আকার ১০ MB-র বেশি হতে পারবে না |
| 422 | No face detected | কোনো মুখ শনাক্ত করা যায়নি |
| 429 | Rate limited | অনেক বেশি রিকোয়েস্ট পাঠানো হয়েছে |
| 500 | Server error | সার্ভারে একটি অপ্রত্যাশিত সমস্যা হয়েছে |

### `GET /api/health`

Health check endpoint. Returns `{"status": "ok", "version": "1.1.0"}`

## 🔒 Security Features

- **Rate Limiting** — 20 requests/minute per IP
- **File Validation** — MIME type, magic bytes, file extension, PIL verify
- **Image Dimension Check** — Min 50x50px, max 4096x4096px
- **Size Limit** — Maximum 10 MB per file
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- **Input Sanitization** — HTML escaping, XSS prevention
- **Global Exception Handler** — Catches and safely returns unhandled errors

## 📄 License

MIT
