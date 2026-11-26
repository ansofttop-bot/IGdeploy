import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
} from "./deepseek-models";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const POLLINATIONS_GEN_OPENAI_URL = "https://gen.pollinations.ai/v1/chat/completions";
const POLLINATIONS_TEXT_OPENAI_URL = "https://text.pollinations.ai/openai";
// Verified live free anonymous model on Pollinations Classic API (/models -> "openai-fast")
const POLLINATIONS_FREE_MODEL = "openai-fast";

const MISTRAL_HEADER_TIMEOUT_MS = 20_000;
const POLLINATIONS_HEADER_TIMEOUT_MS = 28_000;

let mistralAuthBlockedUntil = 0;
let mistralBillingBlockedUntil = 0;
let pollinationsCooldownUntil = 0;

export interface MistralStreamParams {
  messages: any[];
  tools?: any[];
  temperature?: number;
  maxTokens?: number;
  hasVisionInput?: boolean;
  signal?: AbortSignal;
}

export interface MistralTextParams {
  messages: any[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  hasVisionInput?: boolean;
  timeoutMs?: number;
  /** Set to false for background jobs (like memory analysis) so they never burn keyless Pollinations quota. */
  allowPollinationsFallback?: boolean;
}

function createTimedAbortSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    ac.abort(new Error(`Upstream header timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const onParentAbort = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    ac.abort(parentSignal?.reason ?? new Error("Client aborted"));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  return {
    signal: ac.signal,
    clear: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (parentSignal) {
        parentSignal.removeEventListener("abort", onParentAbort);
      }
    },
  };
}

/**
 * Extracts plain text from either a string or Mistral's structured content chunk array
 * (`[{ type: "text", text: "..." }]`).
 */
export function extractMistralContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    let out = "";
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") {
        out += part.text;
      } else if (typeof (part as any).content === "string") {
        out += (part as any).content;
      }
    }
    return out;
  }
  return "";
}

/**
 * Mistral requires tool_call_id to be 9 alphanumeric characters (`^[a-zA-Z0-9]{9}$`).
 * Deterministically maps arbitrary tool_call_ids in conversation history into valid 9-char IDs.
 */
function toMistralToolId(rawId: string, map: Map<string, string>): string {
  const existing = map.get(rawId);
  if (existing) return existing;
  if (/^[a-zA-Z0-9]{9}$/.test(rawId)) {
    map.set(rawId, rawId);
    return rawId;
  }
  let hash = 2166136261;
  for (let i = 0; i < rawId.length; i++) {
    hash ^= rawId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  let n = (hash >>> 0) + map.size + 1;
  for (let i = 0; i < 9; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + (i + 7) * 13;
  }
  map.set(rawId, out);
  return out;
}

function flattenContentToText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text);
      } else if (part.type === "image_url") {
        texts.push("[Attached image]");
      }
    }
    return texts.join("\n").trim() || " ";
  }
  return String(content ?? "");
}

/**
 * Normalizes conversation messages to satisfy Mistral's strict chat-completions schema:
 * - Single `system` message at index 0
 * - Strict 9-char alphanumeric `tool_call_id`s
 * - No orphaned `tool` messages without preceding matching `assistant.tool_calls`
 * - No empty `assistant` messages without `tool_calls`
 * - No consecutive `user` or plain `assistant` messages
 * - Conversation never ends on an `assistant` message
 */
export function sanitizeMessagesForMistral(
  messages: any[],
  options?: { stripImages?: boolean },
): {
  sanitized: any[];
  hasImages: boolean;
} {
  let hasImages = false;
  const stripImages = Boolean(options?.stripImages);
  const toolIdMap = new Map<string, string>();
  const systemParts: string[] = [];
  const rawNonSystem: any[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const role = raw.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") continue;

    if (role === "system") {
      const txt = flattenContentToText(raw.content).trim();
      if (txt) systemParts.push(txt);
      continue;
    }

    if (role === "assistant") {
      const hasTools = Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0;
      const textContent = typeof raw.content === "string" ? raw.content : extractMistralContentText(raw.content);
      if (!hasTools && !textContent.trim()) {
        continue;
      }
      const msg: Record<string, any> = {
        role: "assistant",
        content: textContent,
      };
      if (hasTools) {
        msg.tool_calls = raw.tool_calls.map((tc: any, idx: number) => ({
          id: toMistralToolId(String(tc?.id || `tc_${idx}`), toolIdMap),
          type: "function",
          function: {
            name: String(tc?.function?.name || ""),
            arguments:
              typeof tc?.function?.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc?.function?.arguments ?? {}),
          },
        }));
      }
      rawNonSystem.push(msg);
      continue;
    }

    if (role === "tool") {
      const mappedId = toMistralToolId(String(raw.tool_call_id || "tc_0"), toolIdMap);
      const toolMsg: Record<string, any> = {
        role: "tool",
        tool_call_id: mappedId,
        content: typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content ?? ""),
      };
      if (raw.name && typeof raw.name === "string" && raw.name.trim()) {
        toolMsg.name = raw.name.trim();
      }
      rawNonSystem.push(toolMsg);
      continue;
    }

    // role === "user"
    if (Array.isArray(raw.content)) {
      if (stripImages) {
        const textOnly = flattenContentToText(raw.content);
        rawNonSystem.push({ role: "user", content: textOnly || " " });
      } else {
        const parts: any[] = [];
        for (const part of raw.content) {
          if (!part || typeof part !== "object") continue;
          if (part.type === "text" && typeof part.text === "string") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "image_url" && part.image_url?.url) {
            hasImages = true;
            parts.push({
              type: "image_url",
              image_url: { url: String(part.image_url.url) },
            });
          }
        }
        rawNonSystem.push({
          role: "user",
          content: parts.length > 0 ? parts : " ",
        });
      }
      continue;
    }

    rawNonSystem.push({
      role: "user",
      content: typeof raw.content === "string" ? raw.content || " " : String(raw.content ?? " "),
    });
  }

  // Enforce Mistral turn-ordering & tool-call integrity
  const normalized: any[] = [];
  const pendingToolIds = new Set<string>();

  for (const msg of rawNonSystem) {
    if (msg.role === "tool") {
      if (!pendingToolIds.has(msg.tool_call_id)) {
        continue;
      }
      pendingToolIds.delete(msg.tool_call_id);
      normalized.push(msg);
      continue;
    }

    // If previous assistant requested tool_calls that were never fulfilled, strip tool_calls from it
    if (pendingToolIds.size > 0) {
      pendingToolIds.clear();
      const last = normalized[normalized.length - 1];
      if (last && last.role === "assistant" && last.tool_calls) {
        delete last.tool_calls;
        if (!String(last.content || "").trim()) {
          normalized.pop();
        }
      }
    }

    const prev = normalized[normalized.length - 1];
    if (msg.role === "user" && prev && prev.role === "user") {
      if (typeof prev.content === "string" && typeof msg.content === "string") {
        prev.content = `${prev.content}\n\n${msg.content}`.trim();
      } else {
        const prevArr = Array.isArray(prev.content)
          ? prev.content
          : [{ type: "text", text: String(prev.content || "") }];
        const nextArr = Array.isArray(msg.content)
          ? msg.content
          : [{ type: "text", text: String(msg.content || "") }];
        prev.content = [...prevArr, ...nextArr];
      }
      continue;
    }

    if (msg.role === "assistant" && prev && prev.role === "assistant" && !prev.tool_calls && !msg.tool_calls) {
      prev.content = `${prev.content || ""}\n\n${msg.content || ""}`.trim();
      continue;
    }

    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc?.id) pendingToolIds.add(tc.id);
      }
    }

    normalized.push(msg);
  }

  // Drop leading assistant messages (Mistral expects first non-system turn to be user)
  while (normalized.length > 0 && normalized[0].role !== "user") {
    normalized.shift();
  }

  // Mistral forbids ending a non-prefix request on an assistant message
  while (normalized.length > 1 && normalized[normalized.length - 1].role === "assistant") {
    normalized.pop();
  }

  const sanitized: any[] = [];
  if (systemParts.length > 0) {
    sanitized.push({ role: "system", content: systemParts.join("\n\n") });
  }
  sanitized.push(...normalized);

  return { sanitized, hasImages };
}

function sanitizeToolsForMistral(tools?: any[]): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const cleaned = tools
    .filter((t) => t && t.type === "function" && t.function?.name)
    .map((t) => ({
      type: "function",
      function: {
        name: String(t.function.name),
        description: String(t.function.description || ""),
        parameters:
          t.function.parameters && typeof t.function.parameters === "object"
            ? {
                type: "object",
                properties: t.function.parameters.properties ?? {},
                ...(Array.isArray(t.function.parameters.required)
                  ? { required: t.function.parameters.required }
                  : {}),
              }
            : { type: "object", properties: {} },
      },
    }));
  return cleaned.length > 0 ? cleaned : undefined;
}

function getMistralCandidateModels(hasImages: boolean): string[] {
  const configured = (process.env.MISTRAL_MODEL || "").trim();
  const base = hasImages
    ? ["mistral-small-latest", "pixtral-12b-2409"]
    : ["mistral-small-latest", "ministral-8b-latest", "open-mistral-nemo"];
  if (configured && !base.includes(configured)) {
    return [configured, ...base];
  }
  return base;
}

export function hasMistralApiKey(): boolean {
  return Boolean((process.env.MISTRAL_API_KEY || "").trim());
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Request aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Request aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Streaming Mistral AI Free chat completion used across Chat & Engine workspaces.
 * Priority order:
 * 1. Official Mistral AI API (`MISTRAL_API_KEY`) across free-tier models
 * 2. Authenticated Pollinations Gateway (`POLLINATIONS_API_KEY` -> `gen.pollinations.ai`) if configured
 * 3. Keyless Pollinations Classic OpenAI endpoint (`openai-fast`) with 28s header timeout & single brief retry on 429
 */
export async function callMistralFreeChat(params: MistralStreamParams): Promise<Response> {
  const apiKey = (process.env.MISTRAL_API_KEY || "").trim();
  const pollinationsKey = (process.env.POLLINATIONS_API_KEY || "").trim();
  const { sanitized, hasImages } = sanitizeMessagesForMistral(params.messages);
  const useVision = Boolean(params.hasVisionInput || hasImages);
  const temperature = typeof params.temperature === "number" ? Math.min(1, Math.max(0, params.temperature)) : 0.7;
  const maxTokens = params.maxTokens && params.maxTokens > 0 ? Math.min(8192, params.maxTokens) : 4096;
  const cleanedTools = sanitizeToolsForMistral(params.tools);

  let mistralErr: { status: number; detail: string } | null = null;
  let pollinationsErr: { status: number; detail: string } | null = null;

  // 1. Official Mistral AI API
  if (apiKey && Date.now() >= mistralAuthBlockedUntil && Date.now() >= mistralBillingBlockedUntil) {
    const models = getMistralCandidateModels(useVision);
    for (const model of models) {
      if (params.signal?.aborted) {
        throw new Error("Request aborted");
      }
      const timed = createTimedAbortSignal(params.signal, MISTRAL_HEADER_TIMEOUT_MS);
      try {
        const body: Record<string, any> = {
          model,
          messages: sanitized,
          stream: true,
          temperature,
          max_tokens: maxTokens,
        };
        if (cleanedTools) {
          body.tools = cleanedTools;
          body.tool_choice = "auto";
        }
        const res = await fetch(MISTRAL_API_URL, {
          method: "POST",
          signal: timed.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        timed.clear();
        if (res.ok && res.body) {
          return res;
        }
        const errText = await res.text().catch(() => "");
        mistralErr = { status: res.status, detail: errText.slice(0, 220) };
        console.warn(`[mistral-free] ${model} failed (${res.status}):`, mistralErr.detail);

        if (res.status === 401 || res.status === 403) {
          mistralAuthBlockedUntil = Date.now() + 5 * 60_000;
          break;
        }
        if (res.status === 402) {
          // Account-level billing/free-tier quota exhausted on Mistral La Plateforme
          mistralBillingBlockedUntil = Date.now() + 2 * 60_000;
          break;
        }
        if ((res.status === 400 || res.status === 422) && cleanedTools) {
          const retryTimed = createTimedAbortSignal(params.signal, MISTRAL_HEADER_TIMEOUT_MS);
          try {
            const noToolRes = await fetch(MISTRAL_API_URL, {
              method: "POST",
              signal: retryTimed.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: sanitized,
                stream: true,
                temperature,
                max_tokens: maxTokens,
              }),
            });
            retryTimed.clear();
            if (noToolRes.ok && noToolRes.body) {
              return noToolRes;
            }
            mistralErr = { status: noToolRes.status, detail: (await noToolRes.text().catch(() => "")).slice(0, 220) };
          } catch (retryErr) {
            retryTimed.clear();
            mistralErr = { status: 504, detail: retryErr instanceof Error ? retryErr.message : String(retryErr) };
          }
        }
      } catch (err) {
        timed.clear();
        mistralErr = { status: 504, detail: err instanceof Error ? err.message : String(err) };
        console.warn(`[mistral-free] ${model} network/timeout error:`, mistralErr.detail);
      }
    }
  }

  // 2. Authenticated Pollinations Gateway if POLLINATIONS_API_KEY is configured (no 45s IP rate limit)
  const { sanitized: textOnlyMessages } = sanitizeMessagesForMistral(params.messages, { stripImages: true });
  if (pollinationsKey && !params.signal?.aborted) {
    const genTimed = createTimedAbortSignal(params.signal, POLLINATIONS_HEADER_TIMEOUT_MS);
    try {
      const genBody: Record<string, any> = {
        model: "mistral",
        messages: textOnlyMessages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      };
      if (cleanedTools) {
        genBody.tools = cleanedTools;
        genBody.tool_choice = "auto";
      }
      const res = await fetch(POLLINATIONS_GEN_OPENAI_URL, {
        method: "POST",
        signal: genTimed.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pollinationsKey}`,
          "User-Agent": "IGseek/1.0 (+https://igseek.app)",
        },
        body: JSON.stringify(genBody),
      });
      genTimed.clear();
      if (res.ok && res.body) {
        return res;
      }
      pollinationsErr = { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 220) };
      console.warn(`[mistral-free] gen.pollinations.ai failed (${res.status}):`, pollinationsErr.detail);
    } catch (err) {
      genTimed.clear();
      pollinationsErr = { status: 504, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  // 3. Keyless Pollinations Classic OpenAI fallback (`openai-fast`), with single brief retry on 429
  if (Date.now() < pollinationsCooldownUntil) {
    const waitSec = Math.max(1, Math.ceil((pollinationsCooldownUntil - Date.now()) / 1000));
    throw new Error(
      `Бесплатный сервер перегружен, попробуйте повторить запрос через ${waitSec} сек.`,
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error("Request aborted");
    }
    const polyTimed = createTimedAbortSignal(params.signal, POLLINATIONS_HEADER_TIMEOUT_MS);
    try {
      const fallbackBody: Record<string, any> = {
        model: POLLINATIONS_FREE_MODEL,
        messages: textOnlyMessages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      };
      if (cleanedTools) {
        fallbackBody.tools = cleanedTools;
        fallbackBody.tool_choice = "auto";
      }
      const res = await fetch(POLLINATIONS_TEXT_OPENAI_URL, {
        method: "POST",
        signal: polyTimed.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "IGseek/1.0 (+https://igseek.app)",
        },
        body: JSON.stringify(fallbackBody),
      });
      polyTimed.clear();
      if (res.ok && res.body) {
        return res;
      }
      const errTxt = await res.text().catch(() => "");
      pollinationsErr = { status: res.status, detail: errTxt.slice(0, 220) };
      console.warn(`[mistral-free] pollinations fallback failed (${res.status}):`, pollinationsErr.detail);

      if (res.status === 429 && attempt === 0) {
        // Previous request is finishing — wait briefly and retry once
        await sleepAbortable(2500, params.signal);
        continue;
      }
      if (res.status === 402 || res.status === 429) {
        const retryMatch = errTxt.match(/(\d+)\s*s(?:ec)?/i);
        const cooldownSec = retryMatch ? Math.min(45, Math.max(5, Number(retryMatch[1]))) : 15;
        pollinationsCooldownUntil = Date.now() + cooldownSec * 1000;
        throw new Error(
          `Бесплатный сервер временно ограничил частоту запросов — повторите через ${cooldownSec} сек.${
            !apiKey ? " (или настройте MISTRAL_API_KEY на сервере)" : ""
          }`,
        );
      }
      break;
    } catch (err) {
      polyTimed.clear();
      if (err instanceof Error && /Бесплатный сервер|Request aborted/i.test(err.message)) {
        throw err;
      }
      pollinationsErr = { status: 504, detail: err instanceof Error ? err.message : String(err) };
      console.warn("[mistral-free] pollinations fallback network/timeout:", pollinationsErr.detail);
      break;
    }
  }

  // Produce an accurate, diagnostic-friendly message without mixing status codes across providers
  if (mistralErr?.status === 402) {
    throw new Error(
      "На ключе Mistral API исчерпан баланс или не активирован бесплатный тариф (HTTP 402), а резервный сервер сейчас не ответил. Попробуйте через несколько секунд или проверьте MISTRAL_API_KEY в Mistral Console.",
    );
  }
  const finalStatus = pollinationsErr?.status ?? mistralErr?.status ?? 503;
  const finalDetail = pollinationsErr?.detail || mistralErr?.detail || "Service temporarily unavailable";
  throw new Error(`Free AI service error (${finalStatus}): ${finalDetail}`);
}

