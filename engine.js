/* ── AI Face Analyzer — in-browser analysis engine ─────────────
 *
 * Wraps face-api.js (TensorFlow.js) so that all analysis happens on the
 * user's device. Nothing is uploaded anywhere.
 *
 * Output shape intentionally mirrors the old server API so the UI code
 * (renderResults) did not need to change much:
 *   { success, face_count, faces: [{ age, emotion, gender, face_region, detection_score }] }
 *
 * UMD: works as a classic script tag (window.FaceEngine) and as a CommonJS module
 * (used by the Node unit tests).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FaceEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── Label maps ──────────────────────────────────────────────
  // face-api names -> the names the UI/history already uses.
  const EMOTION_KEY_MAP = {
    neutral: "neutral",
    happy: "happy",
    sad: "sad",
    angry: "angry",
    fearful: "fear",
    disgusted: "disgust",
    surprised: "surprise",
  };

  const EMOTION_LABELS_BN = {
    angry: "রাগান্বিত 😠",
    disgust: "বিতৃষ্ণা 🤢",
    fear: "ভয় 😨",
    happy: "খুশি 😊",
    sad: "দুঃখিত 😢",
    surprise: "অবাক 😲",
    neutral: "নিরপেক্ষ 😐",
  };

  const GENDER_LABELS_BN = {
    Man: "পুরুষ 👨",
    Woman: "নারী 👩",
  };

  // ── Pure helpers (unit-tested in Node) ──────────────────────

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** face-api expressions (0..1, face-api key names) -> percent scores with UI key names. */
  function emotionScores(expressions) {
    const scores = {};
    for (const [apiKey, uiKey] of Object.entries(EMOTION_KEY_MAP)) {
      const v = expressions && Number(expressions[apiKey]);
      scores[uiKey] = round2((Number.isFinite(v) ? v : 0) * 100);
    }
    return scores;
  }

  /** Key with the highest score (first one wins ties, in insertion order). */
  function dominantKey(scores) {
    let best = null;
    for (const [k, v] of Object.entries(scores)) {
      if (best === null || v > scores[best]) best = k;
    }
    return best;
  }

  /** face-api gives the predicted gender + its probability; derive both scores. */
  function genderScores(gender, probability) {
    const p = Math.min(1, Math.max(0, Number(probability)));
    const pct = round2((Number.isFinite(p) ? p : 0.5) * 100);
    const other = round2(100 - pct);
    return gender === "male"
      ? { Man: pct, Woman: other }
      : { Man: other, Woman: pct };
  }

  /**
   * Convert one face-api result
   *   { detection: { box, score }, expressions, age, gender, genderProbability }
   * into the UI's face object.
   */
  function formatFace(result) {
    const emotion = emotionScores(result.expressions);
    const emotionTop = dominantKey(emotion);

    const gender = genderScores(result.gender, result.genderProbability);
    const genderTop = dominantKey(gender);

    const box = (result.detection && result.detection.box) || {};
    return {
      age: Math.round(result.age),
      emotion: {
        dominant: emotionTop,
        dominant_bn: EMOTION_LABELS_BN[emotionTop] || emotionTop,
        scores: emotion,
      },
      gender: {
        dominant: genderTop,
        dominant_bn: GENDER_LABELS_BN[genderTop] || genderTop,
        scores: gender,
      },
      face_region: {
        x: Math.round(box.x || 0),
        y: Math.round(box.y || 0),
        w: Math.round(box.width || 0),
        h: Math.round(box.height || 0),
      },
      detection_score: round2((result.detection && result.detection.score) || 0),
    };
  }

  // Left-to-right order reads more naturally than detector confidence order.
  function sortLeftToRight(faces) {
    return faces.slice().sort((a, b) => a.face_region.x - b.face_region.x);
  }

  // ── Engine (needs face-api; browser or Node) ────────────────

  /**
   * @param {object} opts
   * @param {object} opts.faceapi     the face-api module/global
   * @param {string} opts.modelUrl    base URL/path holding the model files
   * @param {number} [opts.minConfidence=0.5]
   * @param {number} [opts.maxFaces=10]
   * @param {string[]} [opts.backends=["webgl","cpu"]]  tried in order
   * @param {() => any} [opts.makeWarmupInput]  returns a small input used to
   *        compile GPU shaders at load time, so the first real analysis is fast
   */
  function createEngine(opts) {
    const faceapi = opts.faceapi;
    const modelUrl = opts.modelUrl;
    const minConfidence = opts.minConfidence == null ? 0.5 : opts.minConfidence;
    const maxFaces = opts.maxFaces || 10;
    const backends = opts.backends || ["webgl", "cpu"];
    const makeWarmupInput = opts.makeWarmupInput || null;

    let loadPromise = null;
    let backendName = null;

    async function pickBackend() {
      const tf = faceapi.tf;
      for (const name of backends) {
        try {
          const ok = await tf.setBackend(name);
          await tf.ready();
          if (ok !== false && tf.getBackend() === name) return name;
        } catch (_) {
          /* try the next backend */
        }
      }
      throw new Error("No usable TensorFlow.js backend");
    }

    async function loadOnce(onProgress) {
      const report = (done, total, label) => onProgress && onProgress({ done, total, label });
      const steps = [
        ["ফেস ডিটেক্টর", () => faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl)],
        ["ইমোশন মডেল", () => faceapi.nets.faceExpressionNet.loadFromUri(modelUrl)],
        ["বয়স ও জেন্ডার মডেল", () => faceapi.nets.ageGenderNet.loadFromUri(modelUrl)],
      ];
      report(0, steps.length + 1, "প্রস্তুতি");
      backendName = await pickBackend();
      let done = 0;
      for (const [label, fn] of steps) {
        report(done, steps.length + 1, label);
        await fn();
        done += 1;
      }
      report(done, steps.length + 1, "ওয়ার্ম-আপ");
      if (makeWarmupInput) {
        try {
          await detect(makeWarmupInput());
        } catch (_) {
          /* warm-up is best-effort; real analyses will still work */
        }
      }
      report(steps.length + 1, steps.length + 1, "প্রস্তুত");
    }

    /** Raw face-api pipeline. Does not wait for load() (load() calls it for warm-up). */
    function detect(input) {
      return faceapi
        .detectAllFaces(
          input,
          new faceapi.SsdMobilenetv1Options({ minConfidence, maxResults: maxFaces })
        )
        .withFaceExpressions()
        .withAgeAndGender();
    }

    /** Load models once; later calls return the same promise. */
    function load(onProgress) {
      if (!loadPromise) {
        loadPromise = loadOnce(onProgress).catch((err) => {
          loadPromise = null; // allow a retry after a failure
          throw err;
        });
      }
      return loadPromise;
    }

    /**
     * Analyse an image source (canvas / image element, or a tensor in Node).
     * Returns the UI-shaped result; `faces` is empty when nothing was found.
     */
    async function analyze(input) {
      await load();
      const detections = await detect(input);

      const faces = sortLeftToRight(detections.map(formatFace));
      return { success: faces.length > 0, face_count: faces.length, faces };
    }

    return {
      load,
      analyze,
      get backend() {
        return backendName;
      },
    };
  }

  return {
    createEngine,
    // exported for tests
    formatFace,
    emotionScores,
    genderScores,
    dominantKey,
    sortLeftToRight,
    EMOTION_LABELS_BN,
    GENDER_LABELS_BN,
  };
});
