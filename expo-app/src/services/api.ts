import { IGSEEK_CONFIG } from "../config";
import {
  AgentRoleId,
  AiModelId,
  AuthSession,
  ChatAttachment,
  ChatMessageItem,
  EngineFileItem,
  EngineProjectItem,
  FlowAutonomy,
  FlowStepItem,
  GeneratedImageItem,
  SubscriptionInfo,
  WebSourceItem,
} from "../types/models";

const BASE = IGSEEK_CONFIG.apiBaseUrl.replace(/\/+$/, "");

function authHeaders(session: AuthSession | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session && !session.isGuest && session.idToken) {
    headers.Authorization = `Bearer ${session.idToken}`;
  }
  return headers;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== WEB SEARCH GROUNDING ====================

export async function searchWebDirect(
  query: string,
  lang: "ru" | "en" = "ru"
): Promise<WebSourceItem[]> {
  const clean = query.trim().slice(0, 180);
  if (!clean) return [];
  const encoded = encodeURIComponent(clean);
  const results: WebSourceItem[] = [];
  const hasCyrillic = /[\u0400-\u04FF]/.test(clean);
  const wikiLang = lang === "en" && !hasCyrillic ? "en" : "ru";

  try {
    const res = await fetch(
      `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=4&utf8=&format=json`
    );
    if (res.ok) {
      const json = await res.json();
      const arr = json?.query?.search || [];
      for (const item of arr) {
        const title = String(item?.title || "").trim();
        const snippet = String(item?.snippet || "")
          .replace(/<[^>]+>/g, "")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .trim();
        if (title) {
          results.push({
            title,
            url: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
            snippet,
          });
        }
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.AbstractText && json?.AbstractURL) {
        results.unshift({
          title: json.Heading || "DuckDuckGo",
          url: json.AbstractURL,
          snippet: String(json.AbstractText).slice(0, 260),
        });
      }
    }
  } catch {
    // Non-fatal
  }

  const seen = new Set<string>();
  return results
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, 5);
}

// ==================== POLLINATIONS IMAGE GENERATION (ALL PLANS) ====================

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image data"));
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

export async function generateImagePollinations(prompt: string): Promise<GeneratedImageItem> {
  const cleanPrompt = prompt.trim() || "modern futuristic red fox minimal dark aesthetic artwork";
  const encoded = encodeURIComponent(cleanPrompt);
  const seed = Math.floor(Math.random() * 999999);
  let lastError = "";

  for (const modelName of ["flux", "turbo"]) {
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}&model=${modelName}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "image/png,image/jpeg,image/webp,image/*" },
      });
      if (!res.ok) {
        lastError = `Pollinations (${modelName}) HTTP ${res.status}`;
        continue;
      }
      const blob = await res.blob();
      if (blob.size < 512) {
        lastError = "Pollinations returned empty image";
        continue;
      }
      const dataUrl = await blobToDataUrl(blob).catch(() => url);
      return {
        id: uid("img"),
        title: cleanPrompt.slice(0, 70),
        dataUrl,
      };
    } catch (err: any) {
      lastError = err?.message || "Network error";
    }
  }

  throw new Error(lastError || "Не удалось сгенерировать изображение через Pollinations");
}

// ==================== REAL-TIME SSE CHAT STREAM (IOS & ANDROID EXPO GO SAFE) ====================

export interface StreamChatParams {
  session: AuthSession | null;
  history: ChatMessageItem[];
  model: AiModelId;
  agent: AgentRoleId;
  webSearch: boolean;
  reasoning: boolean;
  imageMode: boolean;
  language: "ru" | "en";
  attachments: ChatAttachment[];
  onDelta: (fullText: string) => void;
  onReasoning: (fullReasoning: string) => void;
  onImage: (img: GeneratedImageItem) => void;
  onSources: (sources: WebSourceItem[]) => void;
  onAbortRef?: (abortFn: () => void) => void;
}

export interface StreamChatResult {
  content: string;
  reasoning: string;
  images: GeneratedImageItem[];
  webSources: WebSourceItem[];
}

