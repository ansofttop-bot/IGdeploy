import { GoogleGenAI, ThinkingLevel, Type, type Content, type FunctionDeclaration, type Part, type Schema } from "@google/genai";
import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
} from "./deepseek-models";

export const GEMINI_FREE_MODEL = "gemini-4-hydrogen";

export function isGeminiFreeConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || "").trim());
}

export function resolveGeminiFreeModel(): string {
  const override = (process.env.GEMINI_FREE_MODEL || "").trim();
  return override || GEMINI_FREE_MODEL;
}

export function getGeminiServerClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const DATA_URL_IMG_RE = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+)\)/g;

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const mimeType = match[1].trim().toLowerCase();
  const data = match[2].replace(/\s+/g, "");
  if (!mimeType || !data) return null;
  return { mimeType, data };
}

function splitTextAndInlineImages(raw: string): Part[] {
  const parts: Part[] = [];
  let cursor = 0;
  for (const match of raw.matchAll(DATA_URL_IMG_RE)) {
    const idx = match.index ?? 0;
    const before = raw.slice(cursor, idx).trim();
    if (before) parts.push({ text: before });
    const decoded = parseDataUrl(match[1]);
    if (decoded) {
      parts.push({ inlineData: { mimeType: decoded.mimeType, data: decoded.data } });
    }
    cursor = idx + match[0].length;
  }
  const tail = raw.slice(cursor).trim();
  if (tail) parts.push({ text: tail });
  return parts;
}

function toGeminiSchemaType(rawType: unknown): Type {
  const normalized = String(rawType || "string").toLowerCase();
  switch (normalized) {
    case "object":
      return Type.OBJECT;
    case "array":
      return Type.ARRAY;
    case "number":
      return Type.NUMBER;
    case "integer":
      return Type.INTEGER;
    case "boolean":
      return Type.BOOLEAN;
    default:
      return Type.STRING;
  }
}

function convertJsonSchemaToGeminiSchema(raw: unknown): Schema {
  if (!raw || typeof raw !== "object") {
    return { type: Type.STRING };
  }
  const obj = raw as Record<string, unknown>;
  const type = toGeminiSchemaType(obj.type);
  const schema: Schema = { type };

  if (typeof obj.description === "string" && obj.description.trim()) {
    schema.description = obj.description.trim();
  }
  if (Array.isArray(obj.enum) && obj.enum.length > 0) {
    const strEnum = obj.enum.map((v) => String(v)).filter(Boolean);
    if (strEnum.length > 0 && type === Type.STRING) {
      schema.enum = strEnum;
    }
  }

  if (type === Type.OBJECT) {
    const rawProps = obj.properties && typeof obj.properties === "object"
      ? (obj.properties as Record<string, unknown>)
      : {};
    const props: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(rawProps)) {
      props[k] = convertJsonSchemaToGeminiSchema(v);
    }
    schema.properties = props;
    if (Array.isArray(obj.required)) {
      const req = obj.required.filter((r): r is string => typeof r === "string" && r in props);
      if (req.length > 0) schema.required = req;
    }
  } else if (type === Type.ARRAY) {
    schema.items = convertJsonSchemaToGeminiSchema(obj.items ?? { type: "string" });
  }

  return schema;
}

function convertOpenAiToolsToGemini(
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>,
): FunctionDeclaration[] {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const declarations: FunctionDeclaration[] = [];
  for (const tool of tools) {
    if (!tool || tool.type !== "function" || !tool.function?.name) continue;
    const decl: FunctionDeclaration = {
      name: tool.function.name,
      description: tool.function.description || tool.function.name,
    };
    if (tool.function.parameters && typeof tool.function.parameters === "object") {
      decl.parameters = convertJsonSchemaToGeminiSchema(tool.function.parameters);
    }
    declarations.push(decl);
  }
  return declarations;
}

