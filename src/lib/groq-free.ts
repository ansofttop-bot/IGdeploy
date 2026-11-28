import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
} from "./deepseek-models";
import { callOpenRouterDeepSeekText, isOpenRouterConfigured } from "./openrouter-deepseek";
import { sanitizeErrorForUser } from "./error-sanitizer";

export const GROQ_FREE_MODEL = "openai/gpt-oss-120b";
export const GROQ_FREE_VISION_MODEL = "qwen/qwen3.8-27b";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function isGroqFreeConfigured(): boolean {
  return Boolean((process.env.GROQ_API_KEY || "").trim());
}

export function resolveGroqFreeModel(): string {
  const override = (process.env.GROQ_FREE_MODEL || "").trim();
  return override || GROQ_FREE_MODEL;
}

export function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || "").trim();
}

const DATA_URL_IMG_RE = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+)\)/g;

function normalizeDataUrl(url: string): string | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const mimeType = match[1].trim().toLowerCase();
  const data = match[2].replace(/\s+/g, "");
  if (!mimeType || !data) return null;
  return `data:${mimeType};base64,${data}`;
}

function splitMarkdownTextAndImages(
  raw: string,
): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  let cursor = 0;
  for (const match of raw.matchAll(DATA_URL_IMG_RE)) {
    const idx = match.index ?? 0;
    const before = raw.slice(cursor, idx).trim();
    if (before) parts.push({ type: "text", text: before });
    const cleanUrl = normalizeDataUrl(match[1]);
    if (cleanUrl) {
      parts.push({ type: "image_url", image_url: { url: cleanUrl } });
    }
    cursor = idx + match[0].length;
  }
  const tail = raw.slice(cursor).trim();
  if (tail) parts.push({ type: "text", text: tail });
  return parts;
}

function stripInlineImageDataUrls(raw: string): string {
  return raw.replace(DATA_URL_IMG_RE, "[прикреплённое изображение]").trim();
}

function messageHasImageAttachment(msg: Record<string, unknown> | undefined): boolean {
  if (!msg) return false;
  const content = msg.content;
  if (typeof content === "string") {
    return /data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(content);
  }
  if (Array.isArray(content)) {
    return content.some(
      (p: any) =>
        (p?.type === "image_url" && typeof p?.image_url?.url === "string") ||
        (p?.type === "text" && typeof p?.text === "string" && /data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(p.text)),
    );
  }
  return false;
}