/**
 * Non-streaming Mistral AI Free helper used for Flow planning/steps, file interpretation,
 * memory extraction, and reference image description on the Free tier.
 */
export async function callMistralFreeText(params: MistralTextParams): Promise<string | null> {
  const apiKey = (process.env.MISTRAL_API_KEY || "").trim();
  const pollinationsKey = (process.env.POLLINATIONS_API_KEY || "").trim();
  const { sanitized, hasImages } = sanitizeMessagesForMistral(params.messages);
  const useVision = Boolean(params.hasVisionInput || hasImages);
  const temperature = typeof params.temperature === "number" ? Math.min(1, Math.max(0, params.temperature)) : 0.4;
  const maxTokens = params.maxTokens && params.maxTokens > 0 ? Math.min(8192, params.maxTokens) : 2048;
  const timeoutMs = params.timeoutMs ?? 20_000;
  const allowPollinationsFallback = params.allowPollinationsFallback !== false;

  if (apiKey && Date.now() >= mistralAuthBlockedUntil && Date.now() >= mistralBillingBlockedUntil) {
    const models = getMistralCandidateModels(useVision);
    for (const model of models) {
      try {
        const body: Record<string, any> = {
          model,
          messages: sanitized,
          stream: false,
          temperature,
          max_tokens: maxTokens,
        };
        if (params.jsonMode) {
          body.response_format = { type: "json_object" };
        }
        const res = await fetch(MISTRAL_API_URL, {
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const json = (await res.json()) as any;
          const text = extractMistralContentText(json?.choices?.[0]?.message?.content).trim();
          if (text) return text;
        } else if (res.status === 401 || res.status === 403) {
          mistralAuthBlockedUntil = Date.now() + 5 * 60_000;
          break;
        } else if (res.status === 402) {
          mistralBillingBlockedUntil = Date.now() + 2 * 60_000;
          break;
        }
      } catch (err) {
        console.warn(`[mistral-free-text] ${model} failed:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Skip keyless Pollinations for background jobs or vision-only requests
  if (!allowPollinationsFallback || useVision) {
    return null;
  }

  const { sanitized: textOnly } = sanitizeMessagesForMistral(params.messages, { stripImages: true });

  if (pollinationsKey) {
    try {
      const res = await fetch(POLLINATIONS_GEN_OPENAI_URL, {
        method: "POST",
        signal: AbortSignal.timeout(Math.min(timeoutMs, POLLINATIONS_HEADER_TIMEOUT_MS)),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pollinationsKey}`,
          "User-Agent": "IGseek/1.0 (+https://igseek.app)",
        },
        body: JSON.stringify({
          model: "mistral",
          messages: textOnly,
          stream: false,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = extractMistralContentText(json?.choices?.[0]?.message?.content).trim();
        if (text) return text;
      }
    } catch (err) {
      console.warn("[mistral-free-text] gen.pollinations.ai failed:", err instanceof Error ? err.message : String(err));
    }
  }

  if (Date.now() < pollinationsCooldownUntil) {
    return null;
  }

  try {
    const res = await fetch(POLLINATIONS_TEXT_OPENAI_URL, {
      method: "POST",
      signal: AbortSignal.timeout(Math.min(timeoutMs, POLLINATIONS_HEADER_TIMEOUT_MS)),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "IGseek/1.0 (+https://igseek.app)",
      },
      body: JSON.stringify({
        model: POLLINATIONS_FREE_MODEL,
        messages: textOnly,
        stream: false,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const text = extractMistralContentText(json?.choices?.[0]?.message?.content).trim();
      if (text) return text;
    } else if (res.status === 402 || res.status === 429) {
      pollinationsCooldownUntil = Date.now() + 15_000;
    }
  } catch (err) {
    console.warn("[mistral-free-text] fallback failed:", err instanceof Error ? err.message : String(err));
  }

  return null;
}

async function synthesizeEditPromptWithDeepSeek(params: {
  visualDescription: string;
  editPrompt: string;
  deepseekKey: string;
  apimiraKey: string;
  apimiraBaseUrl: string;
}): Promise<string | null> {
  const sys =
    "You are an expert visual prompt writer for text-to-image generation. Given a faithful description of an existing reference image and a requested edit, output ONE detailed, vivid English image-generation prompt (max 120 words) that preserves the original subject, pose, composition, camera angle, lighting, and artistic style while cleanly applying the requested edit. Output ONLY the final prompt, no explanations or quotes.";
  const usr = `REFERENCE IMAGE DESCRIPTION:\n${params.visualDescription}\n\nREQUESTED EDIT:\n${params.editPrompt}`;

  if (shouldTryDirectDeepSeek(params.deepseekKey, params.apimiraKey)) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${params.deepseekKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_DIRECT_CHAT,
          stream: false,
          temperature: 0.4,
          max_tokens: 280,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr },
          ],
        }),
        signal: AbortSignal.timeout(18_000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = String(json?.choices?.[0]?.message?.content || "").trim();
        if (text) return text;
      } else {
        markDirectDeepSeekUnavailable(res.status);
      }
    } catch {
      // fall through
    }
  }

  if (params.apimiraKey) {
    for (const dsModel of getApimiraFallbackChain("f1", false)) {
      try {
        const res = await fetch(`${params.apimiraBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${params.apimiraKey}`,
          },
          body: JSON.stringify({
            model: dsModel,
            stream: false,
            temperature: 0.4,
            max_tokens: 280,
            ...APIMIRA_NO_REASONING_PARAMS,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: usr },
            ],
          }),
          signal: AbortSignal.timeout(22_000),
        });
        if (res.ok) {
          markApimiraModelHealthy(dsModel);
          const json = (await res.json()) as any;
          const text = String(json?.choices?.[0]?.message?.content || "").trim();
          if (text) return text;
        } else {
          markApimiraModelUnhealthy(dsModel, res.status);
          if (res.status === 401 || res.status === 402 || res.status === 403) break;
        }
      } catch {
        // try next
      }
    }
  }

  return null;
}

