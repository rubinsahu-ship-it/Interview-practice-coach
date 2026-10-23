// Interview Arena — Gamified Quiz-Style Interview Practice Coach
import {
  openRecordingsDB,
  saveRecordingToDB,
  getAllRecordingsFromDB,
  getRecordingsBySession,
  getLatestRecordingForQuestion,
  deleteRecordingFromDB,
  clearAllRecordingsFromDB,
  getSupportedAudioFormat,
  determineExtension,
  triggerAudioDownload,
} from "./db.js";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Application & Game State
const state = {
  sessionId: "session_" + Date.now(),
  role: "",
  difficulty: "Mid-Level",
  totalQuestions: 5,
  currentQuestionIndex: 0, // 0 to 4
  currentQuestion: "",
  currentAnswer: "",
  currentFollowUp: "",
  currentFollowUpAnswer: "",
  score: 0, // Total Practice XP
  streak: 0, // Continuous answer streak
  maxStreak: 0,
  history: [], // { question, answer, followUpQuestion, followUpAnswer, feedback, roundPoints }
  activeRecognition: null,
  activeMicBtn: null,
  activeBanner: null,
  activeUtterance: null,
  activeSpeakerBtn: null,
};

// MediaRecorder State for Untimed Audio Recording & Speech Synthesis
let activeMediaRecorder = null;
let activeMediaStream = null;
let activeAudioChunks = [];
let activeRecordingTarget = null; // 'main' or 'followup'
let activeAudioElement = null;

// Client-side TTS Protection State (avoids spamming paid provider on quota/rate-limit/auth errors)
const ttsClientState = {
  disabled: false, // Set to true when key missing (503), quota exceeded (402), or cancelled (401)
  cooldownUntil: 0, // Rate-limit / backoff timestamp
  failureCount: 0,
  accessCode: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tts_demo_code") || "" : "",
};

// DOM Elements - Screens & HUD
const gameHud = document.querySelector("#game-hud");
const hudQVal = document.querySelector("#hud-q-val");
const hudRoleName = document.querySelector("#hud-role-name");
const hudDiffBadge = document.querySelector("#hud-diff-badge");
const hudStreakVal = document.querySelector("#hud-streak-val");
const hudStreakChip = document.querySelector("#hud-streak-chip");
const hudXpVal = document.querySelector("#hud-xp-val");
const hudQuitBtn = document.querySelector("#hud-quit-btn");
const hudRecordingsBtn = document.querySelector("#hud-recordings-btn");
const hudRecordingsCount = document.querySelector("#hud-recordings-count");

const setupCard = document.querySelector("#setup-card");
const questionCard = document.querySelector("#question-card");
const followupCard = document.querySelector("#followup-card");
const feedbackCard = document.querySelector("#feedback-card");
const finalSummaryCard = document.querySelector("#final-summary-card");
const statusEl = document.querySelector("#status");
const confettiCanvas = document.querySelector("#confetti-canvas");

// Top Nav & Launcher Recordings
const navRecordingsBtn = document.querySelector("#nav-recordings-btn");
const navRecordingsCount = document.querySelector("#nav-recordings-count");
const launcherRecordingsBtn = document.querySelector("#launcher-recordings-btn");
const launcherRecordingsCount = document.querySelector("#launcher-recordings-count");

// Setup Screen
const roleSelect = document.querySelector("#role-select");
const customRoleInput = document.querySelector("#custom-role-input");
const difficultyInput = document.querySelector("#difficulty-select");
const diffChips = document.querySelectorAll(".diff-chip");
const startInterviewBtn = document.querySelector("#start-interview-btn");

// Question Screen
const qRoundLabel = document.querySelector("#q-round-label");
const progressBarFill = document.querySelector("#progress-bar-fill");
const questionHeading = document.querySelector("#question-heading");
const speakQuestionBtn = document.querySelector("#speak-question-btn");

// Main Answer Elements
const mainMicBtn = document.querySelector("#main-mic-btn");
const mainRecordingBanner = document.querySelector("#main-recording-banner");
const mainStopMicBtn = document.querySelector("#main-stop-mic-btn");
const mainWordCounter = document.querySelector("#main-word-counter");
const mainAnswerInput = document.querySelector("#main-answer-input");
const submitMainAnswerBtn = document.querySelector("#submit-main-answer-btn");
const retryQuestionBtn = document.querySelector("#retry-question-btn");

// Main Audio Recording Elements
const mainRecordBtn = document.querySelector("#main-record-btn");
const mainAudioRecordingBanner = document.querySelector("#main-audio-recording-banner");
const mainStopAudioBtn = document.querySelector("#main-stop-audio-btn");
const mainSavedAudioCard = document.querySelector("#main-saved-audio-card");
const mainAudioFormatBadge = document.querySelector("#main-audio-format-badge");
const mainAudioPlayer = document.querySelector("#main-audio-player");
const mainDownloadAudioBtn = document.querySelector("#main-download-audio-btn");
const mainDownloadText = document.querySelector("#main-download-text");
const mainDeleteAudioBtn = document.querySelector("#main-delete-audio-btn");

// Follow-up Screen
const followupRecapQnum = document.querySelector("#followup-recap-qnum");
const recapMainQuestion = document.querySelector("#recap-main-question");
const followupQuestionText = document.querySelector("#followup-question-text");
const speakFollowupBtn = document.querySelector("#speak-followup-btn");
const followupMicBtn = document.querySelector("#followup-mic-btn");
const followupRecordingBanner = document.querySelector("#followup-recording-banner");
const followupStopMicBtn = document.querySelector("#followup-stop-mic-btn");
const followupWordCounter = document.querySelector("#followup-word-counter");
const followupAnswerInput = document.querySelector("#followup-answer-input");
const submitFollowupBtn = document.querySelector("#submit-followup-btn");

// Follow-up Audio Recording Elements
const followupRecordBtn = document.querySelector("#followup-record-btn");
const followupAudioRecordingBanner = document.querySelector("#followup-audio-recording-banner");
const followupStopAudioBtn = document.querySelector("#followup-stop-audio-btn");
const followupSavedAudioCard = document.querySelector("#followup-saved-audio-card");
const followupAudioFormatBadge = document.querySelector("#followup-audio-format-badge");
const followupAudioPlayer = document.querySelector("#followup-audio-player");
const followupDownloadAudioBtn = document.querySelector("#followup-download-audio-btn");
const followupDownloadText = document.querySelector("#followup-download-text");
const followupDeleteAudioBtn = document.querySelector("#followup-delete-audio-btn");

