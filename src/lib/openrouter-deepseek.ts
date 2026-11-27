import type { UiModel } from "./deepseek-models";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Strictly DeepSeek < V4.0 models on OpenRouter, differentiated by plan:
 *
 * - Free Plan (lowest-cost DeepSeek < V4.0 models on OpenRouter):
 *     instinct / f1 -> deepseek/deepseek-v3.2      ($0.26 / $0.38 per 1M, Sparse Attention)
 *     chat          -> deepseek/deepseek-v3.2-exp  ($0.27 / $0.41 per 1M)
 *     fallback      -> deepseek/deepseek-chat-v3-0324
 *
 * - Pro Plan (stronger, full-capacity yet economical DeepSeek < V4.0 models):
 *     instinct      -> deepseek/deepseek-v3.1-terminus ($0.27 / $1.00 per 1M, 671B Terminus)
 *     chat          -> deepseek/deepseek-chat-v3.1     ($0.25 / $0.95 per 1M, 671B hybrid)
 *     f1 / fast     -> deepseek/deepseek-chat-v3-0324  ($0.25 / $1.00 per 1M, 685B V3 0324)
 *     reasoner      -> deepseek/deepseek-r1-0528       ($0.571 / $2.286 per 1M, R1 0528)
 */
export const OPENROUTER_FREE_INSTINCT = "deepseek/deepseek-v3.2";
export const OPENROUTER_FREE_CHAT = "deepseek/deepseek-v3.2-exp";
export const OPENROUTER_FREE_F1 = "deepseek/deepseek-v3.2";
export const OPENROUTER_FREE_FALLBACK = "deepseek/deepseek-chat-v3-0324";

export const OPENROUTER_PRO_INSTINCT = "deepseek/deepseek-v3.1-terminus";
export const OPENROUTER_PRO_CHAT = "deepseek/deepseek-chat-v3.1";
export const OPENROUTER_PRO_F1 = "deepseek/deepseek-chat-v3-0324";
export const OPENROUTER_PRO_REASONER = "deepseek/deepseek-r1-0528";

export function getOpenRouterBaseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).trim().replace(/\/+$/, "");
}

export function getOpenRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterApiKey());
}

function isStrictlyPreV4Model(modelId: string): boolean {
  return Boolean(modelId) && !/v4/i.test(modelId) && !/latest$/i.test(modelId);
}

export function resolveOpenRouterModel(
  tier: "free" | "pro",
  uiModel: UiModel = "instinct",
  reasoning = false,
): string {
  if (tier === "free") {
    const override = (process.env.OPENROUTER_FREE_MODEL || "").trim();
    if (override && isStrictlyPreV4Model(override)) return override;
    if (uiModel === "chat") return OPENROUTER_FREE_CHAT;
    if (uiModel === "f1") return OPENROUTER_FREE_F1;
    return OPENROUTER_FREE_INSTINCT;
  }

  const override = (process.env.OPENROUTER_PRO_MODEL || "").trim();
  if (override && isStrictlyPreV4Model(override)) return override;
  if (reasoning) return OPENROUTER_PRO_REASONER;
  if (uiModel === "chat") return OPENROUTER_PRO_CHAT;
  if (uiModel === "f1") return OPENROUTER_PRO_F1;
  return OPENROUTER_PRO_INSTINCT;
}

export function getOpenRouterFallbackChain(
  tier: "free" | "pro",
  uiModel: UiModel = "instinct",
  reasoning = false,
): string[] {
  const primary = resolveOpenRouterModel(tier, uiModel, reasoning);
  const pool =
    tier === "free"
      ? [
          primary,
          OPENROUTER_FREE_INSTINCT,
          OPENROUTER_FREE_CHAT,
          OPENROUTER_FREE_FALLBACK,
        ]
      : [
          primary,
          OPENROUTER_PRO_INSTINCT,
          OPENROUTER_PRO_CHAT,
          OPENROUTER_PRO_F1,
          OPENROUTER_FREE_INSTINCT,
        ];

  return Array.from(new Set(pool.filter((m) => isStrictlyPreV4Model(m))));
}

const DATA_URL_IMG_RE = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+)\)/g;

