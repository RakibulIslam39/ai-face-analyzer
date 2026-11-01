/* ── AI Face Analyzer — Frontend Logic (v2.0, fully in-browser) ── */

(function () {
  "use strict";

  // ── DOM refs ────────────────────────────────────────────────
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const cameraPlaceholder = document.getElementById("camera-placeholder");
  const placeholderIcon = document.getElementById("camera-placeholder-icon");
  const placeholderText = document.getElementById("camera-placeholder-text");
  const capturedOverlay = document.getElementById("captured-overlay");
  const capturedImg = document.getElementById("captured-img");
  const btnStartCamera = document.getElementById("btn-start-camera");
  const btnSwitchCamera = document.getElementById("btn-switch-camera");
  const btnCapture = document.getElementById("btn-capture");
  const btnRetake = document.getElementById("btn-retake");
  const btnAnalyze = document.getElementById("btn-analyze");
  const btnNewAnalysis = document.getElementById("btn-new-analysis");
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");
  const uploadPreview = document.getElementById("upload-preview");
  const previewImg = document.getElementById("preview-img");
  const previewInfo = document.getElementById("preview-info");
  const btnRemovePreview = document.getElementById("btn-remove-preview");
  const resultsSection = document.getElementById("results-section");
  const resultsContainer = document.getElementById("results-container");
  const loader = document.getElementById("loader");
  const toastContainer = document.getElementById("toast-container");
  const modelStatus = document.getElementById("model-status");
  const loaderText = document.querySelector(".loader__text");
  const loaderSubtext = document.querySelector(".loader__subtext");

  // ── State ───────────────────────────────────────────────────
  let cameraStream = null;
  let currentBlob = null;
  let facingMode = "user"; // "user" = front, "environment" = back
  let isAnalyzing = false;

  // ── Constants ───────────────────────────────────────────────
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MIN_DIMENSION = 50;
  const ALLOWED_TYPES = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
  ]);

  // ── Tabs ────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("tab--active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("tab--active");
      tab.setAttribute("aria-selected", "true");

      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("panel--active"));
      document.getElementById("panel-" + tab.dataset.tab).classList.add("panel--active");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  CAMERA — Permission handling, front/back toggle
  // ══════════════════════════════════════════════════════════════

  function setCameraPlaceholder(icon, text, cssClass) {
    placeholderIcon.textContent = icon;
    placeholderText.textContent = text;
    cameraPlaceholder.className = "camera-placeholder" + (cssClass ? " " + cssClass : "");
    cameraPlaceholder.style.display = "";
  }

  async function checkCameraPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return "prompt";
    try {
      const result = await navigator.permissions.query({ name: "camera" });
      return result.state; // "granted", "denied", "prompt"
    } catch {
      return "prompt";
    }
  }

  async function hasMultipleCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      return videoInputs.length > 1;
    } catch {
      return false;
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
      video.srcObject = null;
    }
  }

  /** True when this page sits in a frame whose host forbids camera use. No popup can appear then. */
  function cameraBlockedByPolicy() {
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (policy && typeof policy.allowsFeature === "function") {
      try {
        return !policy.allowsFeature("camera");
      } catch (_) {
        /* unknown: assume allowed and let getUserMedia decide */
      }
    }
    return false;
  }

  function isEmbedded() {
    try {
      return window.self !== window.top;
    } catch (_) {
      return true; // cross-origin top window
    }
  }

  async function describeDeniedCamera() {
    if ((await checkCameraPermission()) === "denied") {
      return "ক্যামেরা ব্লক করা আছে। অ্যাড্রেস বারের তালা/ক্যামেরা আইকনে ক্লিক করে ক্যামেরা “Allow” করুন, তারপর পেজ রিফ্রেশ করে আবার চেষ্টা করুন।";
    }
    let msg = "ক্যামেরার অনুমতি দেওয়া হয়নি। আবার চেষ্টা করুন এবং ব্রাউজারের পপআপে “Allow / অনুমতি দিন” চাপুন।";
    if (isEmbedded()) {
      msg += " পেজটি এমবেড করা উইন্ডোতে থাকলে আলাদা ব্রাউজার ট্যাবে খুলুন।";
    }
    return msg;
  }

  async function startCamera() {
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraPlaceholder("🚫", "আপনার ব্রাউজার ক্যামেরা সাপোর্ট করে না। অনুগ্রহ করে Chrome বা Firefox ব্যবহার করুন।", "error");
      btnStartCamera.disabled = true;
      return;
    }

    // Check HTTPS requirement
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setCameraPlaceholder("🔒", "ক্যামেরা ব্যবহার করতে HTTPS প্রয়োজন।", "error");
      btnStartCamera.disabled = true;
      return;
    }

    // Embedded in a page that does not allow the camera: the browser cannot show a popup at all.
    if (cameraBlockedByPolicy()) {
      const msg =
        "এই উইন্ডোতে (এমবেড করা প্রিভিউ) ক্যামেরা চালানোর অনুমতি নেই, তাই ব্রাউজার পারমিশন পপআপ দেখাতে পারছে না। পেজটি আলাদা ব্রাউজার ট্যাবে খুলুন, অথবা ‘আপলোড’ ট্যাবে ছবি বেছে নিন।";
      setCameraPlaceholder("🚫", msg, "error");
      showToast(msg, "warning", 10000);
      btnStartCamera.textContent = "আবার চেষ্টা করুন";
      btnStartCamera.disabled = false;
      return;
    }

    // Always ask the browser directly (do NOT pre-check the permission state):
    // getUserMedia is what makes the browser show its "Allow camera?" popup.
    setCameraPlaceholder("⏳", "ক্যামেরা চালু হচ্ছে… ব্রাউজার অনুমতি চাইলে “Allow / অনুমতি দিন” চাপুন।", "loading");
    btnStartCamera.disabled = true;

    try {
      stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      video.srcObject = cameraStream;
      cameraPlaceholder.style.display = "none";
      capturedOverlay.style.display = "none";
      btnCapture.disabled = false;
      btnRetake.style.display = "none";
      btnStartCamera.textContent = "ক্যামেরা চলছে";
      btnStartCamera.disabled = true;

      // Show switch button if multiple cameras
      if (await hasMultipleCameras()) {
        btnSwitchCamera.style.display = "";
      }
    } catch (err) {
      handleCameraError(err);
    }
  }

  function handleCameraError(err) {
    btnStartCamera.disabled = false;
    btnStartCamera.textContent = "আবার চেষ্টা করুন";

    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        describeDeniedCamera().then((msg) => {
          setCameraPlaceholder("🚫", msg, "error");
          showToast(msg, "warning", 10000);
        });
        break;

      case "NotFoundError":
      case "DevicesNotFoundError":
        setCameraPlaceholder(
          "📷",
          "কোনো ক্যামেরা পাওয়া যায়নি। ক্যামেরাযুক্ত ডিভাইস ব্যবহার করুন।",
          "error"
        );
        showToast("এই ডিভাইসে কোনো ক্যামেরা নেই।", "error");
        break;

      case "NotReadableError":
      case "TrackStartError":
        setCameraPlaceholder(
          "⚠️",
          "ক্যামেরা অন্য কোনো অ্যাপ ব্যবহার করছে। অন্য অ্যাপ বন্ধ করে আবার চেষ্টা করুন।",
          "error"
        );
        showToast("ক্যামেরা ব্যস্ত — অন্য অ্যাপ বন্ধ করুন।", "error");
        break;

      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        setCameraPlaceholder("⚠️", "ক্যামেরা কনফিগারেশন সমস্যা।", "error");
        break;

      case "AbortError":
        setCameraPlaceholder("⚠️", "ক্যামেরা সংযোগ বিচ্ছিন্ন হয়েছে।", "error");
        break;

      default:
        setCameraPlaceholder(
          "❌",
          "ক্যামেরা চালু করতে সমস্যা হয়েছে: " + (err.message || err.name),
          "error"
        );
        showToast("ক্যামেরা ত্রুটি: " + (err.message || err.name), "error");
    }
  }

  btnStartCamera.addEventListener("click", startCamera);

  btnSwitchCamera.addEventListener("click", async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    await startCamera();
  });

  btnCapture.addEventListener("click", () => {
    if (!cameraStream) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast("ছবি ক্যাপচার করতে ব্যর্থ হয়েছে।", "error");
          return;
        }

        currentBlob = blob;

        // Show captured preview
        capturedImg.src = canvas.toDataURL("image/jpeg", 0.92);
        capturedOverlay.style.display = "";
        video.style.opacity = "0.3";

        btnAnalyze.disabled = false;
        btnCapture.disabled = true;
        btnRetake.style.display = "";

        showToast("ছবি ক্যাপচার হয়েছে! এখন “বিশ্লেষণ করুন” ক্লিক করুন।", "success");
      },
      "image/jpeg",
      0.92
    );
  });

  btnRetake.addEventListener("click", () => {
    currentBlob = null;
    capturedOverlay.style.display = "none";
    video.style.opacity = "1";
    btnCapture.disabled = false;
    btnRetake.style.display = "none";
    btnAnalyze.disabled = true;
  });

  // ══════════════════════════════════════════════════════════════
  //  UPLOAD — File, gallery, camera-file, drag-and-drop
  // ══════════════════════════════════════════════════════════════

  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  // Prevent browser default drop behavior
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  btnRemovePreview.addEventListener("click", resetUpload);

  function resetUpload() {
    currentBlob = null;
    uploadPreview.style.display = "none";
    dropZone.style.display = "";
    btnAnalyze.disabled = true;
    fileInput.value = "";
    previewInfo.textContent = "";
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    const file = files[0];

    // Validate MIME type
    if (!file.type) {
      showToast("ফাইলের টাইপ শনাক্ত করা যায়নি। অনুগ্রহ করে JPG, PNG, বা WebP ফাইল ব্যবহার করুন।", "error");
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      showToast(`এই ফাইল ফরম্যাট (${file.type}) সাপোর্টেড নয়। শুধুমাত্র JPG, PNG, WebP, GIF, BMP গ্রহণযোগ্য।`, "error", 6000);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      showToast(`ফাইলের আকার ${sizeMB} MB, সর্বোচ্চ ১০ MB হতে পারে।`, "error");
      return;
    }

    if (file.size === 0) {
      showToast("ফাইলটি খালি।", "error");
      return;
    }

    // Validate image dimensions
    const reader = new FileReader();
    reader.onerror = () => {
      showToast("ফাইলটি পড়তে সমস্যা হয়েছে।", "error");
    };
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => {
        showToast("ফাইলটি একটি বৈধ ইমেজ নয়।", "error");
      };
      img.onload = () => {
        // Check minimum dimensions
        if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
          showToast(`ইমেজটি খুব ছোট (${img.width}x${img.height}px)। সর্বনিম্ন ${MIN_DIMENSION}x${MIN_DIMENSION}px হতে হবে।`, "error", 6000);
          return;
        }

        currentBlob = file;
        previewImg.src = ev.target.result;

        // Show file info
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        previewInfo.textContent = `${img.width}x${img.height}px · ${sizeMB} MB · ${file.type.split("/")[1].toUpperCase()}`;

        uploadPreview.style.display = "";
        dropZone.style.display = "none";
        btnAnalyze.disabled = false;

        showToast("ছবি লোড হয়েছে! এখন “বিশ্লেষণ করুন” ক্লিক করুন।", "success");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ══════════════════════════════════════════════════════════════
  //  ANALYSIS — runs entirely on this device (face-api.js / TF.js)
  // ══════════════════════════════════════════════════════════════

  const MAX_ANALYSIS_SIDE = 1280; // bigger photos are downscaled: faster, same accuracy
  const THUMB_MAX_SIDE = 720;

  let engine = null;
  let modelsPromise = null;
  let modelsReady = false;

  function setModelStatus(text, cls) {
    modelStatus.textContent = text;
    modelStatus.className = "model-status" + (cls ? " " + cls : "");
  }

  function setLoader(visible, text, sub) {
    loader.style.display = visible ? "flex" : "none";
    if (text) loaderText.textContent = text;
    if (sub) loaderSubtext.textContent = sub;
  }

  function onModelProgress(p) {
    setModelStatus(`AI মডেল লোড হচ্ছে… ${p.label} (${p.done}/${p.total})`);
  }

  function modelBaseUrl() {
    try {
      return new URL("models", document.baseURI).href;
    } catch (_) {
      return "models"; // e.g. sandboxed frames with an opaque base URL
    }
  }

  /** Start (or retry) loading the AI models. Safe to call repeatedly. */
  function ensureModels() {
    if (modelsPromise) return modelsPromise;

    if (!window.faceapi || !window.FaceEngine) {
      setModelStatus("AI লাইব্রেরি লোড হয়নি। পেজ রিফ্রেশ করুন।", "error");
      return Promise.reject(new Error("face-api not loaded"));
    }

    if (!engine) {
      engine = window.FaceEngine.createEngine({
        faceapi: window.faceapi,
        modelUrl: modelBaseUrl(),
        makeWarmupInput: () => {
          const c = document.createElement("canvas");
          c.width = c.height = 128;
          return c;
        },
      });
    }

    modelsPromise = engine
      .load(onModelProgress)
      .then(() => {
        modelsReady = true;
        setModelStatus("✅ AI প্রস্তুত — বিশ্লেষণ আপনার ডিভাইসেই হবে (" + engine.backend + ")", "ready");
      })
      .catch((err) => {
        modelsPromise = null; // allow retry on the next click
        setModelStatus("AI মডেল লোড করা যায়নি — আবার চেষ্টা করতে “বিশ্লেষণ করুন” চাপুন।", "error");
        throw err;
      });
    return modelsPromise;
  }

  // Start downloading models right away so they're ready by the time a photo is chosen.
  ensureModels().catch(() => {});

  btnAnalyze.addEventListener("click", runAnalysis);

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(blob);
    });
  }

  /** Decode a Blob into a drawable image + its natural size. Respects EXIF orientation. */
  async function decodeBlob(blob) {
    if (window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return { source: bmp, width: bmp.width, height: bmp.height };
      } catch (_) {
        /* fall through to the <img> path (older browsers, odd formats) */
      }
    }
    const img = new Image();
    img.src = await blobToDataUrl(blob); // data: URL, not blob:, so no CSP dependency
    await img.decode(); // rejects (EncodingError) on a corrupt image
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  }

  /** Decode a Blob into a (possibly downscaled) canvas. */
  async function blobToCanvas(blob, maxSide) {
    const { source, width: w0, height: h0 } = await decodeBlob(blob);
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * scale));
    c.height = Math.max(1, Math.round(h0 * scale));
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    if (source.close) source.close();
    return c;
  }

  /** Draw numbered face boxes on a downscaled copy of the analysed image. */
  function makeAnnotatedThumbnail(source, faces) {
    const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(source.width, source.height));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(source.width * scale));
    out.height = Math.max(1, Math.round(source.height * scale));
    const ctx = out.getContext("2d");
    ctx.drawImage(source, 0, 0, out.width, out.height);

    const line = Math.max(2, Math.round(out.width / 220));
    const radius = Math.min(18, Math.max(11, Math.round(out.width / 45)));
    ctx.lineWidth = line;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(radius * 1.1)}px system-ui, sans-serif`;

    faces.forEach((face, idx) => {
      const r = face.face_region;
      const x = r.x * scale;
      const y = r.y * scale;
      ctx.strokeStyle = "#00cec9";
      ctx.strokeRect(x, y, r.w * scale, r.h * scale);

      // Number badge on the box's top-left corner, kept inside the canvas.
      const bx = Math.min(out.width - radius, Math.max(radius, x));
      const by = Math.min(out.height - radius, Math.max(radius, y));
      ctx.fillStyle = "#6c5ce7";
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(String(idx + 1), bx, by + 1);
    });

    return out.toDataURL("image/jpeg", 0.85);
  }

  async function runAnalysis() {
    if (!currentBlob || isAnalyzing) return;
    isAnalyzing = true;
    resultsSection.style.display = "none";
    btnAnalyze.disabled = true;
    setLoader(
      true,
      modelsReady ? "AI বিশ্লেষণ চলছে…" : "AI মডেল লোড হচ্ছে…",
      "সবকিছু আপনার ডিভাইসেই হচ্ছে — ছবি কোথাও পাঠানো হচ্ছে না"
    );

    try {
      await ensureModels();
      setLoader(true, "AI বিশ্লেষণ চলছে…");

      const analysisCanvas = await blobToCanvas(currentBlob, MAX_ANALYSIS_SIDE);
      const data = await engine.analyze(analysisCanvas);

      if (!data.success) {
        showToast(
          "কোনো মুখ শনাক্ত করা যায়নি। অনুগ্রহ করে একটি পরিষ্কার মুখের ছবি দিন যেখানে মুখ স্পষ্টভাবে দেখা যায়।",
          "warning",
          7000
        );
        return;
      }

      data.image_size = { width: analysisCanvas.width, height: analysisCanvas.height };
      data.thumbnail = makeAnnotatedThumbnail(analysisCanvas, data.faces);

      renderResults(data);
      showToast(`${data.face_count}টি মুখ সফলভাবে বিশ্লেষণ করা হয়েছে!`, "success");
    } catch (err) {
      console.error("Analysis failed:", err);
      showToast(describeError(err), "error", 7000);
    } finally {
      setLoader(false);
      isAnalyzing = false;
      if (currentBlob) btnAnalyze.disabled = false;
    }
  }

  function describeError(err) {
    const msg = String((err && err.message) || err || "");
    if (err && err.name === "EncodingError") return "ছবিটি পড়া যাচ্ছে না — ফাইলটি ক্ষতিগ্রস্ত হতে পারে।";
    if (/backend/i.test(msg)) return "আপনার ব্রাউজার/ডিভাইসে AI চালানো সম্ভব হচ্ছে না। অন্য ব্রাউজার (Chrome) চেষ্টা করুন।";
    if (/fetch|network|load/i.test(msg)) return "AI মডেল লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।";
    return "বিশ্লেষণে সমস্যা হয়েছে। অন্য একটি ছবি দিয়ে আবার চেষ্টা করুন।";
  }

  // ── New Analysis ────────────────────────────────────────────
  btnNewAnalysis.addEventListener("click", () => {
    resultsSection.style.display = "none";
    currentBlob = null;
    btnAnalyze.disabled = true;

    // Reset camera panel
    capturedOverlay.style.display = "none";
    video.style.opacity = "1";
    btnRetake.style.display = "none";
    if (cameraStream) btnCapture.disabled = false;

    // Reset upload panel
    resetUpload();

    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ══════════════════════════════════════════════════════════════
  //  RENDER RESULTS
  // ══════════════════════════════════════════════════════════════

  function renderResults(data) {
    resultsContainer.innerHTML = "";

    if (data.thumbnail) {
      resultsContainer.innerHTML += `
        <div class="result-thumbnail">
          <img src="${escapeHtml(data.thumbnail)}" alt="analyzed photo" />
        </div>`;
    }

    data.faces.forEach((face, idx) => {
      const el = document.createElement("div");
      el.className = "face-result";
      el.innerHTML = `
        <div class="face-result__header">
          <div class="face-result__number">${idx + 1}</div>
          <div class="face-result__title">মুখ #${idx + 1} — বিশ্লেষণ</div>
        </div>

        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-box__label">বয়স (আনুমানিক)</div>
            <div class="stat-box__value">${escapeHtml(String(face.age))} বছর</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">ইমোশন</div>
            <div class="stat-box__value">${escapeHtml(face.emotion.dominant_bn)}</div>
            <div class="stat-box__sub">${escapeHtml(face.emotion.dominant)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">জেন্ডার</div>
            <div class="stat-box__value">${escapeHtml(face.gender.dominant_bn)}</div>
            <div class="stat-box__sub">${escapeHtml(face.gender.dominant)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">মুখ শনাক্তকরণ</div>
            <div class="stat-box__value">${escapeHtml(String(Math.round(face.detection_score * 100)))}%</div>
            <div class="stat-box__sub">ডিটেকশন নিশ্চয়তা</div>
          </div>
        </div>

        ${buildBars("ইমোশন কনফিডেন্স", face.emotion.scores, "emotion")}
        ${buildBars("জেন্ডার কনফিডেন্স", face.gender.scores, "gender")}
      `;
      resultsContainer.appendChild(el);
    });

    resultsSection.style.display = "";
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildBars(title, scores, cls) {
    if (!scores || !Object.keys(scores).length) return "";
    const rows = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) => `
        <div class="bar-row">
          <span class="bar-row__label">${escapeHtml(k)}</span>
          <div class="bar-row__track"><div class="bar-row__fill ${cls}" style="width:${Math.min(v, 100)}%"></div></div>
          <span class="bar-row__pct">${Number(v).toFixed(1)}%</span>
        </div>`
      )
      .join("");
    return `<div class="confidence-section"><h4>${escapeHtml(title)}</h4>${rows}</div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  TOAST NOTIFICATION SYSTEM
  // ══════════════════════════════════════════════════════════════

  function showToast(msg, type, duration) {
    type = type || "error";
    duration = duration || 4000;

    const toast = document.createElement("div");
    toast.className = "toast toast--" + type;
    toast.textContent = msg;

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "toast__close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => removeToast(toast));
    toast.appendChild(closeBtn);

    toastContainer.appendChild(toast);

    // Auto-remove
    const timer = setTimeout(() => removeToast(toast), duration);
    toast._timer = timer;

    // Limit visible toasts
    const toasts = toastContainer.querySelectorAll(".toast");
    if (toasts.length > 3) {
      removeToast(toasts[0]);
    }
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    clearTimeout(toast._timer);
    toast.classList.add("toast--exit");
    setTimeout(() => toast.remove(), 300);
  }

  // ── Security: HTML escaping ─────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

})();