// 3-Part Feedback Screen
const feedbackXpPill = document.querySelector("#feedback-xp-pill");
const feedbackStreakPill = document.querySelector("#feedback-streak-pill");
const feedbackRoundNum = document.querySelector("#feedback-round-num");
const feedbackGoodList = document.querySelector("#feedback-good-list");
const feedbackMissingList = document.querySelector("#feedback-missing-list");
const feedbackSampleAnswer = document.querySelector("#feedback-sample-answer");
const nextQuestionBtn = document.querySelector("#next-question-btn");
const retryCurrentQuestionBtn = document.querySelector("#retry-current-question-btn");
const endInterviewBtnFeedback = document.querySelector("#end-interview-btn-feedback");

// Final Summary Screen
const finalXpNumber = document.querySelector("#final-xp-number");
const finalStreakNumber = document.querySelector("#final-streak-number");
const finalQuestionsNumber = document.querySelector("#final-questions-number");
const summaryMetaSubtitle = document.querySelector("#summary-meta-subtitle");
const summaryOverviewText = document.querySelector("#summary-overview-text");
const summaryStrengthsList = document.querySelector("#summary-strengths-list");
const summaryImprovementsList = document.querySelector("#summary-improvements-list");
const summarySuggestionText = document.querySelector("#summary-suggestion-text");
const sessionRecordingsSection = document.querySelector("#session-recordings-section");
const sessionRecordingsList = document.querySelector("#session-recordings-list");
const viewAllRecordingsSummaryBtn = document.querySelector("#view-all-recordings-summary-btn");
const summaryTotalRecordingsCount = document.querySelector("#summary-total-recordings-count");
const transcriptAccordionContainer = document.querySelector("#transcript-accordion-container");
const restartInterviewBtn = document.querySelector("#restart-interview-btn");

// Recordings Modal Elements
const recordingsModal = document.querySelector("#recordings-modal");
const recordingsModalClose = document.querySelector("#recordings-modal-close");
const recordingsModalDismiss = document.querySelector("#recordings-modal-dismiss");
const recordingsModalBadge = document.querySelector("#recordings-modal-badge");
const recordingsFilterRole = document.querySelector("#recordings-filter-role");
const recordingsFilterType = document.querySelector("#recordings-filter-type");
const clearAllRecordingsBtn = document.querySelector("#clear-all-recordings-btn");
const recordingsListContainer = document.querySelector("#recordings-list-container");

// ==========================================================================
// HTTP JSON Request Helper
// ==========================================================================
async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

function setStatus(message, isError = true) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#ffa6a6" : "#c6ffc6";
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (label) {
    button.innerHTML = `<span>${label}</span>`;
  }
}

function updateWordCounter(textarea, counterEl) {
  const text = textarea.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  counterEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
}

// Custom Role Toggle
roleSelect.addEventListener("change", () => {
  const isCustom = roleSelect.value === "custom";
  customRoleInput.classList.toggle("hidden", !isCustom);
  if (isCustom) customRoleInput.focus();
});

function getSelectedRole() {
  if (roleSelect.value === "custom") {
    return customRoleInput.value.trim();
  }
  return roleSelect.value.trim();
}

// Difficulty Chips Click
diffChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    diffChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    difficultyInput.value = chip.dataset.value;
  });
});

// Navigation: Show single screen
function showScreen(screenToShow) {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();

  const screens = [setupCard, questionCard, followupCard, feedbackCard, finalSummaryCard];
  const inQuiz = screenToShow !== setupCard;

  document.body.classList.toggle("session-active", inQuiz);
  document.body.classList.toggle("landing-active", !inQuiz);

  screens.forEach((s) => {
    if (s) {
      const isTarget = s === screenToShow;
      s.hidden = !isTarget;
      s.classList.toggle("hidden", !isTarget);
    }
  });

  gameHud.classList.toggle("hidden", !inQuiz);
  gameHud.hidden = !inQuiz;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================================================
// Game HUD Updates
// ==========================================================================
function updateHud(qNum) {
  hudQVal.textContent = `${qNum}/${state.totalQuestions}`;
  hudRoleName.textContent = state.role || "Role";
  hudDiffBadge.textContent = state.difficulty.split(" ")[0]; // e.g. "Senior" or "Mid"
  hudStreakVal.textContent = state.streak;
  hudXpVal.textContent = state.score.toLocaleString();
}

function bumpStreak() {
  hudStreakChip.classList.add("bump");
  setTimeout(() => hudStreakChip.classList.remove("bump"), 300);
}

// ==========================================================================
// Lightweight Confetti Particle Engine (Zero Dependencies)
// ==========================================================================
function triggerConfetti() {
  if (!confettiCanvas) return;
  const ctx = confettiCanvas.getContext("2d");
  const width = (confettiCanvas.width = window.innerWidth);
  const height = (confettiCanvas.height = window.innerHeight);

  const colors = ["#e21b3c", "#1368ce", "#ffa602", "#26890c", "#864cbf", "#ffffff"];
  const particles = [];
  const particleCount = 80;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: width * 0.5 + (Math.random() - 0.5) * 200,
      y: height * 0.4,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -12 - 4,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 8,
      opacity: 1,
    });
  }

  let animationFrame;
  const render = () => {
    ctx.clearRect(0, 0, width, height);
    let alive = 0;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // gravity
      p.rotation += p.rSpeed;
      p.opacity -= 0.012;

      if (p.opacity > 0 && p.y < height) {
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }

    if (alive > 0) {
      animationFrame = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, width, height);
      cancelAnimationFrame(animationFrame);
    }
  };

  render();
}

// ==========================================================================
// Web Speech API Voice Input & Question Audio Read-Aloud
// ==========================================================================
function stopActiveVoiceInput() {
  if (state.activeRecognition) {
    try {
      state.activeRecognition.stop();
    } catch {}
    state.activeRecognition = null;
  }
  if (state.activeMicBtn) {
    state.activeMicBtn.classList.remove("recording");
    const label = state.activeMicBtn.querySelector(".mic-text");
    if (label) label.textContent = "Start Mic";
    const glyph = state.activeMicBtn.querySelector(".mic-glyph");
    if (glyph) glyph.textContent = "🎙️";
    state.activeMicBtn.setAttribute("aria-label", "Start voice typing");
  }
  if (state.activeBanner) {
    state.activeBanner.classList.add("hidden");
  }
  state.activeMicBtn = null;
  state.activeBanner = null;
}