function stripInlineImages(raw: string): string {
  return raw.replace(DATA_URL_IMG_RE, "[прикреплённое изображение]").trim();
}

function normalizeMessagesForOpenRouter(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = String(msg.role || "user");
    const content = msg.content;

    if (role === "system") {
      const text =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).filter(Boolean).join("\n").trim()
            : "";
      if (text) out.push({ role: "system", content: text });
      continue;
    }

    if (role === "assistant") {
      const entry: Record<string, unknown> = { role: "assistant" };
      if (typeof content === "string") {
        entry.content = stripInlineImages(content);
      } else if (Array.isArray(content)) {
        const text = content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).filter(Boolean).join("\n");
        entry.content = stripInlineImages(text);
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

    // User message (DeepSeek V3/R1 on OpenRouter are text-only, so normalize any image_url parts cleanly)
    if (typeof content === "string") {
      out.push({ role: "user", content: stripInlineImages(content) || "(прикреплённое изображение)" });
    } else if (Array.isArray(content)) {
      const segments: string[] = [];
      for (const p of content as any[]) {
        if (!p || typeof p !== "object") continue;
        if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
          segments.push(stripInlineImages(p.text));
        } else if (p.type === "image_url") {
          segments.push("[прикреплённое изображение]");
        }
      }
      out.push({
        role: "user",
        content: segments.filter(Boolean).join("\n").trim() || "(прикреплённое изображение)",
      });
    } else {
      out.push({ role: "user", content: String(content || "(empty message)") });
    }
  }

  return out.length > 0 ? out : [{ role: "user", content: "Hello" }];
}

function modelSupportsReasoningParam(modelId: string): boolean {
  // deepseek-chat-v3-0324 and plain deepseek-chat do not support OpenRouter reasoning control parameter
  if (/deepseek-chat-v3-0324|\/deepseek-chat$/i.test(modelId)) return false;
  return true;
}

