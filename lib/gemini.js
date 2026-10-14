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
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

export async function generateJson(prompt, schema) {
  const apiKey = getApiKey();
  const primaryModel = getModel();
  const modelsToTry = [primaryModel];
  if (!modelsToTry.includes("gemini-flash-latest")) {
    modelsToTry.push("gemini-flash-latest");
  }
  if (!modelsToTry.includes("gemini-3.8-flash")) {
    modelsToTry.push("gemini-3.8-flash");
  }

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

        // If 503 (high demand) or 429, try waiting or next model
        if (response.status === 503 || response.status === 429) {
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break; // move to next model in modelsToTry
        }

        // If 404 (model deprecated/unavailable), immediately move to next model
        if (response.status === 404) {
          break;
        }

        throw lastError;
      } catch (err) {
        lastError = err;
        if (attempt === 1 && (err.status === 503 || err.status === 429)) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        break;
      }
    }
  }

  const error = lastError || new Error("Failed to generate content with Gemini.");
  error.status = error.status || 502;
  throw error;
}

export async function askQuestion(role) {
  const data = await generateJson(
    [
      `You are an experienced interviewer for the role: ${role}.`,
      "Ask exactly one interview question a candidate would likely get in a real interview.",
      "Make it specific to the role, open-ended, and answerable in a few paragraphs.",
      "Do not include hints, follow-ups, or an ideal answer.",
      "Return JSON only.",
    ].join(" "),
    {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    }
  );

  const question = String(data.question || "").trim();
  if (!question) {
    const error = new Error("Gemini did not return a question.");
    error.status = 502;
    throw error;
  }
  return question;
}

export async function scoreFeedback({ role, question, answer }) {
  const data = await generateJson(
    [
      "You are an interview coach, not a hiring manager.",
      `Job role: ${role}`,
      `Interview question: ${question}`,
      `Candidate answer: ${answer}`,
      "Score the answer on these four rubric dimensions only: clarity, structure, relevance, examples.",
      "Each score is an integer from 1 to 5.",
      "clarity: is the answer easy to follow?",
      "structure: does it have a beginning, middle, and end?",
      "relevance: does it actually answer the question for this role?",
      "examples: does it use concrete details or stories?",
      "Give a short comment for each dimension, 2-4 strengths, and 2-4 improvements.",
      "Do not give a hiring score, overall score, pass/fail, or hire/no-hire recommendation.",
      "Return JSON only.",
    ].join("\n"),
    {
      type: "object",
      properties: {
        summary: { type: "string" },
        rubric: {
          type: "object",
          properties: Object.fromEntries(
            RUBRIC.map((key) => [
              key,
              {
                type: "object",
                properties: {
                  score: { type: "integer" },
                  comment: { type: "string" },
                },
                required: ["score", "comment"],
              },
            ])
          ),
          required: RUBRIC,
        },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "rubric", "strengths", "improvements"],
    }
  );

  const rubric = {};
  for (const key of RUBRIC) {
    const item = data.rubric?.[key] || {};
    rubric[key] = {
      score: Math.min(5, Math.max(1, Number(item.score) || 1)),
      comment: String(item.comment || "").trim() || "No comment provided.",
    };
  }

  return {
    summary: String(data.summary || "").trim(),
    rubric,
    strengths: Array.isArray(data.strengths) ? data.strengths.map(String) : [],
    improvements: Array.isArray(data.improvements)
      ? data.improvements.map(String)
      : [],
  };
}