function toggleVoiceInput(targetTextarea, micBtn, bannerEl, wordCounterEl) {
  // If clicking the currently recording mic button, stop it cleanly
  if (state.activeRecognition && state.activeMicBtn === micBtn) {
    stopActiveVoiceInput();
    setStatus("Microphone stopped. Your answer is editable below.", false);
    targetTextarea.focus();
    return;
  }

  // Ensure any other mic or speaker is stopped first
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not supported in this browser. Please type your answer directly.", true);
    targetTextarea.focus();
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Capture base text at the start of this mic session to preserve edits without duplication
    const sessionBaseText = targetTextarea.value;
    let prefix = "";
    if (sessionBaseText) {
      prefix = sessionBaseText.endsWith(" ") || sessionBaseText.endsWith("\n")
        ? sessionBaseText
        : `${sessionBaseText} `;
    }

    recognition.onstart = () => {
      state.activeRecognition = recognition;
      state.activeMicBtn = micBtn;
      state.activeBanner = bannerEl;

      micBtn.classList.add("recording");
      const label = micBtn.querySelector(".mic-text");
      if (label) label.textContent = "Stop Mic";
      const glyph = micBtn.querySelector(".mic-glyph");
      if (glyph) glyph.textContent = "⏹️";
      micBtn.setAttribute("aria-label", "Stop voice typing");

      if (bannerEl) bannerEl.classList.remove("hidden");
      setStatus("Microphone active! Speak clearly. Audio is transcribed live and never stored.", false);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let currentSessionFinal = "";

      for (let i = 0; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          currentSessionFinal += chunk;
        } else {
          interim += chunk;
        }
      }

      const speechPart = (
        currentSessionFinal +
        (interim ? (currentSessionFinal ? " " : "") + interim : "")
      ).trim();

      targetTextarea.value = prefix
        ? (speechPart ? `${prefix}${speechPart}` : sessionBaseText)
        : speechPart;

      updateWordCounter(targetTextarea, wordCounterEl);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      stopActiveVoiceInput();

      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setStatus("Microphone permission was denied. Please allow microphone access in your browser settings, or continue typing below.", true);
      } else if (event.error === "no-speech") {
        setStatus("No speech detected. Click Start Mic to try again, or type your answer below.", false);
      } else if (event.error === "network") {
        setStatus("Speech recognition network error. Your browser speech service was unreachable. Keyboard typing is ready.", true);
      } else if (event.error === "audio-capture") {
        setStatus("Microphone was not found or is busy. Check audio settings or continue typing below.", true);
      } else {
        setStatus(`Voice typing notice (${event.error || "unavailable"}). Text input is ready.`, false);
      }
      targetTextarea.focus();
    };

    recognition.onend = () => {
      stopActiveVoiceInput();
    };

    recognition.start();
  } catch (err) {
    console.error("SpeechRecognition error:", err);
    stopActiveVoiceInput();
    setStatus("Could not activate microphone. Please type your answer below.", true);
  }
}

// --------------------------------------------------------------------------
// Question Audio Read-Aloud (Text-to-Speech)
// --------------------------------------------------------------------------
function stopActiveSpeechPlayback() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {}
    activeAudioElement = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (state.activeSpeakerBtn) {
    state.activeSpeakerBtn.classList.remove("speaking");
    const label = state.activeSpeakerBtn.querySelector(".speaker-label");
    if (label) label.textContent = "Listen";
    const icon = state.activeSpeakerBtn.querySelector(".speaker-icon");
    if (icon) icon.textContent = "🔊";
    state.activeSpeakerBtn.setAttribute("aria-label", "Read aloud");
  }
  state.activeUtterance = null;
  state.activeSpeakerBtn = null;
}

async function toggleSpeechPlayback(text, speakerBtn) {
  // CRITICAL: Stop mic capture immediately before playback so it doesn't transcribe the question
  stopActiveVoiceInput();
  stopActiveAudioRecording();

  if (state.activeSpeakerBtn === speakerBtn) {
    stopActiveSpeechPlayback();
    setStatus("Question audio playback stopped.", false);
    return;
  }

  stopActiveSpeechPlayback();

  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  state.activeSpeakerBtn = speakerBtn;
  speakerBtn.classList.add("speaking");
  const label = speakerBtn.querySelector(".speaker-label");
  const icon = speakerBtn.querySelector(".speaker-icon");

  // 1. If provider is disabled or in backoff/cooldown, skip paid provider call immediately
  if (ttsClientState.disabled) {
    fallbackBrowserTTS(cleanText, speakerBtn, "AI voice offline/quota limit");
    return;
  }

  const now = Date.now();
  if (now < ttsClientState.cooldownUntil) {
    const waitSec = Math.ceil((ttsClientState.cooldownUntil - now) / 1000);
    fallbackBrowserTTS(cleanText, speakerBtn, `rate limit active (${waitSec}s remaining)`);
    return;
  }

  if (label) label.textContent = "Loading…";
  if (icon) icon.textContent = "⏳";
  speakerBtn.setAttribute("aria-label", "Loading audio playback");
  setStatus("Generating realistic interviewer audio (ElevenLabs)…", false);

  // 2. Request realistic ElevenLabs AI voice via backend endpoint
  try {
    const headers = { "Content-Type": "application/json" };
    if (ttsClientState.accessCode) {
      headers["x-access-code"] = ttsClientState.accessCode;
    }

    const response = await fetch("/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: cleanText }),
    });

    if (response.ok) {
      ttsClientState.failureCount = 0;
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      activeAudioElement = audio;

      audio.onplay = () => {
        if (label) label.textContent = "Stop";
        if (icon) icon.textContent = "⏹";
        speakerBtn.setAttribute("aria-label", "Stop audio playback");
        setStatus("Interviewer speaking (ElevenLabs AI Voice)… Click Stop to pause.", false);
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        stopActiveSpeechPlayback();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        fallbackBrowserTTS(cleanText, speakerBtn, "audio decoding error");
      };

      await audio.play();
      return;
    }

    // Handle structured HTTP error responses
    const errorData = await response.json().catch(() => ({}));

    // Access Code Gate (401)
    if (response.status === 401 && errorData.code === "ACCESS_CODE_REQUIRED") {
      const enteredCode = window.prompt(
        "A private demo access code is required for realistic ElevenLabs AI voice.\n\nEnter access code (or click Cancel to use built-in browser voice):"
      );
      if (enteredCode && enteredCode.trim()) {
        ttsClientState.accessCode = enteredCode.trim();
        try {
          sessionStorage.setItem("tts_demo_code", ttsClientState.accessCode);
        } catch {}
        // Retry once with the entered access code
        return toggleSpeechPlayback(text, speakerBtn);
      } else {
        // User cancelled — use browser fallback for this session
        ttsClientState.disabled = true;
        fallbackBrowserTTS(cleanText, speakerBtn, "access code not supplied");
        return;
      }
    }

    // Quota Exceeded (402)
    if (response.status === 402 || errorData.code === "PAYMENT_REQUIRED") {
      ttsClientState.disabled = true;
      setStatus("ElevenLabs monthly quota reached. Switched to browser voice fallback.", false);
      fallbackBrowserTTS(cleanText, speakerBtn, "ElevenLabs quota reached");
      return;
    }

    // Rate Limit Throttled (429)
    if (response.status === 429) {
      const retryAfter = errorData.retryAfterSeconds || 60;
      ttsClientState.cooldownUntil = Date.now() + retryAfter * 1000;
      setStatus(`Rate limit reached: Throttling to protect quota (${retryAfter}s). Using browser voice.`, false);
      fallbackBrowserTTS(cleanText, speakerBtn, `rate limited (${retryAfter}s)`);
      return;
    }

    // Provider Disabled (503)
    if (response.status === 503) {
      ttsClientState.disabled = true;
      fallbackBrowserTTS(cleanText, speakerBtn, "provider unconfigured");
      return;
    }

    // General Upstream / Server Error
    ttsClientState.failureCount++;
    if (ttsClientState.failureCount >= 2) {
      // Cooldown for 2 minutes to prevent repeated failing requests
      ttsClientState.cooldownUntil = Date.now() + 120 * 1000;
    }
    fallbackBrowserTTS(cleanText, speakerBtn, "ElevenLabs temporarily unavailable");
  } catch (err) {
    console.warn("ElevenLabs TTS network error, falling back to browser speech synthesis:", err);
    ttsClientState.failureCount++;
    if (ttsClientState.failureCount >= 2) {
      ttsClientState.cooldownUntil = Date.now() + 120 * 1000;
    }
    fallbackBrowserTTS(cleanText, speakerBtn, "network error");
  }
}