function buildOpenRouterPayload(params: {
  model: string;
  tier: "free" | "pro";
  messages: Array<Record<string, unknown>>;
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>;
  reasoning?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  jsonMode?: boolean;
  omitReasoningParam?: boolean;
}): Record<string, unknown> {
  const normalizedMessages = normalizeMessagesForOpenRouter(params.messages);
  const hasTools = Array.isArray(params.tools) && params.tools.length > 0;
  const isPureR1 = /deepseek-r1/i.test(params.model);

  const payload: Record<string, unknown> = {
    model: params.model,
    stream: params.stream,
    temperature: params.temperature ?? 0.65,
    messages: normalizedMessages,
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    ...(hasTools ? { tools: params.tools, tool_choice: "auto" } : {}),
    ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  if (!params.omitReasoningParam && modelSupportsReasoningParam(params.model)) {
    if (params.reasoning) {
      payload.reasoning = {
        enabled: true,
        effort: params.tier === "free" ? "low" : "medium",
      };
    } else if (!isPureR1) {
      payload.reasoning = { enabled: false };
    }
  }

  return payload;
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
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getModelCooldownMap(): Map<string, number> {
  const g = globalThis as typeof globalThis & {
    __igseekOpenRouterModelCooldowns?: Map<string, number>;
  };
  if (!g.__igseekOpenRouterModelCooldowns) {
    g.__igseekOpenRouterModelCooldowns = new Map();
  }
  return g.__igseekOpenRouterModelCooldowns;
}

function isOpenRouterModelCoolingDown(modelId: string, now = Date.now()): boolean {
  const until = getModelCooldownMap().get(modelId);
  if (!until) return false;
  if (until <= now) {
    getModelCooldownMap().delete(modelId);
    return false;
  }
  return true;
}

function markOpenRouterModelCooldown(modelId: string, cooldownMs = 60_000): void {
  getModelCooldownMap().set(modelId, Date.now() + cooldownMs);
}

function clearOpenRouterModelCooldown(modelId: string): void {
  getModelCooldownMap().delete(modelId);
}

async function fetchWithHeaderTimeout(
  url: string,
  init: RequestInit,
  headerTimeoutMs = 12_000,
  externalSignal?: AbortSignal,
): Promise<Response> {
  if (externalSignal?.aborted) throw createAbortError();
  const ac = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => ac.abort(externalSignal?.reason);
  if (externalSignal) externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort(new Error(`openrouter_header_timeout_${headerTimeoutMs}ms`));
  }, headerTimeoutMs);

  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (err) {
    if (timedOut) {
      throw new Error(`OpenRouter не ответил за ${Math.round(headerTimeoutMs / 1000)} сек (таймаут). Повторите запрос.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

function buildOpenRouterHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": (process.env.OPENROUTER_SITE_URL || "https://igseek.app").trim(),
    "X-Title": "IGseek",
  };
}

function formatOpenRouterError(status: number, rawBody: string): string {
  let msg = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed?.error?.message === "string") {
      msg = parsed.error.message;
    }
  } catch {
    // keep rawBody
  }
  if (status === 401 || status === 403) {
    return "Недействительный OPENROUTER_API_KEY. Проверьте ключ OpenRouter в секретах сервера.";
  }
  if (status === 402 || /insufficient|credits|balance/i.test(msg)) {
    return "Недостаточно средств на балансе OpenRouter (HTTP 402). Пополните счёт OpenRouter.";
  }
  if (status === 429 || /rate_limit|Too Many Requests/i.test(msg)) {
    return "Временный лимит запросов OpenRouter (HTTP 429). Повторите через пару секунд.";
  }
  return (msg || `OpenRouter HTTP ${status}`).slice(0, 260);
}

/**
 * Streams chat completions via OpenRouter using strictly DeepSeek < V4.0 models,
 * separating Free (cheapest DeepSeek < V4.0) and Pro (more powerful DeepSeek < V4.0).
 */
export async function callOpenRouterDeepSeekStream(params: {
  tier: "free" | "pro";
  uiModel?: UiModel;
  messages: Array<Record<string, unknown>>;
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>;
  reasoning?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<{ response: Response; modelUsed: string }> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY не настроен на сервере.");
  }
  if (params.signal?.aborted) throw createAbortError();

  const baseUrl = getOpenRouterBaseUrl();
  const rawCandidates = getOpenRouterFallbackChain(
    params.tier,
    params.uiModel ?? "instinct",
    Boolean(params.reasoning),
  );
  const healthyCandidates = rawCandidates.filter((m) => !isOpenRouterModelCoolingDown(m));
  const candidates = healthyCandidates.length > 0 ? healthyCandidates : rawCandidates;

  let upstream: Response | null = null;
  let usedModel = candidates[0];
  let lastStatus = 500;
  let lastErrBody = "";
  let lastNetworkErr: Error | null = null;

  outer: for (const modelId of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (params.signal?.aborted) throw createAbortError();

      const omitReasoningParam = attempt === 1 && lastStatus === 400;
      const payload = buildOpenRouterPayload({
        model: modelId,
        tier: params.tier,
        messages: params.messages,
        tools: params.tools,
        reasoning: params.reasoning,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        stream: true,
        omitReasoningParam,
      });

      let res: Response;
      try {
        res = await fetchWithHeaderTimeout(
          `${baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: buildOpenRouterHeaders(apiKey),
            body: JSON.stringify(payload),
          },
          params.reasoning ? 22_000 : 12_000,
          params.signal,
        );
      } catch (reqErr: any) {
        if (params.signal?.aborted || reqErr?.name === "AbortError") throw reqErr;
        lastNetworkErr = reqErr instanceof Error ? reqErr : new Error(String(reqErr));
        markOpenRouterModelCooldown(modelId, 45_000);
        break;
      }

      if (res.ok && res.body) {
        clearOpenRouterModelCooldown(modelId);
        upstream = res;
        usedModel = modelId;
        break outer;
      }

      lastStatus = res.status;
      lastErrBody = await res.text().catch(() => "");

      if (res.status === 401 || res.status === 402 || res.status === 403) {
        break outer;
      }
      if (attempt === 0 && res.status === 400 && /reasoning|thinking|parameter/i.test(lastErrBody)) {
        continue;
      }
      // On 429/5xx, put this shard in brief cooldown and immediately fail over to the next candidate
      if (res.status === 429 || res.status >= 500) {
        markOpenRouterModelCooldown(modelId, res.status === 429 ? 45_000 : 60_000);
        break;
      }
      break;
    }
  }

  if (!upstream || !upstream.body) {
    if (lastNetworkErr && !lastErrBody) {
      throw lastNetworkErr;
    }
    throw new Error(formatOpenRouterError(lastStatus, lastErrBody));
  }

  const upstreamBody = upstream.body;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const STALL_TIMEOUT_MS = 18_000;

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
              if (before) emit({ choices: [{ delta: { content: before }, finish_reason: null }] });
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
              if (safe) emit({ choices: [{ delta: { content: safe }, finish_reason: null }] });
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
          let stallTimer: ReturnType<typeof setTimeout> | null = null;
          const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
              stallTimer = setTimeout(() => {
                void reader.cancel().catch(() => {});
                reject(new Error("OpenRouter stream stalled (18s)"));
              }, STALL_TIMEOUT_MS);
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
            if (parsed?.error) {
              const errCode = Number(parsed.error?.code || 502);
              const errMsg = formatOpenRouterError(
                Number.isFinite(errCode) ? errCode : 502,
                JSON.stringify(parsed),
              );
              markOpenRouterModelCooldown(usedModel, 45_000);
              emit({ error: { message: errMsg, code: errCode } });
              finish();
              return;
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
              emit({ choices: [{ delta: { reasoning_content: rChunk }, finish_reason: null }] });
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
                choices: [{ delta: {}, finish_reason: choice.finish_reason }],
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
          console.error("[openrouter-deepseek] stream error:", err);
          markOpenRouterModelCooldown(usedModel, 45_000);
          emit({
            error: {
              message: err instanceof Error ? err.message : "OpenRouter stream interrupted",
            },
          });
          finish();
        }
      } finally {
        if (params.signal) params.signal.removeEventListener("abort", onAbort);
      }
    },
  });

  return {
    modelUsed: usedModel,
    response: new Response(sseStream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    }),
  };
}

