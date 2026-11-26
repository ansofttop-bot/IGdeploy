import { GROQ_BASE_URL, getGroqApiKey } from "../../lib/groq-free";

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

function normalizeAudioMimeType(raw?: string): { mimeType: string; ext: string } {
  const cleaned = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (ALLOWED_AUDIO_MIME_PREFIXES.includes(cleaned)) {
    const mimeType = cleaned === "audio/x-wav" ? "audio/wav" : cleaned;
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/aac": "m4a",
      "audio/flac": "flac",
    };
    return { mimeType, ext: extMap[mimeType] || "webm" };
  }
  return { mimeType: "audio/webm", ext: "webm" };
}

const DEFAULT_GROQ_TRANSCRIBE_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"];
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

    const apiKey = getGroqApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "Server speech transcription is not configured (GROQ_API_KEY missing)" },
        { status: 503 },
      );
    }

    const base64Data = rawBase64.includes(",") ? rawBase64.split(",").pop()!.trim() : rawBase64;
    const { mimeType, ext } = normalizeAudioMimeType(body?.mimeType);
    const langHint = typeof body?.lang === "string" ? body.lang.trim().split("-")[0].slice(0, 8) : "";
    const audioBytes = Buffer.from(base64Data, "base64");

    const configuredModel = (process.env.GROQ_TRANSCRIBE_MODEL || "").trim();
    const candidateModels = configuredModel
      ? [configuredModel, ...DEFAULT_GROQ_TRANSCRIBE_MODELS.filter((m) => m !== configuredModel)]
      : DEFAULT_GROQ_TRANSCRIBE_MODELS;

    let lastErr: Error | null = null;
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const form = new FormData();
        const blob = new Blob([audioBytes], { type: mimeType });
        form.append("file", blob, `voice.${ext}`);
        form.append("model", model);
        form.append("response_format", "json");
        if (langHint && /^[a-z]{2}$/i.test(langHint)) {
          form.append("language", langHint.toLowerCase());
        }

        const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
          },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Groq Whisper HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as { text?: string };
        const text = (data?.text ?? "").trim();
        return Response.json({ text });
      } catch (err: any) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (i === candidateModels.length - 1) {
          throw lastErr;
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
