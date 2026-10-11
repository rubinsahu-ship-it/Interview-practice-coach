const roleSelect = document.querySelector("#role");
const customRole = document.querySelector("#custom-role");
const customRoleLabel = document.querySelector("#custom-role-label");
const askBtn = document.querySelector("#ask-btn");
const feedbackBtn = document.querySelector("#feedback-btn");
const newQuestionBtn = document.querySelector("#new-question-btn");
const retryBtn = document.querySelector("#retry-btn");
const nextRoleBtn = document.querySelector("#next-role-btn");
const questionCard = document.querySelector("#question-card");
const feedbackCard = document.querySelector("#feedback-card");
const activeRoleBadge = document.querySelector("#active-role-badge");
const questionEl = document.querySelector("#question");
const answerEl = document.querySelector("#answer");
const wordCounterEl = document.querySelector("#word-counter");
const summaryEl = document.querySelector("#summary");
const rubricEl = document.querySelector("#rubric");
const strengthsEl = document.querySelector("#strengths");
const improvementsEl = document.querySelector("#improvements");
const statusEl = document.querySelector("#status");

const RUBRIC_LABELS = {
  clarity: "Clarity",
  structure: "Structure",
  relevance: "Relevance",
  examples: "Examples",
};

function selectedRole() {
  if (roleSelect.value === "custom") {
    return customRole.value.trim();
  }
  return roleSelect.value.trim();
}

function setStatus(message, isError = true) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "var(--accent-dark)" : "var(--good)";
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function updateWordCount() {
  const text = answerEl.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  wordCounterEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
}

answerEl.addEventListener("input", updateWordCount);

answerEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (!feedbackBtn.disabled) {
      feedbackBtn.click();
    }
  }
});

roleSelect.addEventListener("change", () => {
  const isCustom = roleSelect.value === "custom";
  customRole.classList.toggle("hidden", !isCustom);
  customRoleLabel.classList.toggle("hidden", !isCustom);
  if (isCustom) {
    customRole.focus();
  }
});

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

askBtn.addEventListener("click", async () => {
  const role = selectedRole();
  if (!role) {
    setStatus("Please choose or enter a job role first.");
    return;
  }

  setStatus("");
  setBusy(askBtn, true, "Asking Gemini…");
  feedbackCard.hidden = true;
  answerEl.value = "";
  updateWordCount();

  try {
    const data = await requestJson("/api/question", { role });
    questionEl.textContent = data.question;
    activeRoleBadge.textContent = role;
    questionCard.hidden = false;
    questionCard.dataset.role = role;
    questionCard.dataset.question = data.question;

    setTimeout(() => {
      questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
      answerEl.focus();
    }, 100);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(askBtn, false, "Ask me a question");
  }
});

newQuestionBtn.addEventListener("click", () => {
  askBtn.click();
});

function renderScorePips(score) {
  const safeScore = Math.max(1, Math.min(5, Number(score) || 1));
  let html = '<span class="score-pips" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="pip ${i <= safeScore ? "filled" : ""}"></span>`;
  }
  html += "</span>";
  return html;
}

feedbackBtn.addEventListener("click", async () => {
  const role = questionCard.dataset.role;
  const question = questionCard.dataset.question;
  const answer = answerEl.value.trim();

  if (!answer) {
    setStatus("Type an answer before requesting feedback.");
    answerEl.focus();
    return;
  }

  setStatus("");
  setBusy(feedbackBtn, true, "Evaluating with Gemini…");

  try {
    const data = await requestJson("/api/feedback", { role, question, answer });
    summaryEl.textContent = data.summary;
    rubricEl.innerHTML = "";

    for (const [key, item] of Object.entries(data.rubric || {})) {
      const block = document.createElement("article");
      block.className = "rubric-item";
      block.innerHTML = `
        <header>
          <div class="rubric-header-left">
            <h3>${RUBRIC_LABELS[key] || key}</h3>
            ${renderScorePips(item.score)}
          </div>
          <span class="score">${item.score} / 5</span>
        </header>
        <p></p>
      `;
      block.querySelector("p").textContent = item.comment;
      rubricEl.append(block);
    }

    strengthsEl.replaceChildren(
      ...(data.strengths || []).map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      })
    );
    improvementsEl.replaceChildren(
      ...(data.improvements || []).map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      })
    );

    feedbackCard.hidden = false;
    setTimeout(() => {
      feedbackCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(feedbackBtn, false, "Get rubric feedback");
  }
});

retryBtn?.addEventListener("click", () => {
  questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  answerEl.focus();
});

nextRoleBtn?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  roleSelect.focus();
});