function normalizeMessagesForGroq(
  messages: Array<Record<string, unknown>>,
  supportsMultimodalArray: boolean,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = String(msg.role || "user");
    const content = msg.content;

    if (role === "system") {
      if (typeof content === "string" && content.trim()) {
        out.push({ role: "system", content: content.trim() });
      } else if (Array.isArray(content)) {
        const text = content
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n")
          .trim();
        if (text) out.push({ role: "system", content: text });
      }
      continue;
    }

    if (role === "assistant") {
      const entry: Record<string, unknown> = {
        role: "assistant",
      };
      if (typeof content === "string") {
        entry.content = stripInlineImageDataUrls(content);
      } else if (Array.isArray(content)) {
        const text = content
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n");
        entry.content = stripInlineImageDataUrls(text);
      } else {
        entry.content = "";
      }
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls;
      }
      out.push(entry);
      continue;
    }

    if (role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: typeof msg.tool_call_id === "string" ? msg.tool_call_id : "call_tool",
        ...(typeof msg.name === "string" && msg.name ? { name: msg.name } : {}),
        content: typeof content === "string" ? content : JSON.stringify(content ?? {}),
      });
      continue;
    }

    // User message
    if (!supportsMultimodalArray) {
      // Text-only models like openai/gpt-oss-120b strictly require string content
      if (typeof content === "string") {
        const cleanText = stripInlineImageDataUrls(content);
        out.push({ role: "user", content: cleanText || "(empty message)" });
      } else if (Array.isArray(content)) {
        const textSegments: string[] = [];
        for (const p of content as any[]) {
          if (!p || typeof p !== "object") continue;
          if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
            textSegments.push(stripInlineImageDataUrls(p.text));
          } else if (p.type === "image_url") {
            textSegments.push("[прикреплённое изображение]");
          }
        }
        out.push({
          role: "user",
          content: textSegments.filter(Boolean).join("\n").trim() || "(прикреплённое изображение)",
        });
      } else {
        out.push({ role: "user", content: String(content || "(empty message)") });
      }
      continue;
    }

    // Multimodal vision format for qwen/qwen3.8-27b
    if (typeof content === "string") {
      const parts = splitMarkdownTextAndImages(content);
      const hasImages = parts.some((p) => p.type === "image_url");
      if (hasImages) {
        out.push({ role: "user", content: parts });
      } else {
        out.push({ role: "user", content: content || "(empty message)" });
      }
    } else if (Array.isArray(content)) {
      const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
      for (const p of content as any[]) {
        if (!p || typeof p !== "object") continue;
        if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
          parts.push(...splitMarkdownTextAndImages(p.text));
        } else if (p.type === "image_url" && typeof p.image_url?.url === "string") {
          const cleanUrl = p.image_url.url.startsWith("data:")
            ? normalizeDataUrl(p.image_url.url)
            : p.image_url.url;
          if (cleanUrl) {
            parts.push({ type: "image_url", image_url: { url: cleanUrl } });
          }
        }
      }
      if (parts.length === 0) {
        out.push({ role: "user", content: "(empty message)" });
      } else if (parts.length === 1 && parts[0].type === "text") {
        out.push({ role: "user", content: parts[0].text });
      } else {
        out.push({ role: "user", content: parts });
      }
    } else {
      out.push({ role: "user", content: String(content || "(empty message)") });
    }
  }

  if (out.length === 0) {
    out.push({ role: "user", content: "Hello" });
  }
  return out;
}

function createAbortError(message = "Request aborted"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw createAbortError();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

async function fetchWithHeaderTimeout(
  url: string,
  init: RequestInit,
  headerTimeoutMs = 15_000,
  externalSignal?: AbortSignal,
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }
  const ac = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => ac.abort(externalSignal?.reason);
  if (externalSignal) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort(new Error(`groq_header_timeout_${headerTimeoutMs}ms`));
  }, headerTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(`IGseek AI did not respond within ${Math.round(headerTimeoutMs / 1000)}s (connection timeout). Please try again.`);
    }
    throw err;
  } finally {
    // Clear header timeout as soon as headers resolve so long streams are not aborted mid-response
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function parseGroqRetryAfterMs(res: Response, rawBody: string): number | null {
  const headerVal = (res.headers.get("retry-after") || "").trim();
  if (headerVal) {
    const sec = Number(headerVal);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.ceil(sec * 1000) + 250;
    }
  }
  const match = rawBody.match(/try again in\s+([\d.]+)\s*(ms|s)/i);
  if (match) {
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > 0) {
      const unit = match[2].toLowerCase();
      return Math.ceil(unit === "ms" ? num : num * 1000) + 250;
    }
  }
  return null;
}

function isModelUnavailableError(status: number, rawBody: string): boolean {
  if (status === 404) return true;
  return status === 400 && /model_not_found|decommissioned|does not exist|not found/i.test(rawBody);
}