export async function streamChat(params: StreamChatParams): Promise<StreamChatResult> {
  const {
    session,
    history,
    model,
    agent,
    webSearch,
    reasoning,
    imageMode,
    language,
    attachments,
    onDelta,
    onReasoning,
    onImage,
    onSources,
    onAbortRef,
  } = params;

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const lastUserText = (lastUser?.content || "").trim();

  // Direct Pollinations image generation (all plans: Free & Pro)
  if (
    imageMode ||
    /^\/(img|imagine)\s+/i.test(lastUserText)
  ) {
    const prompt = lastUserText.replace(/^\/(img|imagine)\s+/i, "").trim() || lastUserText;
    onDelta(
      language === "en"
        ? "Generating image with Pollinations…"
        : "Генерирую изображение через Pollinations…"
    );
    const img = await generateImagePollinations(prompt);
    onImage(img);
    const caption =
      language === "en"
        ? `Done! Generated image with Pollinations for: **${prompt}**`
        : `Готово! Сгенерировал изображение через Pollinations по запросу: **${prompt}**`;
    onDelta(caption);
    return { content: caption, reasoning: "", images: [img], webSources: [] };
  }

  const messages = history
    .slice(-14)
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

  const payload: Record<string, any> = {
    messages,
    model,
    agent,
    webSearch,
    reasoning,
  };

  if (attachments.length > 0) {
    payload.userAttachments = attachments.map((a) => ({
      name: a.name,
      type: a.mimeType,
      dataUrl: a.dataUrl,
    }));
  }

  const streamResult = await new Promise<StreamChatResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/chat`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.setRequestHeader("X-Idempotency-Key", uid("idem"));
    if (session && !session.isGuest && session.idToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.idToken}`);
    }

    let cursor = 0;
    let leftover = "";
    let currentEvent = "";
    let contentBuf = "";
    let reasoningBuf = "";
    const images: GeneratedImageItem[] = [];
    let serverError: string | null = null;
    let settled = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      if (serverError && !contentBuf && images.length === 0) {
        reject(new Error(serverError));
        return;
      }
      resolve({ content: contentBuf, reasoning: reasoningBuf, images, webSources: [] });
    };

    const processSseChunk = (chunk: string) => {
      const combined = leftover + chunk;
      const lines = combined.split(/\r?\n/);
      leftover = lines.pop() ?? "";

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          currentEvent = "";
          continue;
        }
        if (trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        if (currentEvent === "done") continue;

        let decoded: any = null;
        try {
          decoded = JSON.parse(data);
        } catch {
          decoded = data;
        }

        if (currentEvent === "delta") {
          const text = typeof decoded === "string" ? decoded : data;
          if (text) {
            contentBuf += text;
            onDelta(contentBuf);
          }
        } else if (currentEvent === "reasoning") {
          const text = typeof decoded === "string" ? decoded : data;
          if (text) {
            reasoningBuf += text;
            onReasoning(reasoningBuf);
          }
        } else if (currentEvent === "image") {
          if (decoded && typeof decoded === "object" && decoded.dataUrl) {
            const img: GeneratedImageItem = {
              id: decoded.id || uid("img"),
              title: decoded.title || "IGseek Image",
              dataUrl: decoded.dataUrl,
            };
            images.push(img);
            onImage(img);
          }
        } else if (currentEvent === "error") {
          serverError =
            typeof decoded === "string"
              ? decoded
              : decoded?.message || decoded?.error || data;
        } else if (decoded && typeof decoded === "object") {
          if (decoded?.error?.message) {
            serverError = decoded.error.message;
          }
          const delta = decoded?.choices?.[0]?.delta;
          if (delta) {
            if (typeof delta.content === "string" && delta.content) {
              contentBuf += delta.content;
              onDelta(contentBuf);
            }
            if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
              reasoningBuf += delta.reasoning_content;
              onReasoning(reasoningBuf);
            }
          }
          if (decoded.type === "image_generated" && decoded.dataUrl) {
            const img: GeneratedImageItem = {
              id: decoded.id || uid("img"),
              title: decoded.title || "IGseek Image",
              dataUrl: decoded.dataUrl,
            };
            images.push(img);
            onImage(img);
          }
        }
      }
    };

    xhr.onprogress = () => {
      const text = xhr.responseText || "";
      if (text.length > cursor) {
        const delta = text.slice(cursor);
        cursor = text.length;
        processSseChunk(delta);
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText || "";
      if (text.length > cursor) {
        processSseChunk(text.slice(cursor));
        cursor = text.length;
      }
      if (leftover.trim()) {
        processSseChunk("\n");
      }

      if (xhr.status >= 400) {
        let msg = `Сервер вернул HTTP ${xhr.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) msg = typeof parsed.error === "string" ? parsed.error : parsed.error.message || msg;
        } catch {
          // Keep status message
        }
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
        return;
      }

      // Non-SSE JSON fallback if backend returned plain JSON
      if (!contentBuf && images.length === 0 && text.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(text);
          const reply =
            parsed?.content ||
            parsed?.choices?.[0]?.message?.content ||
            "";
          if (reply) {
            contentBuf = reply;
            onDelta(contentBuf);
          }
        } catch {
          // Ignore
        }
      }

      finishResolve();
    };

    xhr.onerror = () => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            language === "en"
              ? "Network error connecting to IGseek server."
              : "Сетевая ошибка подключения к серверу IGseek."
          )
        );
      }
    };

    xhr.onabort = () => {
      finishResolve();
    };

    xhr.timeout = 120_000;
    xhr.ontimeout = () => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            language === "en"
              ? "Server took too long to respond."
              : "Превышено время ожидания ответа сервера."
          )
        );
      }
    };

    onAbortRef?.(() => {
      try {
        xhr.abort();
      } catch {
        // Ignore
      }
    });

    xhr.send(JSON.stringify(payload));
  });

  if (webSearch && streamResult.webSources.length === 0 && lastUserText) {
    const sources = await searchWebDirect(lastUserText, language);
    if (sources.length > 0) {
      onSources(sources);
      return { ...streamResult, webSources: sources };
    }
  }

  return streamResult;
}

// ==================== FLOW API ====================

export async function planFlow(
  session: AuthSession | null,
  goal: string,
  autonomy: FlowAutonomy,
  language: "ru" | "en" = "ru"
): Promise<{ title: string; steps: FlowStepItem[] }> {
  try {
    const res = await fetch(`${BASE}/api/flow`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({
        action: "plan",
        goal,
        autonomy,
        model: "instinct",
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const plan = json?.plan || json;
      const rawSteps = Array.isArray(plan?.steps) ? plan.steps : [];
      if (rawSteps.length > 0) {
        return {
          title: plan.title || goal.slice(0, 64),
          steps: rawSteps.map((s: any, i: number) => ({
            id: s.id || `step_${i + 1}`,
            title: s.title || (language === "en" ? `Step ${i + 1}` : `Шаг ${i + 1}`),
            description: s.description || "",
            tool: s.tool || "analyze",
            requiresApproval: Boolean(s.requiresApproval),
            status: "pending" as const,
          })),
        };
      }
    }
  } catch {
    // Fallback below
  }

  return {
    title: goal.slice(0, 64),
    steps:
      language === "en"
        ? [
            { id: "s1", title: "Analyze goal & constraints", description: "Define scope and criteria", tool: "analyze", status: "pending" },
            { id: "s2", title: "Research key facts", description: "Gather verified context", tool: "web_search", status: "pending" },
            { id: "s3", title: "Deliver final result", description: "Format structured Markdown output", tool: "write", status: "pending" },
          ]
        : [
            { id: "s1", title: "Анализ цели и требований", description: "Определение структуры и критериев качества", tool: "analyze", status: "pending" },
            { id: "s2", title: "Сбор данных и фактов", description: "Поиск актуальных практик и контекста", tool: "web_search", status: "pending" },
            { id: "s3", title: "Подготовка итогового решения", description: "Формирование структурированного результата", tool: "write", status: "pending" },
          ],
  };
}

export async function executeFlowStep(
  session: AuthSession | null,
  goal: string,
  autonomy: FlowAutonomy,
  step: FlowStepItem,
  previousOutputs: Array<{ title: string; output: string }>
): Promise<string> {
  const res = await fetch(`${BASE}/api/flow`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({
      action: "run_step",
      step: {
        id: step.id,
        title: step.title,
        description: step.description,
        tool: step.tool,
        requiresApproval: Boolean(step.requiresApproval),
      },
      taskContext: {
        goal,
        autonomy,
        model: "instinct",
        previousSteps: previousOutputs.map((p) => ({
          title: p.title,
          tool: "write",
          status: "done",
          output: p.output.slice(0, 1500),
        })),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Ошибка Flow (${res.status})`);
  }
  return (
    json?.stepResult?.output ||
    json?.stepResult?.error ||
    json?.output ||
    "Шаг выполнен."
  );
}

