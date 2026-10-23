// lib/elevenlabs.js — ElevenLabs Text-to-Speech Integration

export async function generateSpeech({ text, voiceId = "JBFqnCBsd6RMkjVDRZzb" }) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY. Add it to your environment variables or .env file.");
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Text is required for speech synthesis.");
  }

  // Request speech synthesis from ElevenLabs (Turbo v2.5 model for high speed & realistic quality)
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.detail?.message ||
      `ElevenLabs API error (${response.status}): ${response.statusText}`;
    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
