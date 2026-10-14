// Interview Practice Coach - Interactive End-to-End Mock Interview Flow
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Application State
const state = {
  role: "",
  difficulty: "Mid-Level",
  totalQuestions: 5,
  currentQuestionIndex: 0, // 0 to 4
  currentQuestion: "",
  currentAnswer: "",
  currentFollowUp: "",
  currentFollowUpAnswer: "",
  history: [], // { question, answer, followUpQuestion, followUpAnswer, feedback }
  timerInterval: null,
  secondsRemaining: 30,
  activeRecognition: null,
  activeMicBtn: null,
  activeBanner: null,
};

// DOM Elements - Screens
const setupCard = document.querySelector("#setup-card");
const questionCard = document.querySelector("#question-card");
const followupCard = document.querySelector("#followup-card");
const feedbackCard = document.querySelector("#feedback-card");
const finalSummaryCard = document.querySelector("#final-summary-card");
const statusEl = document.querySelector("#status");

// Setup Screen Elements
const roleSelect = document.querySelector("#role-select");
const customRoleInput = document.querySelector("#custom-role-input");
const customRoleLabel = document.querySelector("#custom-role-label");
const difficultySelect = document.querySelector("#difficulty-select");
const startInterviewBtn = document.querySelector("#start-interview-btn");

// Question Screen Elements
const qProgressLabel = document.querySelector("#q-progress-label");
const progressBarFill = document.querySelector("#progress-bar-fill");
const activeRoleBadge = document.querySelector("#active-role-badge");
const activeDiffBadge = document.querySelector("#active-diff-badge");
const endInterviewBtnTop = document.querySelector("#end-interview-btn-top");
const questionHeading = document.querySelector("#question-heading");

// Thinking Timer Elements
const thinkingTimerBox = document.querySelector("#thinking-timer-box");
const timerSeconds = document.querySelector("#timer-seconds");
const timerBarFill = document.querySelector("#timer-bar-fill");
const skipTimerBtn = document.querySelector("#skip-timer-btn");

// Main Answer Elements
const mainMicBtn = document.querySelector("#main-mic-btn");
const mainRecordingBanner = document.querySelector("#main-recording-banner");
const mainStopMicBtn = document.querySelector("#main-stop-mic-btn");
const mainWordCounter = document.querySelector("#main-word-counter");
const mainAnswerInput = document.querySelector("#main-answer-input");
const submitMainAnswerBtn = document.querySelector("#submit-main-answer-btn");
const retryQuestionBtn = document.querySelector("#retry-question-btn");

// Follow-up Screen Elements
const followupStepBadge = document.querySelector("#followup-step-badge");
const recapMainQuestion = document.querySelector("#recap-main-question");
const followupQuestionText = document.querySelector("#followup-question-text");
const followupMicBtn = document.querySelector("#followup-mic-btn");
const followupRecordingBanner = document.querySelector("#followup-recording-banner");
const followupStopMicBtn = document.querySelector("#followup-stop-mic-btn");
const followupWordCounter = document.querySelector("#followup-word-counter");
const followupAnswerInput = document.querySelector("#followup-answer-input");
const submitFollowupBtn = document.querySelector("#submit-followup-btn");
const endInterviewBtnFollowup = document.querySelector("#end-interview-btn-followup");

// 3-Part Feedback Screen Elements
const feedbackStepLabel = document.querySelector("#feedback-step-label");
const feedbackRoleBadge = document.querySelector("#feedback-role-badge");
const feedbackGoodList = document.querySelector("#feedback-good-list");
const feedbackMissingList = document.querySelector("#feedback-missing-list");
const feedbackSampleAnswer = document.querySelector("#feedback-sample-answer");
const nextQuestionBtn = document.querySelector("#next-question-btn");
const retryCurrentQuestionBtn = document.querySelector("#retry-current-question-btn");
const endInterviewBtnFeedback = document.querySelector("#end-interview-btn-feedback");

// Final Summary Screen Elements
const summaryMetaSubtitle = document.querySelector("#summary-meta-subtitle");
const summaryOverviewText = document.querySelector("#summary-overview-text");
const summaryStrengthsList = document.querySelector("#summary-strengths-list");
const summaryImprovementsList = document.querySelector("#summary-improvements-list");
const summarySuggestionText = document.querySelector("#summary-suggestion-text");
const transcriptAccordionContainer = document.querySelector("#transcript-accordion-container");
const restartInterviewBtn = document.querySelector("#restart-interview-btn");

// Helper: HTTP JSON request
async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

function setStatus(message, isError = true) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "var(--accent)" : "var(--good)";
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (label) button.textContent = label;
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
  customRoleLabel.classList.toggle("hidden", !isCustom);
  if (isCustom) customRoleInput.focus();
});