// ==================== ENGINE CODE BUILDER ====================

function extractJsonObject(raw: string): any | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function generateEngineProject(
  session: AuthSession | null,
  prompt: string,
  language: "ru" | "en" = "ru",
  existing?: EngineProjectItem | null
): Promise<EngineProjectItem> {
  const existingContext = existing
    ? `\nExisting project "${existing.title}" files:\n${existing.files
        .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`)
        .join("\n")}\nApply this refinement request: ${prompt}`
    : `User prompt: ${prompt}`;

  const sysPrompt = `You are IGseek Engine — an elite frontend web app builder.
Build a sleek, interactive, mobile-responsive HTML/CSS/JS web app that runs standalone in a browser WebView.
Return ONLY valid JSON without extra text:
{"title":"App Name","files":[{"path":"index.html","content":"..."},{"path":"styles.css","content":"..."},{"path":"app.js","content":"..."}]}
Make index.html link styles.css and app.js cleanly. Keep design ultra-polished, dark/modern, interactive, with 2 to 4 files.
${existingContext}`;

  const res = await streamChat({
    session,
    history: [
      {
        id: "eng_req",
        chatId: "eng",
        role: "user",
        content: sysPrompt,
        createdAtMs: Date.now(),
      },
    ],
    model: "instinct",
    agent: "coder",
    webSearch: false,
    reasoning: false,
    imageMode: false,
    language,
    attachments: [],
    onDelta: () => undefined,
    onReasoning: () => undefined,
    onImage: () => undefined,
    onSources: () => undefined,
  });

  const parsed = extractJsonObject(res.content);
  const files: EngineFileItem[] = [];
  let title = existing?.title || prompt.slice(0, 48);

  if (parsed) {
    if (typeof parsed.title === "string" && parsed.title.trim()) {
      title = parsed.title.trim();
    }
    if (Array.isArray(parsed.files)) {
      for (const f of parsed.files) {
        if (typeof f?.path === "string" && typeof f?.content === "string" && f.path.trim()) {
          files.push({ path: f.path.trim(), content: f.content });
        }
      }
    }
  }

  if (files.length === 0) {
    files.push({
      path: "index.html",
      content: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;background:#0b0a0a;color:#f4f4f5;padding:24px;line-height:1.6}pre{white-space:pre-wrap;background:#161618;padding:14px;border-radius:12px;border:1px solid #27272a}</style></head><body><h2>${title.replace(/</g, "&lt;")}</h2><pre>${(res.content || "Generated in IGseek Engine").replace(/</g, "&lt;")}</pre></body></html>`,
    });
  }

  return {
    id: existing?.id || uid("eng"),
    title,
    prompt,
    activeFile: files.find((f) => f.path.endsWith(".html"))?.path || files[0].path,
    files,
    updatedAtMs: Date.now(),
  };
}