function fallbackBrowserTTS(cleanText, speakerBtn, fallbackReason = "") {
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    stopActiveSpeechPlayback();
    setStatus("Text-to-speech audio is not supported in this browser.", true);
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      state.activeUtterance = utterance;
      state.activeSpeakerBtn = speakerBtn;
      speakerBtn.classList.add("speaking");
      const label = speakerBtn.querySelector(".speaker-label");
      if (label) label.textContent = "Stop (Browser)";
      const icon = speakerBtn.querySelector(".speaker-icon");
      if (icon) icon.textContent = "⏹";
      speakerBtn.setAttribute("aria-label", "Stop browser audio playback");

      const reasonNote = fallbackReason ? ` [${fallbackReason}]` : "";
      setStatus(`Reading question aloud (Browser Voice${reasonNote})… Click Stop to pause.`, false);
    };

    utterance.onend = () => {
      stopActiveSpeechPlayback();
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis error:", e);
      stopActiveSpeechPlayback();
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Speech synthesis error:", err);
    stopActiveSpeechPlayback();
    setStatus("Audio playback encountered an error.", true);
  }
}

// Wire Voice Input & Speaker Controls
mainMicBtn?.addEventListener("click", () => {
  toggleVoiceInput(mainAnswerInput, mainMicBtn, mainRecordingBanner, mainWordCounter);
});
mainStopMicBtn?.addEventListener("click", stopActiveVoiceInput);

followupMicBtn?.addEventListener("click", () => {
  toggleVoiceInput(followupAnswerInput, followupMicBtn, followupRecordingBanner, followupWordCounter);
});
followupStopMicBtn?.addEventListener("click", stopActiveVoiceInput);

speakQuestionBtn?.addEventListener("click", () => {
  const qText = questionHeading.textContent.trim();
  if (qText && qText !== "Loading question…") {
    toggleSpeechPlayback(qText, speakQuestionBtn);
  }
});

speakFollowupBtn?.addEventListener("click", () => {
  const qText = followupQuestionText.textContent.trim();
  if (qText && qText !== "Formulating follow-up…") {
    toggleSpeechPlayback(qText, speakFollowupBtn);
  }
});

mainAnswerInput.addEventListener("input", () => updateWordCounter(mainAnswerInput, mainWordCounter));
followupAnswerInput.addEventListener("input", () => updateWordCounter(followupAnswerInput, followupWordCounter));

// ==========================================================================
// Untimed Audio Recording via MediaRecorder (IndexedDB Local Storage)
// ==========================================================================

function setRecordingUI(targetType, isRecording) {
  const isMain = targetType === "main";
  const btn = isMain ? mainRecordBtn : followupRecordBtn;
  const banner = isMain ? mainAudioRecordingBanner : followupAudioRecordingBanner;

  if (btn) {
    btn.classList.toggle("recording", isRecording);
    btn.classList.toggle("is-recording", isRecording);
    const textEl = btn.querySelector(".record-text");
    if (textEl) textEl.textContent = isRecording ? "Stop Recording" : "Record Audio";
    const glyph = btn.querySelector(".record-glyph");
    if (glyph) glyph.textContent = isRecording ? "⏹" : "⏺";
    btn.setAttribute("aria-label", isRecording ? "Stop recording audio" : "Record audio");
  }

  if (banner) {
    banner.classList.toggle("hidden", !isRecording);
  }
}

function stopActiveAudioRecording(targetType) {
  const t = targetType || activeRecordingTarget;
  if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
    try {
      activeMediaRecorder.stop();
    } catch (e) {
      console.warn("MediaRecorder stop error:", e);
    }
  }
  if (activeMediaStream) {
    try {
      activeMediaStream.getTracks().forEach((track) => track.stop());
    } catch {}
  }
  if (t) {
    setRecordingUI(t, false);
  }
  activeMediaRecorder = null;
  activeMediaStream = null;
  activeRecordingTarget = null;
}

async function startAudioRecording(targetType) {
  // If clicking on the currently recording target button, cleanly stop recording
  if (activeMediaRecorder && activeRecordingTarget === targetType) {
    stopActiveAudioRecording(targetType);
    return;
  }

  // Ensure any other mic, speaker, or audio recording is stopped first
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  if (activeMediaRecorder) {
    stopActiveAudioRecording();
  }

  if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Microphone recording is not supported in this browser. Please use keyboard or voice typing.", true);
    return;
  }

  if (typeof MediaRecorder === "undefined") {
    setStatus("MediaRecorder is not supported in this browser.", true);
    return;
  }

  let stream;
  try {
    // CRITICAL REQUIREMENT: Request mic permission ONLY on user click
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn("Microphone access error:", err);
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      setStatus("Microphone permission was denied. Allow microphone access in browser settings to record audio.", true);
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      setStatus("No microphone device was found on this system.", true);
    } else {
      setStatus(`Could not access microphone (${err.message || err.name}).`, true);
    }
    return;
  }

  try {
    const supported = getSupportedAudioFormat();
    const options = supported.mime ? { mimeType: supported.mime } : {};
    const recorder = new MediaRecorder(stream, options);
    const chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      // Release hardware audio track
      stream.getTracks().forEach((track) => track.stop());

      const mime = recorder.mimeType || supported.mime || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      const ext = determineExtension(mime);

      const qText = targetType === "main" ? state.currentQuestion : state.currentFollowUp;
      const rec = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        sessionId: state.sessionId,
        questionId: state.currentQuestionIndex + 1,
        questionText: qText || (targetType === "main" ? "Question" : "Follow-Up"),
        role: state.role || "Practice Role",
        difficulty: state.difficulty || "Mid-Level",
        answerType: targetType,
        audioBlob: blob,
        mimeType: mime,
        fileExtension: ext,
        recordingDate: new Date().toISOString(),
      };

      try {
        await saveRecordingToDB(rec);
        renderSavedAudioCard(targetType, rec);
        await updateRecordingsBadge();
        setStatus("Voice recording saved locally in IndexedDB! Completely untimed practice—submit whenever ready.", false);
      } catch (err) {
        console.error("Failed to save audio recording to IndexedDB:", err);
        setStatus("Could not save recording to browser database.", true);
      }
    };

    activeMediaRecorder = recorder;
    activeMediaStream = stream;
    activeAudioChunks = chunks;
    activeRecordingTarget = targetType;

    recorder.start();
    setRecordingUI(targetType, true);
    setStatus("Recording audio… speak clearly. Practice is completely untimed: click Stop Recording when finished.", false);
  } catch (err) {
    console.error("Failed to start MediaRecorder:", err);
    stream.getTracks().forEach((track) => track.stop());
    setStatus("Failed to start audio recording.", true);
  }
}