function convertOpenAiMessagesToGemini(
  messages: Array<Record<string, unknown>>,
): { systemInstruction: string; contents: Content[] } {
  const systemBlocks: string[] = [];
  const contents: Content[] = [];
  const toolCallIdToName = new Map<string, string>();

  const pushTurn = (role: "user" | "model", parts: Part[]) => {
    if (parts.length === 0) return;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts = [...(prev.parts ?? []), ...parts];
    } else {
      contents.push({ role, parts });
    }
  };

  for (const msg of messages) {
    const role = String(msg.role || "user");
    const content = msg.content;

    if (role === "system") {
      if (typeof content === "string" && content.trim()) {
        systemBlocks.push(content.trim());
      } else if (Array.isArray(content)) {
        const joined = content
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n")
          .trim();
        if (joined) systemBlocks.push(joined);
      }
      continue;
    }

    if (role === "assistant") {
      const parts: Part[] = [];
      if (typeof content === "string" && content.trim()) {
        parts.push({ text: content });
      } else if (Array.isArray(content)) {
        for (const p of content as any[]) {
          if (p?.type === "text" && typeof p.text === "string" && p.text.trim()) {
            parts.push({ text: p.text });
          }
        }
      }
      const toolCalls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as any[]) : [];
      for (const tc of toolCalls) {
        const name = String(tc?.function?.name || "").trim();
        if (!name) continue;
        if (typeof tc?.id === "string" && tc.id) {
          toolCallIdToName.set(tc.id, name);
        }
        let args: Record<string, unknown> = {};
        const rawArgs = tc?.function?.arguments;
        if (typeof rawArgs === "string" && rawArgs.trim()) {
          try {
            const parsed = JSON.parse(rawArgs);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            args = {};
          }
        } else if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
          args = rawArgs as Record<string, unknown>;
        }
        parts.push({ functionCall: { name, args } });
      }
      pushTurn("model", parts);
      continue;
    }

    if (role === "tool") {
      const callId = typeof msg.tool_call_id === "string" ? msg.tool_call_id : "";
      const fnName =
        (typeof msg.name === "string" && msg.name.trim()) ||
        toolCallIdToName.get(callId) ||
        "tool_result";
      let responseObj: Record<string, unknown>;
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          responseObj =
            parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : { result: parsed };
        } catch {
          responseObj = { result: content };
        }
      } else if (content && typeof content === "object" && !Array.isArray(content)) {
        responseObj = content as Record<string, unknown>;
      } else {
        responseObj = { result: String(content ?? "") };
      }
      pushTurn("user", [{ functionResponse: { name: fnName, response: responseObj } }]);
      continue;
    }

    // Default: user message
    const parts: Part[] = [];
    if (typeof content === "string") {
      parts.push(...splitTextAndInlineImages(content));
    } else if (Array.isArray(content)) {
      for (const p of content as any[]) {
        if (!p || typeof p !== "object") continue;
        if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
          parts.push(...splitTextAndInlineImages(p.text));
        } else if (p.type === "image_url" && typeof p.image_url?.url === "string") {
          const decoded = parseDataUrl(p.image_url.url);
          if (decoded) {
            parts.push({ inlineData: { mimeType: decoded.mimeType, data: decoded.data } });
          }
        }
      }
    }
    if (parts.length === 0) {
      parts.push({ text: "(empty message)" });
    }
    pushTurn("user", parts);
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hello" }] });
  } else if (contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Continue." }] });
  }

  return {
    systemInstruction: systemBlocks.join("\n\n").trim(),
    contents,
  };
}

function formatGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "Gemini request failed");
  const status = Number((err as any)?.status ?? (err as any)?.code ?? 0);
  if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return "Недействительный GEMINI_API_KEY. Проверьте ключ в настройках секретов сервера.";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return "Достигнут временный лимит запросов Gemini (HTTP 429). Попробуйте через несколько секунд.";
  }
  return msg.slice(0, 240);
}

/**
 * Streams a Free-tier chat response using Google Gemini (`gemini-4-hydrogen`)
 * with full support for tools (function calling), multimodal attachments,
 * optional reasoning thoughts, and immediate AbortSignal cancellation.
 * Emits an OpenAI-compatible SSE Response so chat.ts consumes it seamlessly.
 */
