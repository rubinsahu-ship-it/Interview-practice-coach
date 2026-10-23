export const RUBRIC = ["clarity", "structure", "relevance", "examples"];

export function getApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    const error = new Error("Missing GEMINI_API_KEY. Add it to your environment variables or .env file.");
    error.status = 500;
    throw error;
  }
  return key;
}

export function getModel() {
  return process.env.GEMINI_MODEL || "gemini-3-flash-preview";
}

export async function generateJson(prompt, schema) {
  const apiKey = getApiKey();
  const primaryModel = getModel();
  const candidateModels = [
    primaryModel,
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ];
  const modelsToTry = [...new Set(candidateModels)];

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  let lastError;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(15000),
        });

        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          const text = payload?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();
          const raw = String(text || "").trim();
          const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
          return JSON.parse(fenced ? fenced[1] : raw);
        }

        const message =
          payload?.error?.message || `Gemini request failed (${response.status}).`;
        lastError = new Error(message);
        lastError.status = response.status;

        // If daily quota exceeded or model not found, immediately advance to the next model
        if (response.status === 404 || (response.status === 429 && message.toLowerCase().includes("quota"))) {
          break;
        }

        // If transient 503 (high demand) or short rate limit, retry once then try next model
        if (response.status === 503 || response.status === 429) {
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break;
        }

        throw lastError;
      } catch (err) {
        lastError = err;
        break;
      }
    }
  }

  const error = lastError || new Error("Failed to generate content with Gemini.");
  error.status = error.status || 502;
  throw error;
}

export async function askQuestion(params) {
  const role = typeof params === "string" ? params : String(params?.role || "").trim();
  const difficulty = typeof params === "object" ? String(params?.difficulty || "Mid-Level").trim() : "Mid-Level";
  const questionNumber = typeof params === "object" ? Number(params?.questionNumber) || 1 : 1;
  const previousQuestions = (typeof params === "object" && Array.isArray(params?.previousQuestions))
    ? params.previousQuestions.filter(Boolean)
    : [];

  const promptParts = [
    `You are an experienced interviewer conducting a 5-question mock interview for the role: ${role}.`,
    `Target Difficulty: ${difficulty}.`,
    `This is question ${questionNumber} of 5.`,
    difficulty === "Entry-Level"
      ? "Calibrate for entry-level candidates: focus on fundamentals, practical problem-solving, learning capacity, and project execution."
      : difficulty === "Senior / Lead"
      ? "Calibrate for senior/lead candidates: focus on architecture/strategy, leadership, complex trade-offs, cross-team impact, and ambiguity."
      : "Calibrate for mid-level candidates: focus on independent ownership, technical depth, system trade-offs, and collaboration.",
    previousQuestions.length > 0
      ? `Do NOT ask about topics already covered in previous questions: "${previousQuestions.join('; ')}".`
      : "",
    "Ask exactly one realistic, open-ended interview question.",
    "Do not include hints, follow-ups, or an ideal answer in the question.",
    "Return JSON only.",
  ].filter(Boolean).join(" ");

  const data = await generateJson(promptParts, {
    type: "object",
    properties: { question: { type: "string" } },
    required: ["question"],
  });

  const question = String(data.question || "").trim();
  if (!question) {
    const error = new Error("Gemini did not return an interview question.");
    error.status = 502;
    throw error;
  }
  return question;
}

export async function askFollowUp({ role, difficulty = "Mid-Level", question, answer }) {
  const prompt = [
    `You are an expert interviewer for the role: ${role} (${difficulty}).`,
    `Initial interview question: "${question}"`,
    `Candidate's answer: "${answer}"`,
    "Generate exactly ONE sharp, realistic follow-up question directly based on what the candidate just answered.",
    "The follow-up should probe deeper into a specific point they made, such as a trade-off, edge case, measurable outcome, architectural decision, or how they handled a challenge.",
    "Keep it concise (1-2 sentences), conversational, and challenging yet professional.",
    "Do not provide hints or answers.",
    "Return JSON only.",
  ].join("\n");

  const data = await generateJson(prompt, {
    type: "object",
    properties: { followUpQuestion: { type: "string" } },
    required: ["followUpQuestion"],
  });

  const followUpQuestion = String(data.followUpQuestion || "").trim();
  if (!followUpQuestion) {
    const error = new Error("Gemini did not return a follow-up question.");
    error.status = 502;
    throw error;
  }
  return followUpQuestion;
}

