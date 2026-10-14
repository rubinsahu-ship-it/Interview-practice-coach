// Interview Arena — Gamified Quiz-Style Interview Practice Coach
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Application & Game State
const state = {
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
  timerInterval: null,
  secondsRemaining: 30,
  activeRecognition: null,
  activeMicBtn: null,
  activeBanner: null,
};

// SVG Timer circumference: 2 * PI * 42 ~= 263.89
const TIMER_CIRCUMFERENCE = 263.89;

// DOM Elements - Screens & HUD
const gameHud = document.querySelector("#game-hud");
const hudQVal = document.querySelector("#hud-q-val");
const hudRoleName = document.querySelector("#hud-role-name");
const hudDiffBadge = document.querySelector("#hud-diff-badge");
const hudStreakVal = document.querySelector("#hud-streak-val");
const hudStreakChip = document.querySelector("#hud-streak-chip");
const hudXpVal = document.querySelector("#hud-xp-val");
const hudQuitBtn = document.querySelector("#hud-quit-btn");

const setupCard = document.querySelector("#setup-card");
const questionCard = document.querySelector("#question-card");
const followupCard = document.querySelector("#followup-card");
const feedbackCard = document.querySelector("#feedback-card");
const finalSummaryCard = document.querySelector("#final-summary-card");
const statusEl = document.querySelector("#status");
const confettiCanvas = document.querySelector("#confetti-canvas");

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

// Countdown Timer Elements
const thinkingTimerBox = document.querySelector("#thinking-timer-box");
const timerSvgCircle = document.querySelector("#timer-svg-circle");
const timerSeconds = document.querySelector("#timer-seconds");
const skipTimerBtn = document.querySelector("#skip-timer-btn");

// Main Answer Elements
const mainMicBtn = document.querySelector("#main-mic-btn");
const mainRecordingBanner = document.querySelector("#main-recording-banner");
const mainStopMicBtn = document.querySelector("#main-stop-mic-btn");
const mainWordCounter = document.querySelector("#main-word-counter");
const mainAnswerInput = document.querySelector("#main-answer-input");
const submitMainAnswerBtn = document.querySelector("#submit-main-answer-btn");
const retryQuestionBtn = document.querySelector("#retry-question-btn");

// Follow-up Screen
const followupRecapQnum = document.querySelector("#followup-recap-qnum");
const recapMainQuestion = document.querySelector("#recap-main-question");
const followupQuestionText = document.querySelector("#followup-question-text");
const followupMicBtn = document.querySelector("#followup-mic-btn");
const followupRecordingBanner = document.querySelector("#followup-recording-banner");
const followupStopMicBtn = document.querySelector("#followup-stop-mic-btn");
const followupWordCounter = document.querySelector("#followup-word-counter");
const followupAnswerInput = document.querySelector("#followup-answer-input");
const submitFollowupBtn = document.querySelector("#submit-followup-btn");

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
const transcriptAccordionContainer = document.querySelector("#transcript-accordion-container");
const restartInterviewBtn = document.querySelector("#restart-interview-btn");

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
  const screens = [setupCard, questionCard, followupCard, feedbackCard, finalSummaryCard];
  screens.forEach((s) => {
    if (s) s.hidden = (s !== screenToShow);
  });

  const inQuiz = screenToShow !== setupCard;
  gameHud.classList.toggle("hidden", !inQuiz);

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
// Web Speech API Voice Input (With Graceful Fallback)
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
    if (label) label.textContent = "Answer with Voice";
  }
  if (state.activeBanner) {
    state.activeBanner.classList.add("hidden");
  }
  state.activeMicBtn = null;
  state.activeBanner = null;
}