function renderSavedAudioCard(targetType, record) {
  const isMain = targetType === "main";
  const card = isMain ? mainSavedAudioCard : followupSavedAudioCard;
  const player = isMain ? mainAudioPlayer : followupAudioPlayer;
  const formatBadge = isMain ? mainAudioFormatBadge : followupAudioFormatBadge;
  const downloadBtn = isMain ? mainDownloadAudioBtn : followupDownloadAudioBtn;
  const downloadText = isMain ? mainDownloadText : followupDownloadText;
  const deleteBtn = isMain ? mainDeleteAudioBtn : followupDeleteAudioBtn;

  if (!card) return;

  if (!record || !record.audioBlob) {
    card.classList.add("hidden");
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    return;
  }

  const ext = record.fileExtension || determineExtension(record.mimeType);
  if (formatBadge) formatBadge.textContent = ext.toUpperCase();
  if (downloadText) downloadText.textContent = `Download (.${ext})`;

  const blobUrl = URL.createObjectURL(record.audioBlob);
  if (player) {
    player.src = blobUrl;
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      triggerAudioDownload(record);
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      const confirmed = window.confirm(
        "Are you sure you want to delete this audio recording? This action cannot be undone."
      );
      if (!confirmed) return;

      try {
        await deleteRecordingFromDB(record.id);
        card.classList.add("hidden");
        if (player) {
          player.pause();
          player.removeAttribute("src");
          player.load();
        }
        await updateRecordingsBadge();
        setStatus("Audio recording deleted.", false);
        if (recordingsModal && !recordingsModal.classList.contains("hidden")) {
          renderRecordingsList();
        }
      } catch (err) {
        console.error("Error deleting recording:", err);
        setStatus("Could not delete recording.", true);
      }
    };
  }

  card.classList.remove("hidden");
}

// Wire Audio Recording Buttons
mainRecordBtn?.addEventListener("click", () => startAudioRecording("main"));
mainStopAudioBtn?.addEventListener("click", () => stopActiveAudioRecording("main"));

followupRecordBtn?.addEventListener("click", () => startAudioRecording("followup"));
followupStopAudioBtn?.addEventListener("click", () => stopActiveAudioRecording("followup"));

// ==========================================================================
// SCREEN 1 -> SCREEN 2: START CHALLENGE
// ==========================================================================
startInterviewBtn.addEventListener("click", async () => {
  const role = getSelectedRole();
  if (!role) {
    setStatus("Please select or type your target job role to start practice.", true);
    roleSelect.classList.add("field-attention");
    setTimeout(() => roleSelect.classList.remove("field-attention"), 1600);
    roleSelect.focus();
    return;
  }

  state.role = role;
  state.difficulty = difficultyInput.value;
  state.sessionId = "session_" + Date.now();
  state.currentQuestionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.history = [];

  setStatus("");
  setBusy(startInterviewBtn, true, "Starting Practice…");

  try {
    const data = await requestJson("/api/question", {
      role: state.role,
      difficulty: state.difficulty,
      questionNumber: 1,
      previousQuestions: [],
    });

    state.currentQuestion = data.question;
    await renderQuestionScreen(1, data.question);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(startInterviewBtn, false, "Start Practice →");
  }
});

async function renderQuestionScreen(qNum, questionText) {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  setStatus("");

  qRoundLabel.textContent = `ROUND ${qNum} OF ${state.totalQuestions}`;
  const progressPct = (qNum / state.totalQuestions) * 100;
  progressBarFill.style.width = `${progressPct}%`;

  questionHeading.textContent = questionText;
  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);

  // Restore existing recording for this question in this session if present
  try {
    const existingRec = await getLatestRecordingForQuestion(state.sessionId, qNum, "main");
    renderSavedAudioCard("main", existingRec);
  } catch (err) {
    renderSavedAudioCard("main", null);
  }

  updateHud(qNum);
  showScreen(questionCard);
  mainAnswerInput?.focus();
}

// ==========================================================================
// SCREEN 2 -> SCREEN 3: SUBMIT ANSWER -> GENERATE FOLLOW-UP
// ==========================================================================
submitMainAnswerBtn.addEventListener("click", async () => {
  const answer = mainAnswerInput.value.trim();
  if (!answer) {
    setStatus("Please type your answer first!", true);
    mainAnswerInput.focus();
    return;
  }

  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  state.currentAnswer = answer;

  setStatus("");
  setBusy(submitMainAnswerBtn, true, "INTERVIEWER FORMULATING FOLLOW-UP…");

  try {
    const data = await requestJson("/api/followup", {
      role: state.role,
      difficulty: state.difficulty,
      question: state.currentQuestion,
      answer: state.currentAnswer,
    });

    state.currentFollowUp = data.followUpQuestion;
    await renderFollowupScreen();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(submitMainAnswerBtn, false, "SUBMIT ANSWER ➔");
  }
});

async function renderFollowupScreen() {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  setStatus("");

  const qNum = state.currentQuestionIndex + 1;
  followupRecapQnum.textContent = qNum;
  recapMainQuestion.textContent = `"${state.currentAnswer}"`;
  followupQuestionText.textContent = state.currentFollowUp;

  followupAnswerInput.value = "";
  updateWordCounter(followupAnswerInput, followupWordCounter);

  // Restore existing follow-up recording for this question in this session if present
  try {
    const existingRec = await getLatestRecordingForQuestion(state.sessionId, qNum, "followup");
    renderSavedAudioCard("followup", existingRec);
  } catch (err) {
    renderSavedAudioCard("followup", null);
  }

  updateHud(qNum);
  showScreen(followupCard);
  followupAnswerInput.focus();
}

retryQuestionBtn.addEventListener("click", () => {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);
  mainAnswerInput?.focus();
  setStatus("Question reset. Type your answer when ready.", false);
});

