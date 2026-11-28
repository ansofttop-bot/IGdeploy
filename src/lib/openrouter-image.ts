import { getOpenRouterApiKey, getOpenRouterBaseUrl } from "./openrouter-deepseek";
import { sanitizeErrorForUser } from "./error-sanitizer";

export interface OpenRouterImageResult {
  dataUrl: string;
  mimeType: string;
  modelUsed: string;
  tier: "free" | "pro";
}

/**
 * Tiered OpenRouter image generation models (verified live via OpenRouter /api/v1/models):
 *
 * - Free Plan (lowest-cost fast image model on OpenRouter):
 *     primary  -> google/gemini-3.1-flash-lite-image ($0.25 / $1.50 per 1M)
 *     fallback -> google/gemini-2.5-flash-image      ($0.30 / $2.50 per 1M)
 *
 * - Pro Plan (economical, smarter image model with native multi-image reference & editing support):
 *     primary  -> google/gemini-3.1-flash-image      ($0.50 / $3.00 per 1M, Nano Banana 2)
 *     fallback -> google/gemini-3-pro-image          ($2.00 / $12.00 per 1M, Nano Banana Pro)
 *     fallback -> openai/gpt-5-image-mini            ($2.50 / $2.00 per 1M)
 */
export const OPENROUTER_FREE_IMAGE_MODELS = [
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-2.5-flash-image",
] as const;

export const OPENROUTER_PRO_IMAGE_MODELS = [
  "google/gemini-3.1-flash-image",
  "google/gemini-3-pro-image",
  "openai/gpt-5-image-mini",
] as const;

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": (process.env.OPENROUTER_SITE_URL || "https://igseek.app").trim(),
    "X-Title": "IGseek",
  };
}

function normalizePrompt(prompt: string): string {
  return String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function extractImageDataUrlFromResponse(json: any): { dataUrl: string; mimeType: string } | null {
  const choice = json?.choices?.[0];
  const message = choice?.message;
  if (!message) return null;

  // 1. Standard OpenRouter image response: message.images = [{ type: "image_url", image_url: { url: "data:image/..." } }]
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      const rawUrl =
        typeof img === "string"
          ? img
          : typeof img?.image_url?.url === "string"
            ? img.image_url.url
            : typeof img?.url === "string"
              ? img.url
              : typeof img?.b64_json === "string"
                ? `data:image/png;base64,${img.b64_json}`
                : "";
      if (rawUrl && (rawUrl.startsWith("data:image/") || rawUrl.startsWith("https://"))) {
        const mimeMatch = rawUrl.match(/^data:([^;]+);/);
        return { dataUrl: rawUrl, mimeType: mimeMatch?.[1] || "image/png" };
      }
    }
  }

  // 2. Multimodal content parts array
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const rawUrl =
        typeof part?.image_url?.url === "string"
          ? part.image_url.url
          : typeof part?.url === "string" && part.url.startsWith("data:image/")
            ? part.url
            : typeof part?.inline_data?.data === "string"
              ? `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`
              : "";
      if (rawUrl && (rawUrl.startsWith("data:image/") || rawUrl.startsWith("https://"))) {
        const mimeMatch = rawUrl.match(/^data:([^;]+);/);
        return { dataUrl: rawUrl, mimeType: mimeMatch?.[1] || "image/png" };
      }
    }
  }

  // 3. Inline base64 data URI inside string content
  if (typeof message.content === "string") {
    const dataUriMatch = message.content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUriMatch?.[0]) {
      const mimeMatch = dataUriMatch[0].match(/^data:([^;]+);/);
      return { dataUrl: dataUriMatch[0], mimeType: mimeMatch?.[1] || "image/png" };
    }
  }

  return null;
}