export async function scoreFeedback({
  role,
  difficulty = "Mid-Level",
  question,
  answer,
  followUpQuestion = "",
  followUpAnswer = "",
}) {
  const prompt = [
    "You are an expert interview coach providing constructive feedback on a mock interview question.",
    `Job role: ${role} (${difficulty})`,
    `Main interview question: "${question}"`,
    `Candidate answer: "${answer}"`,
    followUpQuestion ? `Follow-up question asked: "${followUpQuestion}"` : "",
    followUpAnswer ? `Candidate follow-up answer: "${followUpAnswer}"` : "",
    "Provide coaching feedback structured strictly into these 3 parts:",
    "1. whatWasGood: 2 to 4 bullet points detailing specific strengths (clarity, structure, technical insights, or relevant examples).",
    "2. whatWasMissing: 2 to 4 bullet points detailing specific gaps, missing context, skipped trade-offs, lack of quantifiable results, or unaddressed follow-up details.",
    "3. strongerSampleAnswer: A high-impact, polished sample answer (2-3 concise paragraphs) showing how an exemplary candidate would answer the core question and handle the follow-up.",
    "Do NOT give a hiring score, overall score, pass/fail, or hire/no-hire decision. Keep the tone encouraging, professional, and actionable.",
    "Do NOT judge, evaluate, or penalize answers based on speed, answering pace, or time taken. Practice is untimed and self-paced; evaluate purely on content quality, depth, and relevance.",
    "Return JSON only.",
  ].filter(Boolean).join("\n");

  const data = await generateJson(prompt, {
    type: "object",
    properties: {
      whatWasGood: {
        type: "array",
        items: { type: "string" },
        description: "2-4 strengths",
      },
      whatWasMissing: {
        type: "array",
        items: { type: "string" },
        description: "2-4 areas missing or needing improvement",
      },
      strongerSampleAnswer: {
        type: "string",
        description: "Exemplary model answer",
      },
    },
    required: ["whatWasGood", "whatWasMissing", "strongerSampleAnswer"],
  });

  return {
    whatWasGood: Array.isArray(data.whatWasGood)
      ? data.whatWasGood.map((s) => String(s).trim()).filter(Boolean)
      : [],
    whatWasMissing: Array.isArray(data.whatWasMissing)
      ? data.whatWasMissing.map((s) => String(s).trim()).filter(Boolean)
      : [],
    strongerSampleAnswer: String(data.strongerSampleAnswer || "").trim(),
  };
}

export async function generateInterviewSummary({ role, difficulty = "Mid-Level", history = [] }) {
  const formattedHistory = history.map((item, idx) => {
    return [
      `Question ${idx + 1}: ${item.question}`,
      `Answer: ${item.answer}`,
      item.followUpQuestion ? `Follow-up: ${item.followUpQuestion}` : "",
      item.followUpAnswer ? `Follow-up Answer: ${item.followUpAnswer}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n---\n");

  const prompt = [
    `You are a senior interview coach summarizing a complete 5-question mock interview for a ${role} (${difficulty}) candidate.`,
    "Here is the candidate's interview transcript across all questions:",
    formattedHistory,
    "Synthesize the candidate's overall performance into a constructive coaching summary:",
    "1. overview: 2-3 sentences summarizing their communication style, domain grasp, and general readiness.",
    "2. overallStrengths: 3 to 5 persistent strengths shown across the interview session.",
    "3. improvementAreas: 3 to 5 key high-impact areas to work on (e.g. structuring answers with STAR, quantifying impact, stating trade-offs proactively).",
    "4. nextPracticeSuggestion: 2-3 sentences offering concrete advice on what topics, frameworks, or scenarios they should rehearse next.",
    "CRITICAL RULE: Do NOT give a hiring or rejection score, pass/fail result, or hire/no-hire recommendation. Focus purely on coaching.",
    "CRITICAL RULE: Do NOT judge, evaluate, or penalize the candidate based on speed, answering pace, or time taken. Practice is untimed and self-paced; evaluate purely on communication quality, depth, and structure.",
    "Return JSON only.",
  ].join("\n\n");

  const data = await generateJson(prompt, {
    type: "object",
    properties: {
      overview: { type: "string" },
      overallStrengths: { type: "array", items: { type: "string" } },
      improvementAreas: { type: "array", items: { type: "string" } },
      nextPracticeSuggestion: { type: "string" },
    },
    required: ["overview", "overallStrengths", "improvementAreas", "nextPracticeSuggestion"],
  });

  return {
    overview: String(data.overview || "").trim(),
    overallStrengths: Array.isArray(data.overallStrengths)
      ? data.overallStrengths.map((s) => String(s).trim()).filter(Boolean)
      : [],
    improvementAreas: Array.isArray(data.improvementAreas)
      ? data.improvementAreas.map((s) => String(s).trim()).filter(Boolean)
      : [],
    nextPracticeSuggestion: String(data.nextPracticeSuggestion || "").trim(),
  };
}