function getSelectedRole() {
  if (roleSelect.value === "custom") {
    return customRoleInput.value.trim();
  }
  return roleSelect.value.trim();
}

// Navigation Helper: Show one screen at a time
function showScreen(screenToShow) {
  const screens = [setupCard, questionCard, followupCard, feedbackCard, finalSummaryCard];
  for (const s of screens) {
    if (s) s.hidden = (s !== screenToShow);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -------------------------------------------------------------
// Voice Recognition (Web Speech API with Graceful Text Fallback)
// -------------------------------------------------------------
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
    if (label) label.textContent = "Answer by Voice";
  }
  if (state.activeBanner) {
    state.activeBanner.classList.add("hidden");
  }
  state.activeMicBtn = null;
  state.activeBanner = null;
}

function toggleVoiceInput(targetTextarea, micBtn, bannerEl, wordCounterEl) {
  // If already recording with this button, stop it
  if (state.activeRecognition && state.activeMicBtn === micBtn) {
    stopActiveVoiceInput();
    setStatus("Voice recording paused. You can edit or continue typing below.", false);
    return;
  }

  // Stop any other active voice input first
  stopActiveVoiceInput();

  // If browser does not support SpeechRecognition, inform gracefully
  if (!SpeechRecognition) {
    setStatus("Voice recognition is not supported in this browser. Please type your answer below.", true);
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
      setStatus("Microphone is active. Speak clearly.", false);
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
      console.warn("Speech recognition event error:", event.error);
      stopActiveVoiceInput();
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setStatus("Microphone permission was denied. You can continue by typing in the box below.", true);
      } else if (event.error === "no-speech") {
        setStatus("No speech was detected. You can speak again or type below.", false);
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
    console.error("SpeechRecognition initialization error:", err);
    stopActiveVoiceInput();
    setStatus("Could not start microphone. Please type your answer below.", true);
  }
}

// Wire up mic buttons
mainMicBtn.addEventListener("click", () => {
  toggleVoiceInput(mainAnswerInput, mainMicBtn, mainRecordingBanner, mainWordCounter);
});
mainStopMicBtn.addEventListener("click", stopActiveVoiceInput);

followupMicBtn.addEventListener("click", () => {
  toggleVoiceInput(followupAnswerInput, followupMicBtn, followupRecordingBanner, followupWordCounter);
});
followupStopMicBtn.addEventListener("click", stopActiveVoiceInput);

// Word counting listeners
mainAnswerInput.addEventListener("input", () => {
  updateWordCounter(mainAnswerInput, mainWordCounter);
});
followupAnswerInput.addEventListener("input", () => {
  updateWordCounter(followupAnswerInput, followupWordCounter);
});

// -------------------------------------------------------------
// Thinking Timer (30 seconds)
// -------------------------------------------------------------
function stopThinkingTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  thinkingTimerBox.classList.remove("timer-active");
  thinkingTimerBox.classList.add("timer-ended");
  timerSeconds.textContent = "0";
  timerBarFill.style.width = "0%";
}

function startThinkingTimer() {
  stopThinkingTimer();
  state.secondsRemaining = 30;
  thinkingTimerBox.classList.remove("timer-ended");
  thinkingTimerBox.classList.add("timer-active");
  timerSeconds.textContent = "30";
  timerBarFill.style.width = "100%";

  state.timerInterval = setInterval(() => {
    state.secondsRemaining--;
    if (state.secondsRemaining < 0) state.secondsRemaining = 0;

    timerSeconds.textContent = String(state.secondsRemaining);
    const pct = (state.secondsRemaining / 30) * 100;
    timerBarFill.style.width = `${pct}%`;

    if (state.secondsRemaining <= 0) {
      stopThinkingTimer();
      setStatus("Thinking time completed! Feel free to record or type your answer.", false);
      mainAnswerInput.focus();
    }
  }, 1000);
}

skipTimerBtn.addEventListener("click", () => {
  stopThinkingTimer();
  mainAnswerInput.focus();
  setStatus("Timer skipped. Take your time to answer.", false);
});

// -------------------------------------------------------------
// STEP 1: START 5-QUESTION INTERVIEW
// -------------------------------------------------------------
startInterviewBtn.addEventListener("click", async () => {
  const role = getSelectedRole();
  if (!role) {
    setStatus("Please choose or enter a job role first.", true);
    roleSelect.focus();
    return;
  }

  state.role = role;
  state.difficulty = difficultySelect.value;
  state.currentQuestionIndex = 0;
  state.history = [];

  setStatus("");
  setBusy(startInterviewBtn, true, "Preparing Question 1 of 5…");

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
    setBusy(startInterviewBtn, false, "Start 5-Question Interview");
  }
});