function formatGroqError(status: number, rawBody: string): string {
  let msg = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed?.error?.message === "string") {
      msg = parsed.error.message;
    }
  } catch {
    // keep rawBody
  }
  if (status === 401 || status === 403 || /invalid_api_key|Invalid API Key/i.test(msg)) {
    return "IGseek AI authentication failed. Please try again later.";
  }
  if (status === 429 || /rate_limit|quota|Too Many Requests/i.test(msg)) {
    const waitMatch = msg.match(/try again in\s+([\d.]+)\s*(ms|s)/i);
    if (waitMatch) {
      const sec = waitMatch[2].toLowerCase() === "ms"
        ? Math.max(1, Math.ceil(Number(waitMatch[1]) / 1000))
        : Math.max(1, Math.ceil(Number(waitMatch[1])));
      return `IGseek AI temporary rate limit reached. Please retry in ${sec}s.`;
    }
    return "IGseek AI temporary rate limit reached. Please wait a few seconds and try again.";
  }
  return sanitizeErrorForUser(msg || `IGseek AI error (HTTP ${status})`, `IGseek AI error (HTTP ${status})`);
}

function buildGroqPayload(params: {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>;
  reasoning?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  jsonMode?: boolean;
}): Record<string, unknown> {
  const isQwen = /qwen/i.test(params.model);
  const isGptOss = /gpt-oss/i.test(params.model);
  const supportsVision = isQwen;
  const normalizedMessages = normalizeMessagesForGroq(params.messages, supportsVision);
  const hasTools = Array.isArray(params.tools) && params.tools.length > 0;

  const payload: Record<string, unknown> = {
    model: params.model,
    stream: params.stream,
    temperature: params.temperature ?? 0.65,
    messages: normalizedMessages,
    ...(hasTools ? { tools: params.tools, tool_choice: "auto" } : {}),
    ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  if (isGptOss) {
    // Low reasoning effort achieves ~150-300ms TTFT and ~500 tok/s while strictly adhering to SYSTEM_PROMPT
    payload.reasoning_effort = params.reasoning ? "medium" : "low";
    // Only set max_completion_tokens when explicitly bounded below 3000 so Groq doesn't pre-reserve 4096 TPM upfront
    if (params.maxTokens && params.maxTokens < 3000) {
      payload.max_completion_tokens = params.maxTokens;
    }
  } else if (isQwen) {
    // Qwen 3.8 on Groq has an enforced 1,000 OTPM limit on free tier and supports reasoning_effort: "none" | "default"
    payload.reasoning_effort = params.reasoning ? "default" : "none";
    payload.max_completion_tokens = Math.min(params.maxTokens ?? 850, 850);
  } else if (params.maxTokens) {
    payload.max_completion_tokens = params.maxTokens;
  }

  return payload;
}

/**
 * Streams a Free-tier chat response using `openai/gpt-oss-120b` via Groq
 * (with automatic vision routing to `qwen/qwen3.8-27b` ONLY when the current message contains an image attachment),
 * supporting OpenAI tools (function calling), optional reasoning thoughts, smart 429 retry, and immediate AbortSignal cancellation.
 */
export async function callGroqFreeChatStream(params: {
  messages: Array<Record<string, unknown>>;
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>;
  reasoning?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("IGseek AI service is temporarily unavailable.");
  }
  if (params.signal?.aborted) {
    throw createAbortError();
  }

  const primaryModel = resolveGroqFreeModel();
  const hasTools = Array.isArray(params.tools) && params.tools.length > 0;
  const lastUserMsg = [...params.messages].reverse().find((m) => String(m.role || "user") === "user");
  const hasDirectImageInLastTurn = messageHasImageAttachment(lastUserMsg);

  // Use multimodal vision model first ONLY when the current turn has an image attachment (without tools).
  // For standard text/tool turns, stay strictly on primaryModel (never silently downgrade to Qwen on 429).
  const initialModel =
    hasDirectImageInLastTurn && !hasTools && primaryModel !== GROQ_FREE_VISION_MODEL
      ? GROQ_FREE_VISION_MODEL
      : primaryModel;
  const fallbackModelIfUnavailable =
    initialModel === GROQ_FREE_VISION_MODEL ? primaryModel : GROQ_FREE_VISION_MODEL;
  const modelsToTry =
    initialModel === fallbackModelIfUnavailable
      ? [initialModel]
      : [initialModel, fallbackModelIfUnavailable];

  let upstream: Response | null = null;
  let lastStatus = 500;
  let lastErrBody = "";

  outer: for (let mIdx = 0; mIdx < modelsToTry.length; mIdx += 1) {
    const candidateModel = modelsToTry[mIdx];
    const payload = buildGroqPayload({
      model: candidateModel,
      messages: params.messages,
      tools: params.tools,
      reasoning: params.reasoning,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      stream: true,
    });
    const bodyStr = JSON.stringify(payload);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (params.signal?.aborted) throw createAbortError();

      const res = await fetchWithHeaderTimeout(
        `${GROQ_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: bodyStr,
        },
        15_000,
        params.signal,
      );

      if (res.ok && res.body) {
        upstream = res;
        break outer;
      }

      lastStatus = res.status;
      lastErrBody = await res.text().catch(() => "");

      if (res.status === 401 || res.status === 403) {
        break outer;
      }

      // Retry the SAME model once on transient 429 (if wait <= 10s) or 5xx
      if (attempt === 0) {
        if (res.status === 429) {
          const retryMs = parseGroqRetryAfterMs(res, lastErrBody);
          if (retryMs !== null && retryMs <= 10_000) {
            await abortableSleep(retryMs, params.signal);
            continue;
          }
          // Do not fall back from gpt-oss-120b to qwen on 429 (Qwen has 1k OTPM limit and refuses roleplay/code)
          if (!hasDirectImageInLastTurn) {
            break outer;
          }
        } else if (res.status >= 500) {
          await abortableSleep(650, params.signal);
          continue;
        }
      }

      // Only try fallback model when current model is decommissioned/unavailable (or vision turn fallback)
      const allowNextModel =
        isModelUnavailableError(res.status, lastErrBody) || hasDirectImageInLastTurn;
      if (!allowNextModel) {
        break outer;
      }
      break;
    }
  }

  if (!upstream || !upstream.body) {
    throw new Error(formatGroqError(lastStatus, lastErrBody));
  }

  const upstreamBody = upstream.body;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Transform stream that normalizes Groq `delta.reasoning` -> `delta.reasoning_content`
  // and cleanly splits inline `<think>...</think>` blocks into `reasoning_content` vs `content`
  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const reader = upstreamBody.getReader();

      const emit = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // ignore
        }
      };

      const onAbort = () => {
        if (!closed) {
          closed = true;
          void reader.cancel().catch(() => {});
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      };

      if (params.signal) {
        if (params.signal.aborted) {
          onAbort();
          return;
        }
        params.signal.addEventListener("abort", onAbort, { once: true });
      }

      let buffer = "";
      let inThinkTag = false;
      let tagCarry = "";

      const emitContentOrThought = (text: string) => {
        if (!text) return;
        let work = tagCarry + text;
        tagCarry = "";

        while (work.length > 0) {
          if (!inThinkTag) {
            const openIdx = work.indexOf("<think>");
            if (openIdx >= 0) {
              const before = work.slice(0, openIdx);
              if (before) {
                emit({ choices: [{ delta: { content: before }, finish_reason: null }] });
              }
              inThinkTag = true;
              work = work.slice(openIdx + 7);
              continue;
            }
            let partialLen = 0;
            for (let len = Math.min(6, work.length); len >= 1; len--) {
              if ("<think>".startsWith(work.slice(-len))) {
                partialLen = len;
                break;
              }
            }
            if (partialLen > 0) {
              const safe = work.slice(0, work.length - partialLen);
              if (safe) {
                emit({ choices: [{ delta: { content: safe }, finish_reason: null }] });
              }
              tagCarry = work.slice(work.length - partialLen);
              break;
            }
            emit({ choices: [{ delta: { content: work }, finish_reason: null }] });
            break;
          } else {
            const closeIdx = work.indexOf("</think>");
            if (closeIdx >= 0) {
              const thought = work.slice(0, closeIdx);
              if (thought && params.reasoning) {
                emit({ choices: [{ delta: { reasoning_content: thought }, finish_reason: null }] });
              }
              inThinkTag = false;
              work = work.slice(closeIdx + 8).replace(/^\r?\n/, "");
              continue;
            }
            let partialLen = 0;
            for (let len = Math.min(7, work.length); len >= 1; len--) {
              if ("</think>".startsWith(work.slice(-len))) {
                partialLen = len;
                break;
              }
            }
            if (partialLen > 0) {
              const safeThought = work.slice(0, work.length - partialLen);
              if (safeThought && params.reasoning) {
                emit({ choices: [{ delta: { reasoning_content: safeThought }, finish_reason: null }] });
              }
              tagCarry = work.slice(work.length - partialLen);
              break;
            }
            if (params.reasoning) {
              emit({ choices: [{ delta: { reasoning_content: work }, finish_reason: null }] });
            }
            break;
          }
        }
      };

      const GROQ_CHUNK_STALL_TIMEOUT_MS = 18_000;
      try {
        while (!closed && !params.signal?.aborted) {
          let stallTimer: ReturnType<typeof setTimeout> | null = null;
          const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
              stallTimer = setTimeout(() => {
                void reader.cancel().catch(() => {});
                reject(new Error("IGseek AI stream stalled. Please try again."));
              }, GROQ_CHUNK_STALL_TIMEOUT_MS);
            }),
          ]).finally(() => {
            if (stallTimer) clearTimeout(stallTimer);
          });
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") {
              if (tagCarry && !inThinkTag) {
                emit({ choices: [{ delta: { content: tagCarry }, finish_reason: null }] });
                tagCarry = "";
              }
              finish();
              return;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            const choice = parsed?.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta || {};

            const rChunk =
              typeof delta.reasoning_content === "string"
                ? delta.reasoning_content
                : typeof delta.reasoning === "string"
                  ? delta.reasoning
                  : "";
            if (rChunk && params.reasoning) {
              emit({
                choices: [{ delta: { reasoning_content: rChunk }, finish_reason: null }],
              });
            }

            if (typeof delta.content === "string" && delta.content) {
              emitContentOrThought(delta.content);
            }

            if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
              emit({
                choices: [
                  {
                    delta: { tool_calls: delta.tool_calls },
                    finish_reason: choice.finish_reason ?? null,
                  },
                ],
              });
            } else if (choice.finish_reason) {
              if (tagCarry && !inThinkTag) {
                emit({ choices: [{ delta: { content: tagCarry }, finish_reason: null }] });
                tagCarry = "";
              }
              emit({
                choices: [
                  {
                    delta: {},
                    finish_reason: choice.finish_reason,
                  },
                ],
              });
            }
          }
        }

        if (!closed && !params.signal?.aborted) {
          if (tagCarry && !inThinkTag) {
            emit({ choices: [{ delta: { content: tagCarry }, finish_reason: null }] });
          }
          finish();
        }
      } catch (err) {
        if (!closed && !params.signal?.aborted) {
          console.error("[groq-free] stream error:", err);
          finish();
        }
      } finally {
        if (params.signal) {
          params.signal.removeEventListener("abort", onAbort);
        }
      }
    },
  });

  return new Response(sseStream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

/**
 * Non-streaming Free-tier Groq text/JSON helper for Flow, Memory, and File Translation.
 */
export async function callGroqFreeText(params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}): Promise<string | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey || params.signal?.aborted) return null;

  const primaryModel = resolveGroqFreeModel();
  const candidates =
    primaryModel !== GROQ_FREE_VISION_MODEL ? [primaryModel, GROQ_FREE_VISION_MODEL] : [primaryModel];

  for (const model of candidates) {
    const payload = buildGroqPayload({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.25,
      maxTokens: params.maxTokens,
      stream: false,
      jsonMode: params.jsonMode,
    });
    const bodyStr = JSON.stringify(payload);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetchWithHeaderTimeout(
          `${GROQ_BASE_URL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: bodyStr,
          },
          15_000,
          params.signal,
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.warn(`[groq-free-text] ${model} failed:`, formatGroqError(res.status, errBody));
          if (res.status === 401 || res.status === 403) return null;
          if (attempt === 0 && res.status === 429) {
            const retryMs = parseGroqRetryAfterMs(res, errBody);
            if (retryMs !== null && retryMs <= 6_000) {
              await abortableSleep(retryMs, params.signal);
              continue;
            }
            return null;
          }
          if (attempt === 0 && res.status >= 500) {
            await abortableSleep(600, params.signal);
            continue;
          }
          if (!isModelUnavailableError(res.status, errBody)) {
            return null;
          }
          break;
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = (json.choices?.[0]?.message?.content ?? "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();
        if (raw) return raw;
        break;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return null;
        console.warn(`[groq-free-text] ${model} exception:`, (err as Error)?.message || err);
        break;
      }
    }
  }
  return null;
}

/**
 * Under-the-hood reference image analyzer -> detailed English Pollinations prompt.
 *
 * - On Free plan (and whenever GROQ_API_KEY is available), `qwen/qwen3.8-27b` Vision on Groq directly
 *   inspects the uploaded/referenced image(s) with `reasoning_effort: "none"`, captures subject identity,
 *   pose, outfit, composition, lighting, colors, and style, applies the user's requested edit/generation
 *   directive, and outputs ONE rich English image prompt for Pollinations.
 * - If GROQ_API_KEY is absent during Pro hourly fallback, falls back to DeepSeek < V4.0.
 */
export async function buildReferenceAwarePollinationsPrompt(params: {
  sourceImageDataUrl?: string | null;
  sourceImages?: Array<{ dataUrl: string; mimeType?: string }>;
  editPrompt: string;
  extraDescription?: string;
  useDeepSeekSynthesis?: boolean;
  deepseekKey?: string;
  apimiraKey?: string;
  apimiraBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const cleanEdit = params.editPrompt.trim();
  const extra = params.extraDescription?.trim() || "";
  const rawSources: string[] = [];
  if (Array.isArray(params.sourceImages)) {
    for (const img of params.sourceImages) {
      if (img?.dataUrl && img.dataUrl.startsWith("data:image/")) {
        rawSources.push(img.dataUrl);
      }
    }
  }
  if (rawSources.length === 0 && params.sourceImageDataUrl?.startsWith("data:image/")) {
    rawSources.push(params.sourceImageDataUrl);
  }

  const systemPrompt =
    "You are a master visual prompt engineer for text-to-image diffusion models (Flux / Pollinations). " +
    "Carefully analyze the provided reference image(s) and the user's request. " +
    "Write ONE cohesive, vivid, self-contained English image generation prompt (under 820 characters) that faithfully preserves the reference image's subject appearance, identity, clothing, composition, camera angle, lighting, and artistic style EXCEPT for the exact changes requested by the user. " +
    "Output ONLY the final English prompt text — no quotes, no markdown, no bullet points, no preamble.";

  const userDirective = [
    `User request / edit instruction: ${cleanEdit}`,
    extra ? `Additional context: ${extra}` : "",
    "Describe the resulting image in full visual detail in English so an image generator recreates the reference faithfully with the requested modifications.",
  ]
    .filter(Boolean)
    .join("\n");

  // 1. Primary: Groq multimodal vision analysis (qwen/qwen3.8-27b with reasoning_effort: "none" and safe token cap)
  const groqKey = getGroqApiKey();
  if (groqKey && !params.signal?.aborted) {
    const contentParts: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [];
    for (const dataUrl of rawSources.slice(0, 3)) {
      const cleanUrl = normalizeDataUrl(dataUrl);
      if (cleanUrl) {
        contentParts.push({ type: "image_url", image_url: { url: cleanUrl } });
      }
    }
    contentParts.push({ type: "text", text: userDirective });

    try {
      const hasImages = contentParts.some((p) => p.type === "image_url");
      const visionModel = hasImages ? GROQ_FREE_VISION_MODEL : resolveGroqFreeModel();
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: visionModel,
          stream: false,
          temperature: 0.35,
          max_completion_tokens: 360,
          reasoning_effort: /qwen/i.test(visionModel) ? "none" : "low",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: contentParts.length === 1 ? userDirective : contentParts,
            },
          ],
        }),
        signal: params.signal ?? AbortSignal.timeout(25_000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const synthesized = (json.choices?.[0]?.message?.content ?? "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .replace(/^["'`]+|["'`]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (synthesized.length >= 20) {
          return synthesized.slice(0, 880);
        }
      } else {
        const errBody = await res.text().catch(() => "");
        console.warn("[groq-free] reference prompt analysis failed:", formatGroqError(res.status, errBody));
      }
    } catch (err) {
      console.warn("[groq-free] reference prompt analysis error:", (err as Error)?.message || err);
    }
  }

  // 2. Fallback for Pro / non-Groq synthesis: OpenRouter DeepSeek < V4.0 first, then Direct DeepSeek / ApiMira
  if (!params.signal?.aborted && isOpenRouterConfigured()) {
    const orText = await callOpenRouterDeepSeekText({
      tier: params.useDeepSeekSynthesis ? "pro" : "free",
      uiModel: "f1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userDirective },
      ],
      maxTokens: 320,
      temperature: 0.4,
      signal: params.signal,
    });
    if (orText && orText.trim().length >= 20) {
      return orText
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 880);
    }
  }

  if (params.useDeepSeekSynthesis && !params.signal?.aborted) {
    const dsKey = (params.deepseekKey || process.env.DEEPSEEK_API_KEY || "").trim();
    const apimiraKey = (params.apimiraKey || process.env.APIMIRA_API_KEY || "").trim();
    const apimiraBase = (params.apimiraBaseUrl || process.env.APIMIRA_BASE_URL || "https://apimira.com/v1")
      .trim()
      .replace(/\/+$/, "");

    const endpoints: Array<{ url: string; apiKey: string; model: string; isDirect: boolean }> = [];
    if (shouldTryDirectDeepSeek(dsKey, apimiraKey)) {
      endpoints.push({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: dsKey,
        model: DEEPSEEK_DIRECT_CHAT,
        isDirect: true,
      });
    }
    if (apimiraKey) {
      for (const modelId of getApimiraFallbackChain("f1", false)) {
        endpoints.push({
          url: `${apimiraBase}/chat/completions`,
          apiKey: apimiraKey,
          model: modelId,
          isDirect: false,
        });
      }
    }

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ep.apiKey}`,
          },
          body: JSON.stringify({
            model: ep.model,
            stream: false,
            temperature: 0.4,
            max_tokens: 320,
            ...(!ep.isDirect ? APIMIRA_NO_REASONING_PARAMS : {}),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userDirective },
            ],
          }),
          signal: params.signal ?? AbortSignal.timeout(20_000),
        });
        if (res.ok) {
          if (!ep.isDirect) markApimiraModelHealthy(ep.model);
          const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = (json.choices?.[0]?.message?.content ?? "")
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
          if (text.length >= 20) return text.slice(0, 880);
        } else if (ep.isDirect) {
          markDirectDeepSeekUnavailable(res.status);
        } else {
          markApimiraModelUnhealthy(ep.model, res.status);
        }
      } catch {
        // continue fallback
      }
    }
  }

  return [extra, cleanEdit].filter(Boolean).join(". ").slice(0, 880);
}
