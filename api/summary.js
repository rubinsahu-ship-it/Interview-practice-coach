import { generateInterviewSummary } from "../lib/gemini.js";

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
    const history = Array.isArray(body.history) ? body.history : [];

    if (!role || history.length === 0) {
      return sendResponse(res, 400, {
        error: "Role and at least one completed question history are required.",
      });
    }

    const summary = await generateInterviewSummary({ role, difficulty, history });
    return sendResponse(res, 200, summary);
  } catch (error) {
    console.error("API /api/summary error:", error);
    const status = error.status || 500;
    return sendResponse(res, status, {
      error: error.message || "Failed to generate interview summary.",
    });
  }
}