function renderQuestionScreen(questionNumber, questionText) {
  stopActiveVoiceInput();
  setStatus("");

  qProgressLabel.textContent = `Question ${questionNumber} of ${state.totalQuestions}`;
  const progressPct = (questionNumber / state.totalQuestions) * 100;
  progressBarFill.style.width = `${progressPct}%`;

  activeRoleBadge.textContent = state.role;
  activeDiffBadge.textContent = state.difficulty;
  questionHeading.textContent = questionText;

  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);

  showScreen(questionCard);
  startThinkingTimer();
}

// -------------------------------------------------------------
// STEP 2: SUBMIT MAIN ANSWER -> TRIGGER FOLLOW-UP
// -------------------------------------------------------------
submitMainAnswerBtn.addEventListener("click", async () => {
  const answer = mainAnswerInput.value.trim();
  if (!answer) {
    setStatus("Please type or speak an answer before submitting.", true);
    mainAnswerInput.focus();
    return;
  }

  stopActiveVoiceInput();
  stopThinkingTimer();
  state.currentAnswer = answer;

  setStatus("");
  setBusy(submitMainAnswerBtn, true, "Interviewer is listening & formulating follow-up…");

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
    setBusy(submitMainAnswerBtn, false, "Submit Answer");
  }
});

function renderFollowupScreen() {
  stopActiveVoiceInput();
  setStatus("");

  followupStepBadge.textContent = `Question ${state.currentQuestionIndex + 1} Follow-Up`;
  recapMainQuestion.textContent = `"${state.currentQuestion}"`;
  followupQuestionText.textContent = state.currentFollowUp;

  followupAnswerInput.value = "";
  updateWordCounter(followupAnswerInput, followupWordCounter);

  showScreen(followupCard);
  followupAnswerInput.focus();
}

// Reset/Retry Question button on Main Question screen
retryQuestionBtn.addEventListener("click", () => {
  stopActiveVoiceInput();
  mainAnswerInput.value = "";
  updateWordCounter(mainAnswerInput, mainWordCounter);
  startThinkingTimer();
  setStatus("Question reset. Take your 30 seconds to rethink.", false);
});

// -------------------------------------------------------------
// STEP 3: SUBMIT FOLLOW-UP ANSWER -> GET 3-PART FEEDBACK
// -------------------------------------------------------------
submitFollowupBtn.addEventListener("click", async () => {
  const followUpAnswer = followupAnswerInput.value.trim();
  if (!followUpAnswer) {
    setStatus("Please type or speak your follow-up answer.", true);
    followupAnswerInput.focus();
    return;
  }

  stopActiveVoiceInput();
  state.currentFollowUpAnswer = followUpAnswer;

  setStatus("");
  setBusy(submitFollowupBtn, true, "Evaluating your answers & drafting 3-part feedback…");

  try {
    const feedback = await requestJson("/api/feedback", {
      role: state.role,
      difficulty: state.difficulty,
      question: state.currentQuestion,
      answer: state.currentAnswer,
      followUpQuestion: state.currentFollowUp,
      followUpAnswer: state.currentFollowUpAnswer,
    });

    // Save into history
    state.history.push({
      questionNumber: state.currentQuestionIndex + 1,
      question: state.currentQuestion,
      answer: state.currentAnswer,
      followUpQuestion: state.currentFollowUp,
      followUpAnswer: state.currentFollowUpAnswer,
      feedback,
    });

    renderFeedbackScreen(feedback);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(submitFollowupBtn, false, "Submit & Get 3-Part Feedback");
  }
});

