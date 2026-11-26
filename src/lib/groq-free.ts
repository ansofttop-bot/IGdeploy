import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
} from "./deepseek-models";

export const GROQ_FREE_MODEL = "qwen/qwen3.8-27b";
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

function normalizeMessagesForGroq(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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
        entry.content = content;
      } else if (Array.isArray(content)) {
        const text = content
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n");
        entry.content = text;
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

    // User message (supports multimodal text + inline/structured base64 images for Qwen 3.8 vision)
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
    return "Недействительный GROQ_API_KEY. Проверьте ключ в настройках секретов сервера.";
  }
  if (status === 429 || /rate_limit|quota|Too Many Requests/i.test(msg)) {
    return "Достигнут временный лимит запросов Groq Qwen 3.8 (HTTP 429). Попробуйте через несколько секунд.";
  }
  return (msg || `Groq HTTP ${status}`).slice(0, 260);
}

/**
 * Streams a Free-tier chat response using Qwen 3.8 (`qwen/qwen3.8-27b`) via Groq
 * with full support for OpenAI tools (function calling), multimodal image attachments,
 * optional reasoning thoughts (both `delta.reasoning` and `<think>...</think>` blocks),
 * and immediate AbortSignal cancellation.
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
    throw new Error("GROQ_API_KEY не настроен на сервере для бесплатного плана (Qwen 3.8).");
  }
  if (params.signal?.aborted) {
    const abortErr = new Error("Request aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }

  const model = resolveGroqFreeModel();
  const normalizedMessages = normalizeMessagesForGroq(params.messages);
  const hasTools = Array.isArray(params.tools) && params.tools.length > 0;

  // Inject reasoning directive into system message when reasoning is off to keep fast direct answers,
  // or enable explicit step-by-step thinking inside <think>...</think> when reasoning is on.
  const finalMessages = normalizedMessages.map((m, idx) => {
    if (idx === 0 && m.role === "system" && typeof m.content === "string") {
      const hint = params.reasoning
        ? "\n\n[Reasoning Mode: ON — Think step-by-step inside <think>...</think> before your final answer.]"
        : "\n\n/no_think";
      return { ...m, content: `${m.content}${hint}` };
    }
    return m;
  });

  const payload: Record<string, unknown> = {
    model,
    stream: true,
    temperature: params.temperature ?? 0.65,
    max_completion_tokens: params.maxTokens ?? 4096,
    messages: finalMessages,
    ...(hasTools ? { tools: params.tools, tool_choice: "auto" } : {}),
  };

  const upstream = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: params.signal ?? AbortSignal.timeout(45_000),
  });

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.text().catch(() => "");
    throw new Error(formatGroqError(upstream.status, errBody));
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
            // Check for partial "<think>" prefix at the end of work
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

      try {
        while (!closed && !params.signal?.aborted) {
          const { done, value } = await reader.read();
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
 * Non-streaming Free-tier Qwen 3.8 (Groq) text/JSON helper for Flow, Memory, and File Translation.
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

  const model = resolveGroqFreeModel();
  const normalizedMessages = normalizeMessagesForGroq(params.messages).map((m, idx) => {
    if (idx === 0 && m.role === "system" && typeof m.content === "string") {
      return { ...m, content: `${m.content}\n\n/no_think` };
    }
    return m;
  });

  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: params.temperature ?? 0.25,
        max_completion_tokens: params.maxTokens ?? 2048,
        ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: normalizedMessages,
      }),
      signal: params.signal ?? AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("[groq-free-text] failed:", formatGroqError(res.status, errBody));
      return null;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = (json.choices?.[0]?.message?.content ?? "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    return raw || null;
  } catch (err) {
    console.warn("[groq-free-text] exception:", (err as Error)?.message || err);
    return null;
  }
}

/**
 * Under-the-hood reference image analyzer -> detailed English Pollinations prompt.
 *
 * - On Free plan (and whenever GROQ_API_KEY is available), Qwen 3.8 Vision on Groq directly
 *   inspects the uploaded/referenced image(s), captures subject identity, pose, outfit,
 *   composition, lighting, colors, and style, applies the user's requested edit/generation
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
    "Output ONLY the final English prompt text — no quotes, no markdown, no bullet points, no preamble.\n\n/no_think";

  const userDirective = [
    `User request / edit instruction: ${cleanEdit}`,
    extra ? `Additional context: ${extra}` : "",
    "Describe the resulting image in full visual detail in English so an image generator recreates the reference faithfully with the requested modifications.",
  ]
    .filter(Boolean)
    .join("\n");

  // 1. Primary: Groq Qwen 3.8 multimodal vision analysis
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
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: resolveGroqFreeModel(),
          stream: false,
          temperature: 0.35,
          max_completion_tokens: 360,
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

  // 2. Fallback for Pro hourly Pollinations fallback when GROQ_API_KEY is not configured: DeepSeek < V4.0
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
