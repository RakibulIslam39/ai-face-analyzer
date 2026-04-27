/* ── AI Face Analyzer — Frontend Logic (v1.1) ──────────────── */

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
  const cameraFileInput = document.getElementById("camera-file-input");
  const dropZone = document.getElementById("drop-zone");
  const uploadPreview = document.getElementById("upload-preview");
  const previewImg = document.getElementById("preview-img");
  const previewInfo = document.getElementById("preview-info");
  const btnRemovePreview = document.getElementById("btn-remove-preview");
  const resultsSection = document.getElementById("results-section");
  const resultsContainer = document.getElementById("results-container");
  const loader = document.getElementById("loader");
  const toastContainer = document.getElementById("toast-container");

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

    // Show loading state
    setCameraPlaceholder("⏳", "ক্যামেরা চালু হচ্ছে…", "loading");
    btnStartCamera.disabled = true;

    // Check existing permission state
    const permState = await checkCameraPermission();
    if (permState === "denied") {
      setCameraPlaceholder(
        "🚫",
        "ক্যামেরা অ্যাক্সেস ব্লক করা হয়েছে। ব্রাউজারের সেটিংস থেকে ক্যামেরা পারমিশন চালু করুন।",
        "error"
      );
      btnStartCamera.textContent = "পারমিশন ব্লকড";
      return;
    }

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
        setCameraPlaceholder(
          "🚫",
          "ক্যামেরা অ্যাক্সেসের অনুমতি দেওয়া হয়নি। পারমিশন দিয়ে আবার চেষ্টা করুন।",
          "error"
        );
        showToast("ক্যামেরা পারমিশন প্রয়োজন। ব্রাউজারের অ্যাড্রেস বারে ক্যামেরা আইকনে ক্লিক করে পারমিশন দিন।", "warning", 8000);
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
        const url = URL.createObjectURL(blob);
        capturedImg.src = url;
        capturedOverlay.style.display = "";
        video.style.opacity = "0.3";

        btnAnalyze.disabled = false;
        btnCapture.disabled = true;
        btnRetake.style.display = "";

        showToast("ছবি ক্যাপচার হয়েছে! এখন 'বিশ্লেষণ করুন' ক্লিক করুন।", "success");
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
  cameraFileInput.addEventListener("change", (e) => handleFiles(e.target.files));

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
    cameraFileInput.value = "";
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

        showToast("ছবি লোড হয়েছে! এখন 'বিশ্লেষণ করুন' ক্লিক করুন।", "success");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ══════════════════════════════════════════════════════════════
  //  ANALYSIS
  // ══════════════════════════════════════════════════════════════

  btnAnalyze.addEventListener("click", runAnalysis);

  async function runAnalysis() {
    if (!currentBlob || isAnalyzing) return;
    isAnalyzing = true;
    loader.style.display = "flex";
    resultsSection.style.display = "none";
    btnAnalyze.disabled = true;

    const formData = new FormData();
    formData.append("file", currentBlob, "capture.jpg");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await res.json();
      } catch {
        showToast("সার্ভার থেকে অবৈধ রেসপন্স এসেছে।", "error");
        return;
      }

      if (!res.ok) {
        handleApiError(res.status, data);
        return;
      }

      if (!data.success || !data.faces || data.faces.length === 0) {
        showToast("কোনো মুখ শনাক্ত করা যায়নি।", "error");
        return;
      }

      renderResults(data);
      showToast(`${data.face_count}টি মুখ সফলভাবে বিশ্লেষণ করা হয়েছে!`, "success");
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        showToast("রিকোয়েস্ট টাইমআউট হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।", "error", 6000);
      } else if (!navigator.onLine) {
        showToast("ইন্টারনেট সংযোগ নেই। সংযোগ পুনঃস্থাপন করে আবার চেষ্টা করুন।", "error", 6000);
      } else {
        showToast("সার্ভারে সংযোগ করা যায়নি: " + err.message, "error");
      }
    } finally {
      loader.style.display = "none";
      isAnalyzing = false;
      if (currentBlob) btnAnalyze.disabled = false;
    }
  }

  function handleApiError(status, data) {
    const detail = data.detail || "";
    switch (status) {
      case 400:
        showToast(detail || "অবৈধ ইমেজ ফাইল।", "error", 6000);
        break;
      case 413:
        showToast(detail || "ফাইলের আকার খুব বেশি।", "error");
        break;
      case 422:
        showToast(detail || "কোনো মুখ শনাক্ত করা যায়নি।", "warning", 6000);
        break;
      case 429:
        showToast(detail || "অনেক বেশি রিকোয়েস্ট। কিছুক্ষণ পরে চেষ্টা করুন।", "warning", 8000);
        break;
      case 500:
        showToast(detail || "সার্ভারে সমস্যা হয়েছে।", "error");
        break;
      default:
        showToast(detail || `ত্রুটি (${status})`, "error");
    }
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
            <div class="stat-box__label">এথনিসিটি</div>
            <div class="stat-box__value">${escapeHtml(face.ethnicity.dominant_bn)}</div>
            <div class="stat-box__sub">${escapeHtml(face.ethnicity.dominant)}</div>
          </div>
        </div>

        ${buildBars("ইমোশন কনফিডেন্স", face.emotion.scores, "emotion")}
        ${buildBars("জেন্ডার কনফিডেন্স", face.gender.scores, "gender")}
        ${buildBars("এথনিসিটি কনফিডেন্স", face.ethnicity.scores, "race")}
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

  // ── Online/offline handling ─────────────────────────────────
  window.addEventListener("offline", () => {
    showToast("ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়েছে।", "warning", 10000);
  });
  window.addEventListener("online", () => {
    showToast("ইন্টারনেট সংযোগ পুনঃস্থাপিত হয়েছে!", "success");
  });
})();