function renderFeedbackScreen(feedback) {
  stopActiveVoiceInput();
  setStatus("");

  const qNum = state.currentQuestionIndex + 1;
  feedbackStepLabel.textContent = `Question ${qNum} of ${state.totalQuestions} Feedback`;
  feedbackRoleBadge.textContent = `${state.role} • ${state.difficulty}`;

  // 1. What Was Good
  feedbackGoodList.replaceChildren(
    ...(feedback.whatWasGood || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // 2. What Was Missing
  feedbackMissingList.replaceChildren(
    ...(feedback.whatWasMissing || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // 3. Stronger Sample Answer
  feedbackSampleAnswer.textContent = feedback.strongerSampleAnswer || "Sample answer unavailable.";

  // Update Next Question button text if on final question
  if (state.currentQuestionIndex >= state.totalQuestions - 1) {
    nextQuestionBtn.textContent = "Finish & View Final Summary 🎯";
  } else {
    nextQuestionBtn.textContent = `Next Question (${state.currentQuestionIndex + 2} of 5) →`;
  }

  showScreen(feedbackCard);
}

// Retry this question from feedback screen
retryCurrentQuestionBtn.addEventListener("click", () => {
  // Remove the last recorded entry if retrying
  if (state.history.length > state.currentQuestionIndex) {
    state.history.pop();
  }
  renderQuestionScreen(state.currentQuestionIndex + 1, state.currentQuestion);
});

// -------------------------------------------------------------
// STEP 4: NEXT QUESTION OR COMPLETE SESSION
// -------------------------------------------------------------
nextQuestionBtn.addEventListener("click", async () => {
  // If we just finished question 5 (index 4), proceed to Final Summary
  if (state.currentQuestionIndex >= state.totalQuestions - 1) {
    await completeInterviewSession();
    return;
  }

  // Otherwise, load next question
  state.currentQuestionIndex++;
  const nextQNum = state.currentQuestionIndex + 1;

  setStatus("");
  setBusy(nextQuestionBtn, true, `Loading Question ${nextQNum} of 5…`);

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
    state.currentQuestionIndex--; // Revert index on error
  } finally {
    setBusy(nextQuestionBtn, false, `Next Question (${state.currentQuestionIndex + 2} of 5) →`);
  }
});

// -------------------------------------------------------------
// STEP 5: FINAL 5-QUESTION SUMMARY REPORT
// -------------------------------------------------------------
async function completeInterviewSession() {
  if (state.history.length === 0) {
    showScreen(setupCard);
    return;
  }

  setStatus("Compiling your comprehensive mock interview coaching report…", false);

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

  summaryMetaSubtitle.textContent = `${state.role} • ${state.difficulty} • ${state.history.length} Questions Completed`;
  summaryOverviewText.textContent = summary.overview || "Session complete.";

  // Overall Strengths
  summaryStrengthsList.replaceChildren(
    ...(summary.overallStrengths || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // Key Improvement Areas
  summaryImprovementsList.replaceChildren(
    ...(summary.improvementAreas || []).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  // Recommended Next Practice
  summarySuggestionText.textContent = summary.nextPracticeSuggestion || "Continue practicing structured responses.";

  // Render question-by-question review accordion
  transcriptAccordionContainer.replaceChildren(
    ...state.history.map((item, idx) => {
      const details = document.createElement("details");
      details.className = "accordion-item";
      if (idx === 0) details.open = true;

      const summaryTag = document.createElement("summary");
      summaryTag.className = "accordion-summary";
      summaryTag.innerHTML = `
        <span>Question ${idx + 1}: ${escapeHtml(item.question.slice(0, 75))}…</span>
        <span class="badge">Review</span>
      `;

      const content = document.createElement("div");
      content.className = "accordion-content";
      content.innerHTML = `
        <h4>Interview Question</h4>
        <p><strong>${escapeHtml(item.question)}</strong></p>

        <h4>Your Answer</h4>
        <p>${escapeHtml(item.answer)}</p>

        ${
          item.followUpQuestion
            ? `
          <h4>Follow-Up Question</h4>
          <p><strong>${escapeHtml(item.followUpQuestion)}</strong></p>
          <h4>Your Follow-Up Answer</h4>
          <p>${escapeHtml(item.followUpAnswer || "None")}</p>
        `
            : ""
        }

        <h4>Exemplary Sample Answer</h4>
        <p class="sample-answer-content">${escapeHtml(item.feedback?.strongerSampleAnswer || "")}</p>
      `;

      details.append(summaryTag, content);
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

// -------------------------------------------------------------
// END INTERVIEW CONTROLS (Early Exit Handling)
// -------------------------------------------------------------
function confirmEndInterview() {
  stopActiveVoiceInput();
  stopThinkingTimer();

  if (state.history.length === 0) {
    if (confirm("End this interview session and return to the setup screen?")) {
      showScreen(setupCard);
    }
    return;
  }

  if (
    confirm(
      `You have completed ${state.history.length} question(s). Would you like to end early and generate your coaching summary now?`
    )
  ) {
    completeInterviewSession();
  }
}

endInterviewBtnTop?.addEventListener("click", confirmEndInterview);
endInterviewBtnFollowup?.addEventListener("click", confirmEndInterview);
endInterviewBtnFeedback?.addEventListener("click", confirmEndInterview);

restartInterviewBtn?.addEventListener("click", () => {
  stopActiveVoiceInput();
  stopThinkingTimer();
  state.history = [];
  state.currentQuestionIndex = 0;
  showScreen(setupCard);
});

// Keyboard Shortcut: Ctrl+Enter / Cmd+Enter to submit active answer
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