/**
 * Non-streaming OpenRouter DeepSeek (< V4.0) text/JSON completion for Flow, Memory, and File Translation.
 */
export async function callOpenRouterDeepSeekText(params: {
  tier: "free" | "pro";
  uiModel?: UiModel;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey || params.signal?.aborted) return null;

  const baseUrl = getOpenRouterBaseUrl();
  const rawCandidates = getOpenRouterFallbackChain(params.tier, params.uiModel ?? "instinct", false);
  const healthy = rawCandidates.filter((m) => !isOpenRouterModelCoolingDown(m));
  const candidates = healthy.length > 0 ? healthy : rawCandidates;

  for (const modelId of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const omitReasoningParam = attempt === 1;
        const payload = buildOpenRouterPayload({
          model: modelId,
          tier: params.tier,
          messages: params.messages,
          temperature: params.temperature ?? 0.25,
          maxTokens: params.maxTokens,
          stream: false,
          jsonMode: params.jsonMode,
          omitReasoningParam,
        });

        const res = await fetchWithHeaderTimeout(
          `${baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: buildOpenRouterHeaders(apiKey),
            body: JSON.stringify(payload),
          },
          params.timeoutMs ?? 15_000,
          params.signal,
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.warn(`[openrouter-text] ${modelId} failed:`, formatOpenRouterError(res.status, errBody));
          if (res.status === 401 || res.status === 402 || res.status === 403) return null;
          if (attempt === 0 && res.status === 400 && /reasoning|response_format|parameter/i.test(errBody)) {
            continue;
          }
          if (res.status === 429 || res.status >= 500) {
            markOpenRouterModelCooldown(modelId, 45_000);
          }
          break;
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = (json.choices?.[0]?.message?.content ?? "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();
        if (raw) {
          clearOpenRouterModelCooldown(modelId);
          return raw;
        }
        break;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return null;
        markOpenRouterModelCooldown(modelId, 45_000);
        console.warn(`[openrouter-text] ${modelId} exception:`, (err as Error)?.message || err);
        break;
      }
    }
  }
  return null;
}
