import { askFollowUp } from "../lib/gemini.js";

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendResponse(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendResponse(res, 405, { error: "Method not allowed. Use POST." });
  }

  try {
    const body = await parseBody(req);
    const role = String(body.role || "").trim();
    const difficulty = String(body.difficulty || "Mid-Level").trim();
    const question = String(body.question || "").trim();
    const answer = String(body.answer || "").trim();

    if (!role || !question || !answer) {
      return sendResponse(res, 400, {
        error: "Role, question, and answer are required.",
      });
    }

    const followUpQuestion = await askFollowUp({ role, difficulty, question, answer });
    return sendResponse(res, 200, { followUpQuestion });
  } catch (error) {
    console.error("API /api/followup error:", error);
    const status = error.status || 500;
    return sendResponse(res, status, {
      error: error.message || "Failed to generate follow-up question.",
    });
  }
}