function toggleVoiceInput(targetTextarea, micBtn, bannerEl, wordCounterEl) {
  if (state.activeRecognition && state.activeMicBtn === micBtn) {
    stopActiveVoiceInput();
    setStatus("Voice recording paused. You can edit or continue typing below.", false);
    return;
  }

  stopActiveVoiceInput();

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not supported in this browser. Please type your answer below.", true);
    targetTextarea.focus();
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let initialText = targetTextarea.value;
    if (initialText && !initialText.endsWith(" ")) {
      initialText += " ";
    }

    recognition.onstart = () => {
      state.activeRecognition = recognition;
      state.activeMicBtn = micBtn;
      state.activeBanner = bannerEl;
      micBtn.classList.add("recording");
      const label = micBtn.querySelector(".mic-text");
      if (label) label.textContent = "Recording… (Click to Stop)";
      bannerEl.classList.remove("hidden");
      setStatus("Microphone active! Speak clearly.", false);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      targetTextarea.value = (initialText + finalTranscript).trim();
      updateWordCounter(targetTextarea, wordCounterEl);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      stopActiveVoiceInput();
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setStatus("Microphone permission denied. You can continue by typing in the box below.", true);
      } else if (event.error === "no-speech") {
        setStatus("No speech detected. Speak again or type your answer below.", false);
      } else {
        setStatus("Voice input encountered an error. Text input is ready.", false);
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

mainMicBtn.addEventListener("click", () => {
  toggleVoiceInput(mainAnswerInput, mainMicBtn, mainRecordingBanner, mainWordCounter);
});
mainStopMicBtn.addEventListener("click", stopActiveVoiceInput);

followupMicBtn.addEventListener("click", () => {
  toggleVoiceInput(followupAnswerInput, followupMicBtn, followupRecordingBanner, followupWordCounter);
});
followupStopMicBtn.addEventListener("click", stopActiveVoiceInput);

mainAnswerInput.addEventListener("input", () => updateWordCounter(mainAnswerInput, mainWordCounter));
followupAnswerInput.addEventListener("input", () => updateWordCounter(followupAnswerInput, followupWordCounter));

// ==========================================================================
// 30-Second Countdown Timer (Circular SVG Animation)
// ==========================================================================
function updateSvgTimer(seconds) {
  timerSeconds.textContent = seconds;
  const fraction = (30 - seconds) / 30;
  const offset = TIMER_CIRCUMFERENCE * fraction;
  timerSvgCircle.style.strokeDashoffset = offset;

  if (seconds <= 10) {
    timerSvgCircle.classList.add("urgent");
  } else {
    timerSvgCircle.classList.remove("urgent");
  }
}

function stopThinkingTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  thinkingTimerBox.classList.remove("timer-pulse");
  updateSvgTimer(0);
}

function startThinkingTimer() {
  stopThinkingTimer();
  state.secondsRemaining = 30;
  thinkingTimerBox.classList.add("timer-pulse");
  updateSvgTimer(30);

  state.timerInterval = setInterval(() => {
    state.secondsRemaining--;
    if (state.secondsRemaining < 0) state.secondsRemaining = 0;

    updateSvgTimer(state.secondsRemaining);

    if (state.secondsRemaining <= 0) {
      stopThinkingTimer();
      setStatus("Thinking time up! Speak or type your answer.", false);
      mainAnswerInput.focus();
    }
  }, 1000);
}

skipTimerBtn.addEventListener("click", () => {
  stopThinkingTimer();
  mainAnswerInput.focus();
  setStatus("Timer skipped! Ready when you are.", false);
});

// ==========================================================================
// SCREEN 1 -> SCREEN 2: START CHALLENGE
// ==========================================================================
startInterviewBtn.addEventListener("click", async () => {
  const role = getSelectedRole();
  if (!role) {
    setStatus("Choose or type a job role first!", true);
    roleSelect.focus();
    return;
  }

  state.role = role;
  state.difficulty = difficultyInput.value;
  state.currentQuestionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.history = [];

  setStatus("");
  setBusy(startInterviewBtn, true, "ENTERING ARENA…");

  try {
    const data = await requestJson("/api/question", {
      role: state.role,
      difficulty: state.difficulty,
      questionNumber: 1,
      previousQuestions: [],
    });

    state.currentQuestion = data.question;
    renderQuestionScreen(1, data.question);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(startInterviewBtn, false, "START CHALLENGE ➔");
  }
});

function renderQuestionScreen(qNum, questionText) {
  stopActiveVoiceInput();
  setStatus("");

  qRoundLabel.textContent = `ROUND ${qNum} OF ${state.totalQuestions}`;
  const progressPct = (qNum / state.totalQuestions) * 100;
  progressBarFill.style.width = `${progressPct}%`;

  questionHeading.textContent = questionText;
  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);

  updateHud(qNum);
  showScreen(questionCard);
  startThinkingTimer();
}

// ==========================================================================
// SCREEN 2 -> SCREEN 3: SUBMIT ANSWER -> GENERATE FOLLOW-UP
// ==========================================================================
submitMainAnswerBtn.addEventListener("click", async () => {
  const answer = mainAnswerInput.value.trim();
  if (!answer) {
    setStatus("Please speak or type an answer first!", true);
    mainAnswerInput.focus();
    return;
  }

  stopActiveVoiceInput();
  stopThinkingTimer();
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
    renderFollowupScreen();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(submitMainAnswerBtn, false, "SUBMIT ANSWER ➔");
  }
});

function renderFollowupScreen() {
  stopActiveVoiceInput();
  setStatus("");

  const qNum = state.currentQuestionIndex + 1;
  followupRecapQnum.textContent = qNum;
  recapMainQuestion.textContent = `"${state.currentAnswer}"`;
  followupQuestionText.textContent = state.currentFollowUp;

  followupAnswerInput.value = "";
  updateWordCounter(followupAnswerInput, followupWordCounter);

  updateHud(qNum);
  showScreen(followupCard);
  followupAnswerInput.focus();
}

retryQuestionBtn.addEventListener("click", () => {
  stopActiveVoiceInput();
  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);
  startThinkingTimer();
  setStatus("Question reset. Take 30 seconds to rethink!", false);
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

retryCurrentQuestionBtn.addEventListener("click", () => {
  if (state.history.length > state.currentQuestionIndex) {
    const last = state.history.pop();
    state.score = Math.max(0, state.score - (last?.roundPoints || 200));
    state.streak = Math.max(0, state.streak - 1);
  }
  renderQuestionScreen(state.currentQuestionIndex + 1, state.currentQuestion);
});

// ==========================================================================
// SCREEN 4 -> SCREEN 5: ADVANCE TO NEXT QUESTION OR PODIUM
// ==========================================================================
nextQuestionBtn.addEventListener("click", async () => {
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
    renderQuestionScreen(nextQNum, data.question);
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

    renderFinalSummary(summary);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderFinalSummary(summary) {
  stopActiveVoiceInput();
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
  stopThinkingTimer();

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
  stopThinkingTimer();
  state.history = [];
  state.currentQuestionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  showScreen(setupCard);
});

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
});
