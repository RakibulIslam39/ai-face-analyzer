/* ── AI Face Analyzer — Frontend Logic ──────────────────────── */

(function () {
  "use strict";

  // DOM refs
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const cameraPlaceholder = document.getElementById("camera-placeholder");
  const btnStartCamera = document.getElementById("btn-start-camera");
  const btnCapture = document.getElementById("btn-capture");
  const btnAnalyze = document.getElementById("btn-analyze");
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");
  const uploadPreview = document.getElementById("upload-preview");
  const previewImg = document.getElementById("preview-img");
  const btnRemovePreview = document.getElementById("btn-remove-preview");
  const resultsSection = document.getElementById("results-section");
  const resultsContainer = document.getElementById("results-container");
  const loader = document.getElementById("loader");
  const toast = document.getElementById("toast");

  let cameraStream = null;
  let currentBlob = null; // the image blob ready for analysis

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

  // ── Camera ──────────────────────────────────────────────────
  btnStartCamera.addEventListener("click", async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      video.srcObject = cameraStream;
      cameraPlaceholder.style.display = "none";
      btnCapture.disabled = false;
      btnStartCamera.textContent = "ক্যামেরা চলছে…";
      btnStartCamera.disabled = true;
    } catch (err) {
      showToast("ক্যামেরা অ্যাক্সেস করা যায়নি: " + err.message);
    }
  });

  btnCapture.addEventListener("click", () => {
    if (!cameraStream) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        currentBlob = blob;
        btnAnalyze.disabled = false;
        showToast("ছবি ক্যাপচার হয়েছে! এখন 'বিশ্লেষণ করুন' ক্লিক করুন।", "success");
      },
      "image/jpeg",
      0.92
    );
  });

  // ── Upload ──────────────────────────────────────────────────
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  btnRemovePreview.addEventListener("click", () => {
    currentBlob = null;
    uploadPreview.style.display = "none";
    dropZone.style.display = "";
    btnAnalyze.disabled = true;
    fileInput.value = "";
  });

  function handleFiles(files) {
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      showToast("শুধুমাত্র ইমেজ ফাইল গ্রহণযোগ্য।");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("ফাইলের আকার ১০ MB-র বেশি হতে পারবে না।");
      return;
    }
    currentBlob = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.src = ev.target.result;
      uploadPreview.style.display = "";
      dropZone.style.display = "none";
      btnAnalyze.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  // ── Analysis ────────────────────────────────────────────────
  btnAnalyze.addEventListener("click", async () => {
    if (!currentBlob) return;
    loader.style.display = "flex";
    resultsSection.style.display = "none";

    const formData = new FormData();
    formData.append("file", currentBlob, "capture.jpg");

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.detail || "বিশ্লেষণ ব্যর্থ হয়েছে।");
        return;
      }

      renderResults(data);
    } catch (err) {
      showToast("সার্ভারে সংযোগ করা যায়নি: " + err.message);
    } finally {
      loader.style.display = "none";
    }
  });

  // ── Render Results ──────────────────────────────────────────
  function renderResults(data) {
    resultsContainer.innerHTML = "";

    if (data.thumbnail) {
      resultsContainer.innerHTML += `
        <div class="result-thumbnail">
          <img src="${data.thumbnail}" alt="analyzed photo" />
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
            <div class="stat-box__value">${face.age} বছর</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">ইমোশন</div>
            <div class="stat-box__value">${face.emotion.dominant_bn}</div>
            <div class="stat-box__sub">${face.emotion.dominant}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">জেন্ডার</div>
            <div class="stat-box__value">${face.gender.dominant_bn}</div>
            <div class="stat-box__sub">${face.gender.dominant}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">এথনিসিটি</div>
            <div class="stat-box__value">${face.ethnicity.dominant_bn}</div>
            <div class="stat-box__sub">${face.ethnicity.dominant}</div>
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
          <span class="bar-row__label">${k}</span>
          <div class="bar-row__track"><div class="bar-row__fill ${cls}" style="width:${v}%"></div></div>
          <span class="bar-row__pct">${v.toFixed(1)}%</span>
        </div>`
      )
      .join("");
    return `<div class="confidence-section"><h4>${title}</h4>${rows}</div>`;
  }

  // ── Toast ───────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.background = type === "success" ? "var(--success)" : "var(--danger)";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.style.display = "none"), 4000);
  }
})();