// ==========================================================================
// SCREEN 3 -> SCREEN 4: SUBMIT FOLLOW-UP -> REVEAL RESULT CARD
// ==========================================================================
submitFollowupBtn.addEventListener("click", async () => {
  const followUpAnswer = followupAnswerInput.value.trim();
  if (!followUpAnswer) {
    setStatus("Please answer the follow-up question before continuing!", true);
    followupAnswerInput.focus();
    return;
  }

  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  state.currentFollowUpAnswer = followUpAnswer;

  setStatus("");
  setBusy(submitFollowupBtn, true, "EVALUATING ROUND PERFORMANCE…");

  try {
    const feedback = await requestJson("/api/feedback", {
      role: state.role,
      difficulty: state.difficulty,
      question: state.currentQuestion,
      answer: state.currentAnswer,
      followUpQuestion: state.currentFollowUp,
      followUpAnswer: state.currentFollowUpAnswer,
    });

    // Gamification Scoring: Base XP + Effort Bonus
    const totalWords = (state.currentAnswer + " " + state.currentFollowUpAnswer).trim().split(/\s+/).length;
    const effortBonus = Math.min(50, Math.floor(totalWords / 3));
    const roundPoints = 200 + effortBonus;

    state.score += roundPoints;
    state.streak++;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;

    state.history.push({
      questionNumber: state.currentQuestionIndex + 1,
      question: state.currentQuestion,
      answer: state.currentAnswer,
      followUpQuestion: state.currentFollowUp,
      followUpAnswer: state.currentFollowUpAnswer,
      feedback,
      roundPoints,
    });

    bumpStreak();
    triggerConfetti();
    renderFeedbackScreen(feedback, roundPoints);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(submitFollowupBtn, false, "REVEAL FEEDBACK 💥");
  }
});

