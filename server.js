import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const RUBRIC = ["clarity", "structure", "relevance", "examples"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

await loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/question") {
      const body = await readJsonBody(req);
      const role = String(body.role || "").trim();
      if (!role) {
        return sendJson(res, 400, { error: "Choose a job role first." });
      }

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
        return sendJson(res, 502, { error: "Gemini did not return a question." });
      }
      return sendJson(res, 200, { question });
    }

    if (req.method === "POST" && url.pathname === "/api/feedback") {
      const body = await readJsonBody(req);
      const role = String(body.role || "").trim();
      const question = String(body.question || "").trim();
      const answer = String(body.answer || "").trim();

      if (!role || !question || !answer) {
        return sendJson(res, 400, {
          error: "Role, question, and answer are required.",
        });
      }

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

      return sendJson(res, 200, {
        summary: String(data.summary || "").trim(),
        rubric,
        strengths: Array.isArray(data.strengths) ? data.strengths.map(String) : [],
        improvements: Array.isArray(data.improvements)
          ? data.improvements.map(String)
          : [],
      });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res, url.pathname);
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    sendJson(res, status, { error: error.message || "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Interview practice coach running at http://localhost:${PORT}`);
});

async function loadEnv(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    const error = new Error("Missing GEMINI_API_KEY. Add it to your .env file.");
    error.status = 500;
    throw error;
  }
  return key;
}

async function generateJson(prompt, schema) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey(),
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message || `Gemini request failed (${response.status}).`;
    const error = new Error(message);
    error.status = 502;
    throw error;
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  return parseJson(text);
}

function parseJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : raw);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body.");
    error.status = 400;
    throw error;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    const contents = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": contents.length,
    });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}
