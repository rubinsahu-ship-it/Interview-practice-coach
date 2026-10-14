import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askQuestion, scoreFeedback } from "./lib/gemini.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/question") {
      const body = await readJsonBody(req);
      const role = String(body.role || "").trim();
      if (!role) {
        return sendJson(res, 400, { error: "Choose a job role first." });
      }

      const question = await askQuestion(role);
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

      const feedback = await scoreFeedback({ role, question, answer });
      return sendJson(res, 200, feedback);
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