async function resolveDataUrlIfRemote(
  url: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (url.startsWith("data:image/")) {
    return { dataUrl: url, mimeType };
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to download generated image (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const detectedMime = res.headers.get("content-type")?.split(";")[0]?.trim() || mimeType || "image/png";
  return {
    dataUrl: `data:${detectedMime};base64,${buf.toString("base64")}`,
    mimeType: detectedMime,
  };
}

export async function generateImageWithOpenRouter(params: {
  prompt: string;
  tier: "free" | "pro";
  referenceImages?: Array<{ dataUrl: string; mimeType?: string }>;
  mode?: "generate" | "edit";
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenRouterImageResult> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("IGseek image service is temporarily unavailable.");
  }

  const cleanPrompt = normalizePrompt(params.prompt);
  if (!cleanPrompt) {
    throw new Error("Empty image generation prompt.");
  }

  const baseUrl = getOpenRouterBaseUrl();
  const isPro = params.tier === "pro";
  const validRefs = (params.referenceImages || [])
    .filter((img) => typeof img?.dataUrl === "string" && img.dataUrl.startsWith("data:image/"))
    .slice(0, 3);

  // Reference image conditioning is a Pro capability (Free uses lightweight text-to-image)
  const useReferences = isPro && validRefs.length > 0;
  const freeOverride = (process.env.OPENROUTER_FREE_IMAGE_MODEL || "").trim();
  const proOverride = (process.env.OPENROUTER_PRO_IMAGE_MODEL || "").trim();

  const models: string[] = isPro
    ? Array.from(new Set([proOverride, ...OPENROUTER_PRO_IMAGE_MODELS].filter(Boolean)))
    : Array.from(new Set([freeOverride, ...OPENROUTER_FREE_IMAGE_MODELS].filter(Boolean)));

  const instructionPrefix =
    params.mode === "edit" && useReferences
      ? "Edit the provided reference image(s) carefully according to the instruction while preserving subject identity, lighting, and coherence. Output the edited image."
      : useReferences
        ? "Use the provided reference image(s) as visual reference for style, character, composition, or subject as requested. Output a high-quality image."
        : "Generate a crisp, high-quality image matching this description. Output an image.";

  const userContent: unknown = useReferences
    ? [
        ...validRefs.map((ref) => ({
          type: "image_url",
          image_url: { url: ref.dataUrl },
        })),
        {
          type: "text",
          text: `${instructionPrefix}\n\nPrompt: ${cleanPrompt}`,
        },
      ]
    : `${instructionPrefix}\n\nPrompt: ${cleanPrompt}`;

  const timeoutMs = params.timeoutMs ?? 45_000;
  let lastError: Error | null = null;

  for (const modelId of models) {
    if (params.signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(params.signal?.reason);
    if (params.signal) {
      params.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new Error("image_timeout")), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          modalities: ["image", "text"],
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let errMsg = `IGseek image generation failed (HTTP ${res.status})`;
        try {
          const parsed = JSON.parse(errBody);
          if (typeof parsed?.error?.message === "string") {
            errMsg = sanitizeErrorForUser(parsed.error.message, errMsg);
          }
        } catch {
          // keep default
        }
        lastError = new Error(errMsg);
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          throw lastError;
        }
        console.warn(`[openrouter-image] ${modelId} failed:`, errMsg);
        continue;
      }

      const json = await res.json();
      const extracted = extractImageDataUrlFromResponse(json);
      if (!extracted) {
        lastError = new Error("IGseek image generator did not return an image.");
        console.warn(`[openrouter-image] ${modelId} returned no image payload`);
        continue;
      }

      const resolved = await resolveDataUrlIfRemote(
        extracted.dataUrl,
        extracted.mimeType,
        controller.signal,
      );

      return {
        dataUrl: resolved.dataUrl,
        mimeType: resolved.mimeType,
        modelUsed: modelId,
        tier: params.tier,
      };
    } catch (err) {
      if (params.signal?.aborted || (err as Error)?.name === "AbortError") {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[openrouter-image] ${modelId} exception:`, lastError.message);
    } finally {
      clearTimeout(timer);
      if (params.signal) {
        params.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  throw new Error(
    sanitizeErrorForUser(lastError?.message, "Failed to generate image via IGseek."),
  );
}
