// api/tts.js — Secure Serverless Endpoint for ElevenLabs Speech Synthesis (Vercel)
import { generateSpeech } from "../lib/elevenlabs.js";
import {
  validateOrigin,
  getTrustedClientIp,
  checkRateLimit,
  verifyAccessCode,
  validateTtsPayload,
  readJsonBodyWithLimit,
  MAX_BODY_BYTES,
} from "../lib/tts-security.js";

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  return res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  // 1. Method check: POST only
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendJson(res, 405, {
      error: "Method not allowed. Use POST.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  // 2. Origin & Referer validation (browser CORS heuristic)
  const originCheck = validateOrigin(req);
  if (!originCheck.allowed) {
    return sendJson(res, 403, {
      error: originCheck.reason || "Forbidden: Origin not permitted.",
      code: "ORIGIN_FORBIDDEN",
    });
  }

  // 3. Check if provider API key is configured
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    return sendJson(res, 503, {
      error: "Text-to-speech service is currently unconfigured or disabled.",
      code: "PROVIDER_DISABLED",
    });
  }

  // 4. Private-Demo Access Gate check (active only if TTS_ACCESS_CODE is configured in env)
  const gateCheck = verifyAccessCode(req);
  if (!gateCheck.allowed) {
    return sendJson(res, gateCheck.status || 401, {
      error: gateCheck.error,
      code: gateCheck.code,
    });
  }

  // 5. Trusted Client IP & Server-Side Throttling
  const clientIp = getTrustedClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return sendJson(
      res,
      rateLimit.status || 429,
      {
        error: rateLimit.error,
        code: rateLimit.code,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { "Retry-After": String(rateLimit.retryAfterSeconds || 60) }
    );
  }

  // 6. Read and enforce request body size limit (16 KB max)
  let body;
  try {
    body = await readJsonBodyWithLimit(req, MAX_BODY_BYTES);
  } catch (err) {
    return sendJson(res, err.status || 400, {
      error: err.message || "Invalid request body.",
      code: err.code || "INVALID_BODY",
    });
  }

  // 7. Validate payload: non-empty string, max 1500 chars, voice whitelist
  const validation = validateTtsPayload(body);
  if (!validation.valid) {
    return sendJson(res, validation.status || 400, {
      error: validation.error,
      code: validation.code,
    });
  }

  // 8. Contact ElevenLabs with sanitized parameters
  try {
    const audioBuffer = await generateSpeech({
      text: validation.text,
      voiceId: validation.voiceId,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.end(audioBuffer);
  } catch (err) {
    console.error("ElevenLabs TTS Error:", err.message);

    // Sanitize upstream errors — never leak API keys, URLs, or internal details
    const isQuotaOrPayment =
      err.message.toLowerCase().includes("quota") ||
      err.message.toLowerCase().includes("credit") ||
      err.message.toLowerCase().includes("paid_plan_required") ||
      err.message.toLowerCase().includes("payment_required") ||
      err.message.includes("402");

    if (isQuotaOrPayment) {
      return sendJson(res, 402, {
        error: "ElevenLabs monthly character quota reached. Falling back to browser voice.",
        code: "PAYMENT_REQUIRED",
      });
    }

    return sendJson(res, 502, {
      error: "Text-to-speech provider temporarily unavailable. Falling back to browser voice.",
      code: "UPSTREAM_TTS_ERROR",
    });
  }
}
