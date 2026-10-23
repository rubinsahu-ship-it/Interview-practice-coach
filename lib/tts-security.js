// lib/tts-security.js — Request Validation, Origin Checking, Rate Limiting & Access Gate for /api/tts

export const MAX_TEXT_LENGTH = 1500;
export const MAX_BODY_BYTES = 16 * 1024; // 16 KB request body limit

export const ALLOWED_VOICE_IDS = new Set([
  "JBFqnCBsd6RMkjVDRZzb", // George (Default - Professional Executive Male)
  "pFZP5JQG7iQjIQuC4Bku", // Lily (Warm Calm Female)
  "nPczCjzI2devNBz1zQrb", // Brian (Deep Narrative Male)
  "Xb7hH8MSUJpSbSDYk0k2", // Alice (Clear Confident Female)
]);

export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

// Default allowed origins for browser access
const BASE_ALLOWED_ORIGINS = [
  "https://interview-practice-coach-kappa.vercel.app",
  "https://interview-practice-coach-4vritfurl-rubin6.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
];

// Regex matching official Vercel deployment URLs for this project
const VERCEL_PREVIEW_REGEX = /^https:\/\/interview-practice-coach(-[a-z0-9]+)?-rubin6\.vercel\.app$/i;

/**
 * Validates request Origin or Referer header against allowed domains.
 * NOTE: Origin/Referer checking is a browser-enforced heuristic (CORS boundary)
 * to prevent cross-origin embedding, but scripts, curl, and bots can forge them.
 * It is supplementary, NOT an authentication replacement.
 */
export function validateOrigin(req) {
  const originHeader = req.headers?.["origin"] || "";
  const refererHeader = req.headers?.["referer"] || "";

  // Combine custom environment origins with defaults
  const customOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allAllowed = [...BASE_ALLOWED_ORIGINS, ...customOrigins];

  let candidate = "";
  if (originHeader) {
    candidate = originHeader.trim().toLowerCase();
  } else if (refererHeader) {
    try {
      const url = new URL(refererHeader);
      candidate = url.origin.toLowerCase();
    } catch {
      // Malformed referer
      return { allowed: false, reason: "Malformed Referer header." };
    }
  }

  // If candidate origin is present, verify against allowed list
  if (candidate) {
    const isDirectMatch = allAllowed.some((o) => o.toLowerCase() === candidate);
    const isVercelMatch = VERCEL_PREVIEW_REGEX.test(candidate);

    if (isDirectMatch || isVercelMatch) {
      return { allowed: true, origin: candidate };
    }
    return { allowed: false, reason: `Origin '${candidate}' is not permitted.` };
  }

  // If neither Origin nor Referer is present (e.g., non-browser client like curl)
  // In production, if strict origin enforcement is toggled on:
  if (process.env.ENFORCE_ORIGIN === "true" && process.env.NODE_ENV === "production") {
    return { allowed: false, reason: "Missing Origin/Referer header." };
  }

  return { allowed: true, origin: "" };
}

/**
 * Extracts trusted client IP from Vercel edge proxy headers.
 * Uses x-forwarded-for's first IP (set by Vercel edge) or x-real-ip.
 * Never accepts arbitrary client-invented headers.
 */
export function getTrustedClientIp(req) {
  const xForwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.trim()) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = req.headers?.["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return req.socket?.remoteAddress || "127.0.0.1";
}

// ============================================================================
// Server-Side In-Memory Rate Limiter
// ============================================================================
// IMPORTANT SERVERLESS LIMITATION:
// This in-memory limiter tracks requests within a single active container instance.
// In serverless environments (like Vercel), instances scale horizontally and spin down
// when idle. Different instances do NOT share memory. Therefore, in-memory limits
// throttle bursts on the same instance, but CANNOT enforce a hard daily spend cap
// across multiple instances. Durable limits require a centralized database/Redis,
// or a hard credit limit configured directly in the ElevenLabs dashboard.

const rateLimitMap = new Map();
const WINDOW_MINUTE_MS = 60 * 1000;
const WINDOW_HOUR_MS = 60 * 60 * 1000;

export const RATE_LIMIT_PER_MINUTE = 5; // Max 5 requests per minute per IP
export const RATE_LIMIT_PER_HOUR = 30; // Max 30 requests per hour per IP

/**
 * Checks in-memory rate limit for a client IP.
 */
