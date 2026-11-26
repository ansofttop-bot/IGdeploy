export interface PollinationsImageResult {
  dataUrl: string;
  mimeType: string;
  source: "pollinations-free";
}

function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  return null;
}

function normalizePrompt(prompt: string): string {
  const cleaned = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 900);
}

async function fetchPollinationsVariant(
  prompt: string,
  model: "flux" | "turbo",
  timeoutMs: number,
): Promise<PollinationsImageResult> {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8",
        "User-Agent": "IGseek/1.0 (+https://igseek.app)",
      },
    });
    if (!res.ok) {
      throw new Error(`Pollinations ${model} HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1024) {
      throw new Error(`Pollinations ${model} returned an empty or invalid image payload`);
    }
    const detectedMime = detectImageMime(buffer);
    if (!detectedMime) {
      throw new Error(`Pollinations ${model} returned non-image bytes`);
    }
    return {
      dataUrl: `data:${detectedMime};base64,${buffer.toString("base64")}`,
      mimeType: detectedMime,
      source: "pollinations-free",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateImageWithPollinations(
  prompt: string,
  options?: { timeoutMs?: number },
): Promise<PollinationsImageResult> {
  const cleanPrompt = normalizePrompt(prompt);
  if (!cleanPrompt) {
    throw new Error("Empty image generation prompt.");
  }
  const timeoutMs = options?.timeoutMs ?? 45_000;

  let lastErr: unknown = null;
  for (const model of ["flux", "turbo"] as const) {
    try {
      return await fetchPollinationsVariant(cleanPrompt, model, timeoutMs);
    } catch (err) {
      lastErr = err;
      console.warn(`[pollinations-image] ${model} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Failed to generate image via Pollinations Free tier.");
}

export async function editImageWithPollinations(
  editInstruction: string,
  referenceDescription?: string,
  options?: { timeoutMs?: number },
): Promise<PollinationsImageResult> {
  const base = normalizePrompt(editInstruction);
  const context = referenceDescription ? normalizePrompt(referenceDescription) : "";
  const combined = context
    ? `${context}. Apply the following visual edit while preserving composition and style: ${base}`
    : base;
  return generateImageWithPollinations(combined, options);
}