export async function callGeminiFreeChatStream(params: {
  messages: Array<Record<string, unknown>>;
  tools?: Array<{ type: string; function?: { name: string; description?: string; parameters?: unknown } }>;
  reasoning?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const ai = getGeminiServerClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY не настроен на сервере для бесплатного плана.");
  }
  if (params.signal?.aborted) {
    const abortErr = new Error("Request aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }

  const model = resolveGeminiFreeModel();
  const { systemInstruction, contents } = convertOpenAiMessagesToGemini(params.messages);
  const functionDeclarations = convertOpenAiToolsToGemini(params.tools);

  const config: Record<string, unknown> = {
    maxOutputTokens: params.maxTokens ?? 4096,
    thinkingConfig: params.reasoning
      ? { thinkingLevel: ThinkingLevel.MEDIUM, includeThoughts: true }
      : { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (functionDeclarations.length > 0) {
    config.tools = [{ functionDeclarations }];
  }

  let streamIterable: AsyncIterable<any>;
  try {
    streamIterable = await ai.models.generateContentStream({
      model,
      contents,
      config: config as any,
    });
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
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

      let toolIndex = 0;
      let emittedToolCalls = false;

      try {
        for await (const chunk of streamIterable) {
          if (closed || params.signal?.aborted) break;

          const parts: any[] = chunk?.candidates?.[0]?.content?.parts ?? [];
          if (parts.length > 0) {
            for (const part of parts) {
              if (closed || params.signal?.aborted) break;
              if (part?.thought === true && typeof part.text === "string" && part.text) {
                emit({
                  choices: [{ delta: { reasoning_content: part.text }, finish_reason: null }],
                });
              } else if (typeof part?.text === "string" && part.text) {
                emit({
                  choices: [{ delta: { content: part.text }, finish_reason: null }],
                });
              } else if (part?.functionCall && typeof part.functionCall.name === "string") {
                emittedToolCalls = true;
                const callId = `call_gemini_${toolIndex}_${Math.random().toString(36).slice(2, 8)}`;
                const argsStr = JSON.stringify(part.functionCall.args ?? {});
                emit({
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: toolIndex,
                            id: callId,
                            type: "function",
                            function: {
                              name: part.functionCall.name,
                              arguments: argsStr,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                });
                toolIndex += 1;
              }
            }
          } else if (typeof chunk?.text === "string" && chunk.text) {
            emit({
              choices: [{ delta: { content: chunk.text }, finish_reason: null }],
            });
          }
        }

        if (!closed && !params.signal?.aborted) {
          emit({
            choices: [
              {
                delta: {},
                finish_reason: emittedToolCalls ? "tool_calls" : "stop",
              },
            ],
          });
          finish();
        }
      } catch (err) {
        if (!closed && !params.signal?.aborted) {
          console.error("[gemini-free] stream error:", formatGeminiError(err));
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
 * Non-streaming Free-tier Gemini text/JSON helper for Flow, Memory, and File Translation.
 */
export async function callGeminiFreeText(params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}): Promise<string | null> {
  const ai = getGeminiServerClient();
  if (!ai) return null;
  if (params.signal?.aborted) return null;

  const model = resolveGeminiFreeModel();
  const { systemInstruction, contents } = convertOpenAiMessagesToGemini(params.messages);

  const config: Record<string, unknown> = {
    maxOutputTokens: params.maxTokens ?? 2048,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (params.jsonMode) {
    config.responseMimeType = "application/json";
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: config as any,
    });
    const text = (response.text ?? "").trim();
    return text || null;
  } catch (err) {
    console.warn("[gemini-free-text] failed:", formatGeminiError(err));
    return null;
  }
}

/**
 * Under-the-hood reference image analyzer -> detailed English Pollinations prompt.
 *
 * - On Free plan (and whenever GEMINI_API_KEY is available), Gemini Vision directly
 *   inspects the uploaded/referenced image(s), captures subject identity, pose, outfit,
 *   composition, lighting, colors, and style, applies the user's requested edit/generation
 *   directive, and outputs ONE rich English image prompt for Pollinations.
 * - If GEMINI_API_KEY is absent during Pro hourly fallback, falls back to DeepSeek < V4.0.
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

  // 1. Primary: Gemini Vision multimodal analysis (works transparently under the hood on Free plan,
  //    and also gives real visual reference understanding if GEMINI_API_KEY is configured during Pro fallback)
  const ai = getGeminiServerClient();
  if (ai && !params.signal?.aborted) {
    const parts: Part[] = [];
    for (const dataUrl of rawSources.slice(0, 3)) {
      const decoded = parseDataUrl(dataUrl);
      if (decoded) {
        parts.push({ inlineData: { mimeType: decoded.mimeType, data: decoded.data } });
      }
    }
    parts.push({ text: userDirective });

    try {
      const response = await ai.models.generateContent({
        model: resolveGeminiFreeModel(),
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 320,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        } as any,
      });
      const synthesized = (response.text ?? "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (synthesized.length >= 20) {
        return synthesized.slice(0, 880);
      }
    } catch (err) {
      console.warn("[gemini-free] reference prompt analysis failed:", formatGeminiError(err));
    }
  }

  // 2. Fallback for Pro hourly Pollinations fallback when GEMINI_API_KEY is not configured: DeepSeek < V4.0
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