export function buildEnginePreviewHtml(project: EngineProjectItem): string {
  const htmlFile = project.files.find((f) => f.path.toLowerCase().endsWith(".html"));
  const cssFiles = project.files.filter((f) => f.path.toLowerCase().endsWith(".css"));
  const jsFiles = project.files.filter((f) => f.path.toLowerCase().endsWith(".js"));

  const combinedCss = cssFiles.map((f) => f.content).join("\n");
  const combinedJs = jsFiles.map((f) => f.content).join("\n");

  let html =
    htmlFile?.content ||
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>`;

  // Inline local stylesheet & script references so WebView renders self-contained
  html = html.replace(/<link[^>]*href=["'][^"']*\.css["'][^>]*>/gi, "");
  html = html.replace(/<script[^>]*src=["'][^"']*\.js["'][^>]*><\/script>/gi, "");

  if (combinedCss) {
    const styleTag = `<style>${combinedCss}</style>`;
    html = html.includes("</head>") ? html.replace("</head>", `${styleTag}</head>`) : `${styleTag}${html}`;
  }
  if (combinedJs) {
    const scriptTag = `<script>${combinedJs}</script>`;
    html = html.includes("</body>") ? html.replace("</body>", `${scriptTag}</body>`) : `${html}${scriptTag}`;
  }
  return html;
}

// ==================== SUBSCRIPTION & LICENSE KEYS ====================

function parseSubscription(obj: any): SubscriptionInfo {
  const isPro = Boolean(obj?.isPro || obj?.plan === "pro");
  return {
    plan: isPro ? "pro" : "free",
    isPro,
    status: String(obj?.status || (isPro ? "active" : "free")),
    daysLeft: Number(obj?.daysLeft || 0),
    expiresAt: obj?.expiresAt || null,
    lastKeyId: obj?.lastKeyId || null,
    durationDays: Number(obj?.durationDays || 30),
  };
}

export async function fetchSubscription(session: AuthSession | null): Promise<SubscriptionInfo> {
  if (!session || session.isGuest || !session.idToken) {
    return {
      plan: "free",
      isPro: false,
      status: "free",
      daysLeft: 0,
      expiresAt: null,
      lastKeyId: null,
      durationDays: 30,
    };
  }
  const res = await fetch(`${BASE}/api/subscription`, {
    method: "GET",
    headers: authHeaders(session),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return parseSubscription(json);
}

export async function redeemLicenseKey(
  session: AuthSession | null,
  key: string,
  lang: "ru" | "en" = "ru"
): Promise<SubscriptionInfo> {
  if (!session || session.isGuest || !session.idToken) {
    throw new Error(
      lang === "en"
        ? "Sign in to your account to activate an IGseek Pro key."
        : "Войдите в аккаунт, чтобы активировать ключ IGseek Pro."
    );
  }
  const cleanKey = key.trim().toUpperCase();
  if (!cleanKey) {
    throw new Error(lang === "en" ? "Enter a license key." : "Введите ключ подписки.");
  }

  const res = await fetch(`${BASE}/api/subscription`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ action: "redeem", key: cleanKey }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error ||
        (lang === "en" ? `Activation failed (HTTP ${res.status})` : `Ошибка активации (HTTP ${res.status})`)
    );
  }
  return parseSubscription(json?.subscription || json);
}
