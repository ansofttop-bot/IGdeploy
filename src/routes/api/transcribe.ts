import { GoogleGenAI } from "@google/genai";

const MAX_AUDIO_BASE64_LEN = 12 * 1024 * 1024; // ~9 MB raw audio

const ALLOWED_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/flac",
];

function normalizeAudioMimeType(raw?: string): string {
  const cleaned = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (ALLOWED_AUDIO_MIME_PREFIXES.includes(cleaned)) {
    return cleaned === "audio/x-wav" ? "audio/wav" : cleaned;
  }
  return "audio/webm";
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

const DEFAULT_TRANSCRIBE_MODELS = ["gemini-3.5-transcribe", "gemini-2.5-flash"];
const TRANSCRIBE_WINDOW_MS = 5 * 60_000;
const TRANSCRIBE_MAX_REQ_PER_WINDOW = 25;
const transcribeRateBuckets = new Map<string, number[]>();

function isTranscribeRateLimited(req: Request): boolean {
  const fwd = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const ip = fwd.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (transcribeRateBuckets.get(ip) || []).filter((ts) => now - ts < TRANSCRIBE_WINDOW_MS);
  if (recent.length >= TRANSCRIBE_MAX_REQ_PER_WINDOW) {
    transcribeRateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  transcribeRateBuckets.set(ip, recent);
  return false;
}

export async function handleTranscribePost(req: Request): Promise<Response> {
  try {
    if (isTranscribeRateLimited(req)) {
      return Response.json(
        { error: "Too many voice transcription requests. Please try again in a few minutes." },
        { status: 429 },
      );
    }
    const body = (await req.json().catch(() => null)) as {
      audioBase64?: string;
      mimeType?: string;
      lang?: string;
    } | null;

    const rawBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64.trim() : "";
    if (!rawBase64) {
      return Response.json({ error: "Missing audio payload" }, { status: 400 });
    }
    if (rawBase64.length > MAX_AUDIO_BASE64_LEN) {
      return Response.json({ error: "Audio recording is too large" }, { status: 413 });
    }

    const base64Data = rawBase64.includes(",") ? rawBase64.split(",").pop()!.trim() : rawBase64;
    const mimeType = normalizeAudioMimeType(body?.mimeType);
    const langHint = typeof body?.lang === "string" ? body.lang.trim().slice(0, 16) : "";

    const ai = getGeminiClient();
    if (!ai) {
      return Response.json(
        { error: "Server speech transcription is not configured" },
        { status: 503 },
      );
    }

    const prompt = langHint
      ? `Transcribe this spoken audio verbatim (expected language: ${langHint}, or preserve whatever language is actually spoken). Return ONLY the exact transcribed text with proper punctuation, no timestamps, no quotes, and no extra commentary. If there is no intelligible speech, return an empty string.`
      : "Transcribe this spoken audio verbatim in the language spoken. Return ONLY the exact transcribed text with proper punctuation, no timestamps, no quotes, and no extra commentary. If there is no intelligible speech, return an empty string.";

    const configuredModel = (process.env.GEMINI_TRANSCRIBE_MODEL || "").trim();
    const candidateModels = configuredModel
      ? [configuredModel, ...DEFAULT_TRANSCRIBE_MODELS.filter((m) => m !== configuredModel)]
      : DEFAULT_TRANSCRIBE_MODELS;

    let lastErr: any = null;
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
        });
        const text = (response.text ?? "").trim();
        return Response.json({ text });
      } catch (err: any) {
        lastErr = err;
        const status = Number(err?.status ?? err?.code ?? 0);
        const message = String(err?.message || "");
        const isModelUnavailable =
          status === 404 ||
          /not found|is not supported|unsupported model|NOT_FOUND/i.test(message);
        if (!isModelUnavailable || i === candidateModels.length - 1) {
          throw err;
        }
      }
    }

    throw lastErr || new Error("Transcription failed");
  } catch (err: any) {
    console.error("API /api/transcribe error:", err);
    const msg = err?.message || "Transcription failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