function renderFeedbackScreen(feedback, roundPoints) {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  setStatus("");

  const qNum = state.currentQuestionIndex + 1;
  feedbackRoundNum.textContent = qNum;
  feedbackXpPill.textContent = `+${roundPoints} XP EARNED`;
  feedbackStreakPill.textContent = `🔥 STREAK: ${state.streak}`;

  // 1. What was good (Green Card)
  feedbackGoodList.replaceChildren(
    ...(feedback.whatWasGood || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // 2. What was missing (Amber Card)
  feedbackMissingList.replaceChildren(
    ...(feedback.whatWasMissing || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // 3. Gold Standard Sample Answer (Purple Card)
  feedbackSampleAnswer.textContent = feedback.strongerSampleAnswer || "Sample answer unavailable.";

  if (state.currentQuestionIndex >= state.totalQuestions - 1) {
    nextQuestionBtn.innerHTML = `<span>FINISH CHALLENGE 🏆</span>`;
  } else {
    nextQuestionBtn.innerHTML = `<span>NEXT ROUND (${state.currentQuestionIndex + 2}/5) ➔</span>`;
  }

  updateHud(qNum);
  showScreen(feedbackCard);
}

retryCurrentQuestionBtn.addEventListener("click", async () => {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  if (state.history.length > state.currentQuestionIndex) {
    const last = state.history.pop();
    state.score = Math.max(0, state.score - (last?.roundPoints || 200));
    state.streak = Math.max(0, state.streak - 1);
  }
  await renderQuestionScreen(state.currentQuestionIndex + 1, state.currentQuestion);
});

// ==========================================================================
// SCREEN 4 -> SCREEN 5: ADVANCE TO NEXT QUESTION OR PODIUM
// ==========================================================================
nextQuestionBtn.addEventListener("click", async () => {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  if (state.currentQuestionIndex >= state.totalQuestions - 1) {
    await completeInterviewSession();
    return;
  }

  state.currentQuestionIndex++;
  const nextQNum = state.currentQuestionIndex + 1;

  setStatus("");
  setBusy(nextQuestionBtn, true, `LOADING ROUND ${nextQNum}…`);

  try {
    const previousQuestions = state.history.map((h) => h.question);
    const data = await requestJson("/api/question", {
      role: state.role,
      difficulty: state.difficulty,
      questionNumber: nextQNum,
      previousQuestions,
    });

    state.currentQuestion = data.question;
    await renderQuestionScreen(nextQNum, data.question);
  } catch (error) {
    setStatus(error.message, true);
    state.currentQuestionIndex--;
  } finally {
    setBusy(nextQuestionBtn, false, `NEXT ROUND (${state.currentQuestionIndex + 2}/5) ➔`);
  }
});

// ==========================================================================
// SCREEN 5: FINAL SUMMARY / PODIUM SCREEN
// ==========================================================================
async function completeInterviewSession() {
  if (state.history.length === 0) {
    showScreen(setupCard);
    return;
  }

  setStatus("Compiling your masterclass coaching report…", false);

  try {
    const summary = await requestJson("/api/summary", {
      role: state.role,
      difficulty: state.difficulty,
      history: state.history,
    });

    await renderFinalSummary(summary);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function renderFinalSummary(summary) {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  setStatus("");
  triggerConfetti();

  summaryMetaSubtitle.textContent = `${state.role} • ${state.difficulty} • ${state.history.length} Questions Completed`;

  finalXpNumber.textContent = state.score.toLocaleString();
  finalStreakNumber.textContent = `${state.maxStreak} 🔥`;
  finalQuestionsNumber.textContent = `${state.history.length}/${state.totalQuestions}`;

  summaryOverviewText.textContent = summary.overview || "Interview completed successfully.";

  // Strengths
  summaryStrengthsList.replaceChildren(
    ...(summary.overallStrengths || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // Improvement Areas
  summaryImprovementsList.replaceChildren(
    ...(summary.improvementAreas || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // Next Practice Suggestion
  summarySuggestionText.textContent = summary.nextPracticeSuggestion || "Continue practicing structured responses.";

  // Render Session Voice Recordings
  await renderSessionRecordingsSection();

  // Render Transcript Accordion
  transcriptAccordionContainer.replaceChildren(
    ...state.history.map((item, idx) => {
      const details = document.createElement("details");
      details.className = "accordion-item";
      if (idx === 0) details.open = true;

      const summaryTag = document.createElement("summary");
      summaryTag.className = "accordion-summary";
      summaryTag.innerHTML = `
        <span>Round ${idx + 1}: ${escapeHtml(item.question.slice(0, 60))}…</span>
        <span class="hud-chip q-chip">+${item.roundPoints} XP</span>
      `;

      const body = document.createElement("div");
      body.className = "accordion-body";
      body.innerHTML = `
        <h4>Interview Question</h4>
        <p><strong>${escapeHtml(item.question)}</strong></p>

        <h4>Your Answer</h4>
        <p>${escapeHtml(item.answer)}</p>

        ${
          item.followUpQuestion
            ? `
          <h4>Interviewer Follow-Up</h4>
          <p><strong>${escapeHtml(item.followUpQuestion)}</strong></p>
          <h4>Your Follow-Up Response</h4>
          <p>${escapeHtml(item.followUpAnswer || "None")}</p>
        `
            : ""
        }

        <h4>Gold Standard Sample Answer</h4>
        <p class="sample-answer-text">${escapeHtml(item.feedback?.strongerSampleAnswer || "")}</p>
      `;

      details.append(summaryTag, body);
      return details;
    })
  );

  showScreen(finalSummaryCard);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ==========================================================================
// Quit & Practice Again Handlers
// ==========================================================================
function confirmEndInterview() {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();

  if (state.history.length === 0) {
    if (confirm("Exit to the lobby?")) {
      showScreen(setupCard);
    }
    return;
  }

  if (confirm(`You completed ${state.history.length} round(s). Reveal your final coaching report now?`)) {
    completeInterviewSession();
  }
}

hudQuitBtn?.addEventListener("click", confirmEndInterview);
endInterviewBtnFeedback?.addEventListener("click", confirmEndInterview);

restartInterviewBtn?.addEventListener("click", () => {
  stopActiveVoiceInput();
  stopActiveSpeechPlayback();
  stopActiveAudioRecording();
  state.history = [];
  state.currentQuestionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.sessionId = "session_" + Date.now();
  showScreen(setupCard);
});

// ==========================================================================
// SESSION AUDIO RECORDINGS & INDEXEDDB ARCHIVE MODAL
// ==========================================================================

async function renderSessionRecordingsSection() {
  if (!sessionRecordingsList) return;
  try {
    const sessionRecs = await getRecordingsBySession(state.sessionId);
    if (sessionRecs.length === 0) {
      sessionRecordingsList.innerHTML = `
        <p class="empty-state-desc" style="margin: 0; padding: 12px 0;">
          No audio was recorded during this session. All typed and voice-transcribed responses are available in the Full Session Review below.
        </p>
      `;
      return;
    }

    sessionRecordingsList.replaceChildren(
      ...sessionRecs.map((rec) => {
        const row = document.createElement("div");
        row.className = "recording-item-card";

        const ext = rec.fileExtension || determineExtension(rec.mimeType);
        const typeLabel = rec.answerType === "followup" ? "Follow-Up Response" : "Main Response";
        const typeClass = rec.answerType === "followup" ? "type-followup" : "type-main";

        row.innerHTML = `
          <div class="recording-card-header">
            <div class="recording-card-tags">
              <span class="recording-role-pill">Round ${rec.questionId}</span>
              <span class="recording-type-pill ${typeClass}">${typeLabel}</span>
              <span class="audio-format-badge">${ext.toUpperCase()}</span>
            </div>
            <span class="recording-date-text">${formatRecordingDate(rec.recordingDate)}</span>
          </div>
          <p class="recording-question-quote">"${escapeHtml(rec.questionText)}"</p>
          <div class="recording-playback-row">
            <audio class="recording-audio-ctrl" controls preload="metadata"></audio>
            <div class="recording-card-actions">
              <button type="button" class="btn-audio-subaction btn-download-row" title="Download audio recording">
                ⬇ Download (.${ext})
              </button>
              <button type="button" class="btn-audio-subaction btn-delete-audio btn-delete-row" title="Delete audio recording">
                🗑 Delete
              </button>
            </div>
          </div>
        `;

        const audioEl = row.querySelector("audio");
        audioEl.src = URL.createObjectURL(rec.audioBlob);

        row.querySelector(".btn-download-row").onclick = () => triggerAudioDownload(rec);
        row.querySelector(".btn-delete-row").onclick = async () => {
          const confirmed = window.confirm(
            "Are you sure you want to permanently delete this audio recording? This action cannot be undone."
          );
          if (!confirmed) return;

          await deleteRecordingFromDB(rec.id);
          row.remove();
          await updateRecordingsBadge();
          if (sessionRecordingsList.children.length === 0) {
            renderSessionRecordingsSection();
          }
        };

        return row;
      })
    );
  } catch (err) {
    console.error("Error rendering session recordings section:", err);
  }
}

function openRecordingsModal() {
  if (!recordingsModal) return;
  recordingsModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  populateRecordingsRoleFilter();
  renderRecordingsList();
}

function closeRecordingsModal() {
  if (!recordingsModal) return;
  // Pause any audio playing inside the modal
  recordingsModal.querySelectorAll("audio").forEach((a) => {
    try {
      a.pause();
    } catch {}
  });
  recordingsModal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function populateRecordingsRoleFilter() {
  if (!recordingsFilterRole) return;
  const all = await getAllRecordingsFromDB();
  const roles = Array.from(new Set(all.map((r) => r.role).filter(Boolean))).sort();

  const currentVal = recordingsFilterRole.value;
  recordingsFilterRole.innerHTML = `<option value="all">All Roles</option>`;
  roles.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    if (r === currentVal) opt.selected = true;
    recordingsFilterRole.appendChild(opt);
  });
}

function formatRecordingDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr || "";
  }
}

async function renderRecordingsList() {
  if (!recordingsListContainer) return;
  const all = await getAllRecordingsFromDB();

  const roleFilter = recordingsFilterRole?.value || "all";
  const typeFilter = recordingsFilterType?.value || "all";

  const filtered = all.filter((r) => {
    if (roleFilter !== "all" && r.role !== roleFilter) return false;
    if (typeFilter !== "all" && r.answerType !== typeFilter) return false;
    return true;
  });

  if (recordingsModalBadge) {
    recordingsModalBadge.textContent = all.length;
  }

  if (filtered.length === 0) {
    recordingsListContainer.innerHTML = `
      <div class="recordings-empty-state">
        <div class="empty-state-icon" aria-hidden="true">🎙️</div>
        <h4 class="empty-state-title">No Audio Recordings Found</h4>
        <p class="empty-state-desc">
          ${
            all.length === 0
              ? "When practicing any question, click 'Record Audio' to capture your spoken response. All takes are stored locally in your browser's IndexedDB and preserved across sessions."
              : "No recordings match your current filter selection. Try selecting 'All Roles' or 'All Answers'."
          }
        </p>
      </div>
    `;
    return;
  }

  recordingsListContainer.replaceChildren(
    ...filtered.map((rec) => {
      const card = document.createElement("article");
      card.className = "recording-item-card";

      const ext = rec.fileExtension || determineExtension(rec.mimeType);
      const typeLabel = rec.answerType === "followup" ? "Follow-Up Response" : "Main Response";
      const typeClass = rec.answerType === "followup" ? "type-followup" : "type-main";
      const qNumText = rec.questionId ? `Q${rec.questionId}` : "Practice Round";

      card.innerHTML = `
        <div class="recording-card-header">
          <div class="recording-card-tags">
            <span class="recording-role-pill">${escapeHtml(rec.role || "Practice")}</span>
            <span class="recording-type-pill ${typeClass}">${qNumText} • ${typeLabel}</span>
            <span class="audio-format-badge">${ext.toUpperCase()}</span>
          </div>
          <span class="recording-date-text">${formatRecordingDate(rec.recordingDate)}</span>
        </div>
        <p class="recording-question-quote">"${escapeHtml(rec.questionText)}"</p>
        <div class="recording-playback-row">
          <audio class="recording-audio-ctrl" controls preload="metadata"></audio>
          <div class="recording-card-actions">
            <button type="button" class="btn-audio-subaction btn-download-row" title="Download recording">
              ⬇ Download (.${ext})
            </button>
            <button type="button" class="btn-audio-subaction btn-delete-audio btn-delete-row" title="Delete recording">
              🗑 Delete
            </button>
          </div>
        </div>
      `;

      const audioEl = card.querySelector("audio");
      audioEl.src = URL.createObjectURL(rec.audioBlob);

      card.querySelector(".btn-download-row").onclick = () => triggerAudioDownload(rec);
      card.querySelector(".btn-delete-row").onclick = async () => {
        const confirmed = window.confirm(
          "Are you sure you want to permanently delete this audio recording? This action cannot be undone."
        );
        if (!confirmed) return;

        await deleteRecordingFromDB(rec.id);
        card.remove();
        await updateRecordingsBadge();

        // Check if active question view is displaying this deleted recording
        if (state.sessionId === rec.sessionId) {
          if (rec.answerType === "main" && !questionCard.hidden) {
            mainSavedAudioCard.classList.add("hidden");
          }
          if (rec.answerType === "followup" && !followupCard.hidden) {
            followupSavedAudioCard.classList.add("hidden");
          }
        }
        renderRecordingsList();
      };

      return card;
    })
  );
}

async function updateRecordingsBadge() {
  try {
    const all = await getAllRecordingsFromDB();
    const count = all.length;
    if (navRecordingsCount) navRecordingsCount.textContent = count;
    if (hudRecordingsCount) hudRecordingsCount.textContent = count;
    if (launcherRecordingsCount) launcherRecordingsCount.textContent = count;
    if (recordingsModalBadge) recordingsModalBadge.textContent = count;
    if (summaryTotalRecordingsCount) summaryTotalRecordingsCount.textContent = count;
  } catch (err) {
    console.warn("Could not query recordings count:", err);
  }
}

// Clear All Recordings Handler
clearAllRecordingsBtn?.addEventListener("click", async () => {
  const all = await getAllRecordingsFromDB();
  if (all.length === 0) {
    alert("You have no saved recordings to clear.");
    return;
  }
  const confirmed = window.confirm(
    `Are you sure you want to permanently delete all ${all.length} saved audio recording(s)? This will erase all recorded audio files from this device's IndexedDB.`
  );
  if (!confirmed) return;

  await clearAllRecordingsFromDB();
  mainSavedAudioCard?.classList.add("hidden");
  followupSavedAudioCard?.classList.add("hidden");
  await updateRecordingsBadge();
  await populateRecordingsRoleFilter();
  renderRecordingsList();
  setStatus("All audio recordings have been cleared from this device.", false);
});

// Wire Recordings Modal Open & Filter Handlers
navRecordingsBtn?.addEventListener("click", openRecordingsModal);
hudRecordingsBtn?.addEventListener("click", openRecordingsModal);
launcherRecordingsBtn?.addEventListener("click", openRecordingsModal);
viewAllRecordingsSummaryBtn?.addEventListener("click", openRecordingsModal);

recordingsModalClose?.addEventListener("click", closeRecordingsModal);
recordingsModalDismiss?.addEventListener("click", closeRecordingsModal);

recordingsModal?.addEventListener("click", (e) => {
  if (e.target === recordingsModal) {
    closeRecordingsModal();
  }
});

recordingsFilterRole?.addEventListener("change", renderRecordingsList);
recordingsFilterType?.addEventListener("change", renderRecordingsList);

// Keyboard Shortcut: Ctrl+Enter / Cmd+Enter
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (!questionCard.hidden && !submitMainAnswerBtn.disabled) {
      e.preventDefault();
      submitMainAnswerBtn.click();
    } else if (!followupCard.hidden && !submitFollowupBtn.disabled) {
      e.preventDefault();
      submitFollowupBtn.click();
    }
  }

  if (e.key === "Escape") {
    if (recordingsModal && !recordingsModal.classList.contains("hidden")) {
      closeRecordingsModal();
    } else if (demoModal && !demoModal.classList.contains("hidden")) {
      closeDemoModal();
    }
  }
});

// ==========================================================================
// Editorial Landing Page: Demo Modal & Nav Link Handlers
// ==========================================================================
const demoModal = document.querySelector("#demo-modal");
const viewDemoBtn = document.querySelector("#view-demo-btn");
const demoModalClose = document.querySelector("#demo-modal-close");
const demoModalDismiss = document.querySelector("#demo-modal-dismiss");
const demoModalStart = document.querySelector("#demo-modal-start");
const navStartBtn = document.querySelector("#nav-start-btn");
const navHowItWorks = document.querySelector("#nav-how-it-works");

function openDemoModal() {
  if (!demoModal) return;
  demoModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeDemoModal() {
  if (!demoModal) return;
  demoModal.classList.add("hidden");
  document.body.style.overflow = "";
}

viewDemoBtn?.addEventListener("click", openDemoModal);
demoModalClose?.addEventListener("click", closeDemoModal);
demoModalDismiss?.addEventListener("click", closeDemoModal);

demoModal?.addEventListener("click", (e) => {
  if (e.target === demoModal) {
    closeDemoModal();
  }
});

demoModalStart?.addEventListener("click", () => {
  closeDemoModal();
  const launcher = document.querySelector("#practice-launcher");
  if (launcher) {
    launcher.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  roleSelect?.focus();
});

navStartBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const launcher = document.querySelector("#practice-launcher");
  if (launcher) {
    launcher.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  roleSelect?.focus();
});

navHowItWorks?.addEventListener("click", (e) => {
  e.preventDefault();
  openDemoModal();
});

// Check if URL loaded with #how-it-works or #demo-modal
function checkInitialHash() {
  const hash = window.location.hash.toLowerCase();
  if (hash === "#how-it-works" || hash === "#demo-modal") {
    openDemoModal();
  }
}
window.addEventListener("hashchange", checkInitialHash);
checkInitialHash();

// Ensure initial landing state classes on body
document.body.classList.add("landing-active");
document.body.classList.remove("session-active");

// Initialize Saved Audio Recordings from IndexedDB
updateRecordingsBadge();