/**
 * Since Pollinations cannot accept reference images natively, this helper:
 * 1) Inspects the reference image with vision to extract an accurate description of what is in the picture.
 * 2) Synthesizes a single rich English text-to-image prompt preserving the scene while applying the edit
 *    (using DeepSeek on silent Pro abuse-protection fallback, or Mistral Free on Free tier).
 */
export async function buildReferenceAwarePollinationsPrompt(params: {
  sourceImageDataUrl?: string | null;
  editPrompt: string;
  extraDescription?: string;
  useDeepSeekSynthesis: boolean;
  deepseekKey?: string;
  apimiraKey?: string;
  apimiraBaseUrl?: string;
}): Promise<string> {
  const cleanEdit = String(params.editPrompt || "").trim();
  const fallbackDesc = String(params.extraDescription || "").trim();

  let visualDescription = fallbackDesc;

  if (params.sourceImageDataUrl && params.sourceImageDataUrl.startsWith("data:image/")) {
    const described = await callMistralFreeText({
      messages: [
        {
          role: "system",
          content:
            "Describe this image precisely and factually in English (subject, appearance, clothing, pose, objects, background, lighting, colors, camera framing, art style) in 3-5 concise sentences so an image generator can faithfully recreate it. Output only the description.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe every important visual detail of this reference image." },
            { type: "image_url", image_url: { url: params.sourceImageDataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      maxTokens: 320,
      hasVisionInput: true,
      timeoutMs: 18_000,
      allowPollinationsFallback: false,
    });
    if (described) {
      visualDescription = described;
    }
  }

  if (!visualDescription) {
    return cleanEdit;
  }

  if (params.useDeepSeekSynthesis && (params.deepseekKey || params.apimiraKey)) {
    const dsPrompt = await synthesizeEditPromptWithDeepSeek({
      visualDescription,
      editPrompt: cleanEdit,
      deepseekKey: params.deepseekKey || "",
      apimiraKey: params.apimiraKey || "",
      apimiraBaseUrl: params.apimiraBaseUrl || "https://apimira.com/v1",
    });
    if (dsPrompt) return dsPrompt;
  }

  const mistralSynthesized = await callMistralFreeText({
    messages: [
      {
        role: "system",
        content:
          "You write vivid English text-to-image prompts. Merge the reference image description with the requested edit into ONE seamless English prompt (max 120 words) that preserves the original subject, composition, lighting, and style while applying the edit. Output ONLY the final prompt.",
      },
      {
        role: "user",
        content: `REFERENCE IMAGE:\n${visualDescription}\n\nEDIT REQUEST:\n${cleanEdit}`,
      },
    ],
    temperature: 0.35,
    maxTokens: 280,
    timeoutMs: 15_000,
    allowPollinationsFallback: false,
  });

  if (mistralSynthesized) return mistralSynthesized;
  return `${visualDescription}. Apply edit: ${cleanEdit}`;
}