export function checkRateLimit(clientIp, now = Date.now()) {
  const ip = clientIp || "unknown";
  let record = rateLimitMap.get(ip);

  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(ip, record);
  }

  // Filter timestamps within the last hour
  record.timestamps = record.timestamps.filter((ts) => now - ts < WINDOW_HOUR_MS);

  // Check 1-minute limit
  const minuteCount = record.timestamps.filter((ts) => now - ts < WINDOW_MINUTE_MS).length;
  if (minuteCount >= RATE_LIMIT_PER_MINUTE) {
    const oldestInMinute = record.timestamps.find((ts) => now - ts < WINDOW_MINUTE_MS) || now;
    const retryAfter = Math.max(1, Math.ceil((oldestInMinute + WINDOW_MINUTE_MS - now) / 1000));
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: retryAfter,
      error: `Rate limit exceeded: maximum ${RATE_LIMIT_PER_MINUTE} TTS requests per minute. Try again in ${retryAfter}s.`,
      code: "RATE_LIMIT_EXCEEDED",
    };
  }

  // Check 1-hour limit
  if (record.timestamps.length >= RATE_LIMIT_PER_HOUR) {
    const oldestInHour = record.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldestInHour + WINDOW_HOUR_MS - now) / 1000));
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: retryAfter,
      error: `Hourly rate limit exceeded: maximum ${RATE_LIMIT_PER_HOUR} TTS requests per hour. Try again later.`,
      code: "HOURLY_RATE_LIMIT_EXCEEDED",
    };
  }

  // Record current request timestamp
  record.timestamps.push(now);

  // Cleanup old IPs if map grows too large
  if (rateLimitMap.size > 2000) {
    for (const [key, val] of rateLimitMap.entries()) {
      val.timestamps = val.timestamps.filter((ts) => now - ts < WINDOW_HOUR_MS);
      if (val.timestamps.length === 0) {
        rateLimitMap.delete(key);
      }
    }
  }

  return { allowed: true };
}

/**
 * Resets the in-memory rate limiter (useful for automated testing).
 */
export function resetRateLimits() {
  rateLimitMap.clear();
}

/**
 * Validates Private-Demo Access Gate if configured via TTS_ACCESS_CODE.
 * If TTS_ACCESS_CODE is not set, access is granted.
 * If set, request must supply matching 'x-access-code' or 'authorization: Bearer <code>'.
 * The secret is NEVER exposed to public client JS.
 */
export function verifyAccessCode(req) {
  const serverCode = process.env.TTS_ACCESS_CODE?.trim();
  if (!serverCode) {
    return { allowed: true }; // Gate is inactive when no access code is configured
  }

  const clientCodeHeader = req.headers?.["x-access-code"];
  const authHeader = req.headers?.["authorization"] || "";
  let clientCode = "";

  if (typeof clientCodeHeader === "string") {
    clientCode = clientCodeHeader.trim();
  } else if (authHeader.toLowerCase().startsWith("bearer ")) {
    clientCode = authHeader.slice(7).trim();
  }

  if (clientCode && clientCode === serverCode) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 401,
    error: "A valid demo access code is required to use realistic AI voice generation.",
    code: "ACCESS_CODE_REQUIRED",
  };
}

/**
 * Validates the parsed TTS request payload.
 */
export function validateTtsPayload(body) {
  if (!body || typeof body !== "object") {
    return {
      valid: false,
      status: 400,
      error: "Invalid request: body must be a JSON object.",
      code: "INVALID_JSON_BODY",
    };
  }

  if (typeof body.text !== "string") {
    return {
      valid: false,
      status: 400,
      error: "Invalid request: 'text' field is required and must be a string.",
      code: "INVALID_TEXT_TYPE",
    };
  }

  const text = body.text.trim();
  if (!text) {
    return {
      valid: false,
      status: 400,
      error: "Invalid request: 'text' field cannot be empty.",
      code: "EMPTY_TEXT",
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      status: 400,
      error: `Text length (${text.length} chars) exceeds the maximum limit of ${MAX_TEXT_LENGTH} characters.`,
      code: "TEXT_TOO_LONG",
    };
  }

  // Voice whitelist validation: only allowed premade voices, otherwise fallback to default
  let safeVoiceId = DEFAULT_VOICE_ID;
  if (typeof body.voiceId === "string" && ALLOWED_VOICE_IDS.has(body.voiceId.trim())) {
    safeVoiceId = body.voiceId.trim();
  }

  return {
    valid: true,
    text,
    voiceId: safeVoiceId,
  };
}

/**
 * Safely parse JSON body with strict byte size limit (16 KB max).
 */
export async function readJsonBodyWithLimit(req, maxBytes = MAX_BODY_BYTES) {
  if (req.body && typeof req.body === "object") {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > maxBytes) {
      const err = new Error(`Payload too large. Maximum body size is ${maxBytes / 1024}KB.`);
      err.status = 413;
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    return req.body;
  }

  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body) > maxBytes) {
      const err = new Error(`Payload too large. Maximum body size is ${maxBytes / 1024}KB.`);
      err.status = 413;
      err.code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    try {
      return JSON.parse(req.body);
    } catch {
      const err = new Error("Invalid JSON body.");
      err.status = 400;
      err.code = "INVALID_JSON";
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error(`Payload too large. Maximum body size is ${maxBytes / 1024}KB.`);
        err.status = 413;
        err.code = "PAYLOAD_TOO_LARGE";
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const bodyStr = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(bodyStr));
      } catch {
        const err = new Error("Invalid JSON body.");
        err.status = 400;
        err.code = "INVALID_JSON";
        reject(err);
      }
    });

    req.on("error", (err) => reject(err));
  });
}
