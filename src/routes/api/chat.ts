import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  buildEffectiveWorkspacePrompt,
  getCustomGlobalPromptForWorkspace,
  type AgentId,
} from "../../lib/system-prompts";
import {
  analyzeAndUpdateMemory,
  createMemory,
  deleteMemory,
  getUserFromToken,
  loadRelevantMemories,
  listAllMemories,
  updateMemory,
  type MemoryAttachment,
  type MemoryRow,
} from "../../lib/memory-server";
import { checkContent, refusalMessage } from "../../lib/content-filters";
import { isChinaSensitive } from "../../lib/sensitive-topics";
import { editImageWithGptImage2, generateImageWithGptImage2 } from "../../lib/apimira-image";
import {
  checkServerPhotoQuota,
  consumeServerPhotoQuota,
  resolvePhotoQuotaActorKey,
} from "../../lib/photo-limits-server";
import { searchWebLive, searchWebRich } from "../../lib/web-search";
import {
  extractLibraryText,
  extractLibraryTextAsync,
  findLibraryFiles,
  libraryItemToBase64DataUrl,
  listAllLibraryFilesServer,
  type ServerLibraryItem,
} from "../../lib/library-server";
import {
  decodeBase64DataUrlToBytes,
  extractDocumentTextFromBytes,
  isRichDocumentExtension,
  looksCorruptedBinaryString,
  sanitizeTextForApi,
} from "../../lib/word-parser";
import {
  extractPdfServerFallback,
  translateFileWithDeepSeek,
} from "../../lib/file-translator";
import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  DEEPSEEK_DIRECT_INSTINCT,
  DEEPSEEK_DIRECT_REASONER,
  buildPersonalizationDirective,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  MODEL_PROFILES,
  resolveApimiraDeepSeekModel,
  resolveDirectDeepSeekModel,
  resolveEffectiveTemperature,
  shouldTryDirectDeepSeek,
  type UiModel,
} from "../../lib/deepseek-models";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(16_000_000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  reasoning: z.boolean().optional().default(false),
  webSearch: z.boolean().optional().default(false),
  model: z.enum(["instinct", "chat", "f1"]).optional().default("instinct"),
  agent: z.enum(["universal", "coder", "hacker", "mentor", "psy", "creative"]).optional().default("universal"),
  workspace: z.enum(["chat", "engine"]).optional().default("chat"),
  aiStyle: z.string().max(2000).optional(),
  aiCreativity: z.enum(["exact", "balance", "vivid", "chaos"]).optional(),
  aiLength: z.enum(["short", "medium", "long", "unlimited"]).optional(),
  gmailConnected: z.boolean().optional().default(false),
  userAttachments: z
    .array(
      z.object({
        name: z.string(),
        dataUrl: z.string(),
        type: z.string().optional(),
      })
    )
    .optional(),
  previousGeneratedImage: z
    .object({
      dataUrl: z.string().max(16_000_000),
      messageIndex: z.number().int().min(-1).optional(),
    })
    .optional(),
  deviceFp: z.string().max(128).optional(),
  imageQuota: z
    .object({
      used: z.number().int().min(0).max(100),
      resetAt: z.number().int().min(0),
    })
    .optional(),
  libraryFiles: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string().optional(),
        mimeType: z.string().optional(),
        content: z.string().max(500_000).optional(),
        dataUrl: z.string().max(1_600_000).optional(),
        source: z.string().optional(),
        chatTitle: z.string().optional(),
        updatedAt: z.string().optional(),
      })
    )
    .max(60)
    .optional(),
});

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; reasoning_content?: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const ARTIFACT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_artifact",
    description: "Create a downloadable file card (code, HTML, markdown, document, config) for substantial code/documents.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Readable title." },
        language: { type: "string", description: "Format/language: html, css, js, ts, tsx, python, json, yaml, sql, markdown, bash, text, etc." },
        content: { type: "string", description: "Full file content." },
        description: { type: "string", description: "Short description (optional)." },
      },
      required: ["title", "language", "content"],
    },
  },
};

const IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description: "Generate a NEW image from scratch using ChatGPT Image 2. Use edit_image instead when editing an existing photo.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short card title." },
        prompt: { type: "string", description: "Detailed English visual prompt (subject, style, colors, lighting, composition)." },
        description: { type: "string", description: "Short caption (optional)." },
      },
      required: ["title", "prompt"],
    },
  },
};

const EDIT_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "edit_image",
    description: "Edit, modify, add/remove elements, retouch, or restyle an attached or previously generated image in chat.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short result title." },
        prompt: { type: "string", description: "Clear English edit instruction describing exact changes while preserving the rest." },
        description: { type: "string", description: "Short summary (optional)." },
      },
      required: ["title", "prompt"],
    },
  },
};

const WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "Search the live web for current news, facts, prices, statistics, or recent events. Cite sources briefly.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Concise search query." },
      },
      required: ["query"],
    },
  },
};

const WEB_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "find_web_image",
    description: "Find real web photos/diagrams ONLY when user asks how something real looks ('покажи фото', 'как выглядит', 'найди картинку', 'схема').",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Image search query (EN or RU)." },
        caption: { type: "string", description: "Short caption." },
      },
      required: ["query"],
    },
  },
};

const CALENDAR_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_calendar_event",
    description: "Create, list, update, delete, or check free/busy in user's Google Calendar.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "list", "update", "delete", "check_free_busy"] },
        summary: { type: "string" },
        description: { type: "string" },
        start_time: { type: "string", description: "ISO 8601 datetime or YYYY-MM-DD." },
        end_time: { type: "string", description: "ISO 8601 datetime or YYYY-MM-DD." },
        location: { type: "string" },
        reminder_minutes: { type: "number" },
        event_id: { type: "string" },
        query: { type: "string" },
      },
      required: ["action"],
    },
  },
};

const TASKS_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_google_task",
    description: "Create, list, complete, update, or delete tasks in user's Google Tasks.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "list", "complete", "update", "delete"] },
        title: { type: "string" },
        notes: { type: "string" },
        due: { type: "string", description: "ISO 8601 or YYYY-MM-DD." },
        task_id: { type: "string" },
        task_list_id: { type: "string", description: "Defaults to @default." },
      },
      required: ["action"],
    },
  },
};

const GMAIL_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_gmail",
    description: "List, search, read, or send emails via Gmail (supports attachments from generated_image, user_upload, memory, library). Always call even if Gmail is not signed in yet.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "read", "send", "search"] },
        to: { type: "string", description: "Recipient email." },
        subject: { type: "string" },
        body: { type: "string" },
        message_id: { type: "string" },
        query: { type: "string" },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              source: { type: "string", enum: ["generated_image", "user_upload", "memory", "library"] },
              data_url: { type: "string" },
              memory_id: { type: "string" },
              library_id: { type: "string" },
            },
            required: ["filename"],
          },
        },
      },
      required: ["action"],
    },
  },
};

const SEARCH_AND_READ_LIBRARY_TOOL = {
  type: "function" as const,
  function: {
    name: "search_and_read_library",
    description: "Search and read files, reports, documents, code, artifacts, or images from user's Library.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        library_id: { type: "string" },
        filename: { type: "string" },
      },
    },
  },
};

const FILE_TRANSLATOR_TOOL = {
  type: "function" as const,
  function: {
    name: "translate_file_with_deepseek",
    description: "DeepSeek file internals reader/translator for Word, PowerPoint, Excel, PDF, .d, fb2/epub, zip, and binary files from attachments, chat history, Library, or memory.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string" },
        source: { type: "string", enum: ["auto", "user_upload", "library", "memory"] },
        library_id: { type: "string" },
        memory_id: { type: "string" },
        attachment_index: { type: "number" },
        user_question: { type: "string" },
      },
    },
  },
};

const MEMORY_TOOL = {
  type: "function" as const,
  function: {
    name: "search_and_read_memory",
    description: "Search and read user's long-term memory and saved attachments (contacts like mom/boss, preferences, notes, documents).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        memory_id: { type: "string" },
      },
    },
  },
};

const MANAGE_MEMORY_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_memory",
    description: "Save, update, delete, or list durable facts/files in user's long-term memory (Memory HUD) when user asks to remember/forget or shares lasting personal facts.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save", "update", "delete", "list"] },
        content: { type: "string" },
        kind: { type: "string", enum: ["name", "preference", "tech", "project", "goal", "device", "interest", "style", "other"] },
        memory_id: { type: "string" },
        attachment_filename: { type: "string" },
        library_id: { type: "string" },
        library_filename: { type: "string" },
      },
      required: ["action"],
    },
  },
};

const REFUSAL_TOOL = {
  type: "function" as const,
  function: {
    name: "refuse_unsupported_request",
    description: "Call immediately when user asks for physically/technically impossible actions (real phone calls, SMS, bank transfers, physical acts, live hacking, unsupported IoT/social posting) and offer a real alternative.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string" },
        reason: { type: "string" },
        alternative: { type: "string" },
      },
      required: ["action", "reason", "alternative"],
    },
  },
};

const TAB_TRANSITION_TOOL = {
  type: "function" as const,
  function: {
    name: "suggest_tab_transition",
    description: "Show an interactive switch button ONLY when user asks for: 'engine' (full-stack app / live preview / IDE), 'flow' (GitHub push / CI-CD / bash terminal / autonomous workflow), or 'library' (open Library UI).",
    parameters: {
      type: "object",
      properties: {
        target_tab: { type: "string", enum: ["engine", "flow", "library", "saved"] },
        title: { type: "string" },
        reason: { type: "string" },
        suggested_prompt: { type: "string" },
      },
      required: ["target_tab", "title", "reason"],
    },
  },
};

type WebResult = { title: string; url: string; snippet: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

async function webSearch(query: string): Promise<{ results: WebResult[]; groundedSummary?: string }> {
  const rich = await searchWebRich(query, 6);
  return {
    results: rich.hits.map((h) => ({
      title: h.title,
      url: h.url,
      snippet: h.snippet,
    })),
    ...(rich.groundedSummary ? { groundedSummary: rich.groundedSummary } : {}),
  };
}

type WebImageResult = {
  title: string;
  url: string;
  thumbnail?: string;
  source?: string;
};

async function searchWebImages(query: string): Promise<WebImageResult[]> {
  const results: WebImageResult[] = [];

  try {
    const htmlRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
      },
      signal: AbortSignal.timeout(4000),
    });
    const html = await htmlRes.text();
    const vqdMatch = html.match(/vqd=['"]?([^'"&]+)/) || html.match(/vqd=([\d-]+)/);
    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}`, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "referer": "https://duckduckgo.com/",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (imgRes.ok) {
        const data = (await imgRes.json()) as { results?: Array<{ title?: string; image?: string; thumbnail?: string; url?: string }> };
        if (data.results && data.results.length > 0) {
          for (const item of data.results.slice(0, 4)) {
            if (item.image && (item.image.startsWith("http://") || item.image.startsWith("https://"))) {
              let sourceHost = "duckduckgo.com";
              if (item.url) {
                try {
                  sourceHost = new URL(item.url).hostname || "duckduckgo.com";
                } catch {
                  sourceHost = "duckduckgo.com";
                }
              }
              results.push({
                title: stripTags(item.title || query).slice(0, 150),
                url: item.image,
                thumbnail: item.thumbnail || item.image,
                source: sourceHost,
              });
            }
          }
        }
      }
    }
  } catch {
  }

  if (results.length === 0) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=imageinfo&iiprop=url|mime&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(4000) });
      if (wikiRes.ok) {
        const json = (await wikiRes.json()) as any;
        const pages = json.query?.pages || {};
        for (const key of Object.keys(pages)) {
          const page = pages[key];
          const info = page.imageinfo?.[0];
          if (info?.url) {
            results.push({
              title: (page.title || query).replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, ""),
              url: info.url,
              thumbnail: info.url,
              source: "wikimedia.org",
            });
          }
        }
      }
    } catch {
    }
  }

  return results;
}

type GeneratedImage = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  dataUrl: string;
};

const DATA_URL_RE = /!\[[^\]]*\]\((data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)/g;
const IGFILE_TAG_RE = /<!--\/?IGFILE(?::[^>]*)?-->/g;
const IGFILE_BLOCK_RE = /<!--IGFILE:([^>]+)-->([\s\S]*?)<!--\/IGFILE-->/g;

function cleanFileWrappers(text: string): string {
  const cleaned = text.replace(IGFILE_BLOCK_RE, (_full, metaRaw, bodyRaw) => {
    const body = String(bodyRaw || "").trim();
    if (looksCorruptedBinaryString(body) || /^PK(?:\u0003\u0004|\\x03\\x04)/.test(body)) {
      let name = "file";
      try {
        const meta = JSON.parse(decodeURIComponent(metaRaw)) as { name?: string };
        if (meta?.name) name = meta.name;
      } catch {
      }
      return `[Файл «${name}» — сырое бинарное содержимое очищено. Для чтения внутренностей вызови translate_file_with_deepseek(filename="${name}")]`;
    }
    return body;
  });
  return sanitizeTextForApi(cleaned.replace(IGFILE_TAG_RE, "")).trim();
}

function stripImageDataUrls(text: string): string {
  return cleanFileWrappers(text).replace(DATA_URL_RE, "[прикреплённое изображение]").trim();
}

function collectLatestSourceImages(
  userAttachments: Array<{ name: string; dataUrl: string; type?: string }> | undefined,
  messages: Array<{ role: string; content: string }>,
  lastGeneratedImage: { dataUrl: string; messageIndex: number; sameTurn?: boolean } | null,
): Array<{ dataUrl: string; mimeType?: string }> {
  if (lastGeneratedImage?.sameTurn && lastGeneratedImage.dataUrl.startsWith("data:image/")) {
    return [{ dataUrl: lastGeneratedImage.dataUrl }];
  }

  const fromAttachments = (userAttachments ?? [])
    .filter((a) => a.dataUrl?.startsWith("data:image/"))
    .map((a) => ({ dataUrl: a.dataUrl, mimeType: a.type }));
  if (fromAttachments.length > 0) return fromAttachments;

  let lastUserImageIndex = -1;
  let lastUserImages: Array<{ dataUrl: string; mimeType?: string }> = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content !== "string") continue;
    const matches = [...m.content.matchAll(DATA_URL_RE)];
    if (matches.length > 0) {
      lastUserImageIndex = i;
      lastUserImages = matches.map((match) => ({ dataUrl: match[1] }));
      break;
    }
  }

  if (
    lastGeneratedImage?.dataUrl?.startsWith("data:image/") &&
    (lastUserImageIndex < 0 || lastGeneratedImage.messageIndex >= lastUserImageIndex)
  ) {
    return [{ dataUrl: lastGeneratedImage.dataUrl }];
  }

  return lastUserImages;
}

type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function toApiMessages(
  messages: ChatMessage[],
): Array<Record<string, unknown>> {
  const userImgIndexes = messages
    .map((m, i) => (m.role === "user" && typeof m.content === "string" && m.content.includes("data:image/") ? i : -1))
    .filter((i) => i >= 0);
  const keepImageSet = new Set(userImgIndexes.slice(-3));

  return messages.map((m, index) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: typeof m.content === "string" ? sanitizeTextForApi(m.content) : "",
      };
    }
    if (m.role === "assistant") {
      const out: Record<string, unknown> = {
        role: "assistant",
        content: typeof m.content === "string" ? cleanFileWrappers(m.content) : (m.content ?? ""),
      };
      if (m.reasoning_content !== undefined) out.reasoning_content = m.reasoning_content;
      if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
      return out;
    }
    if (m.role !== "user" || typeof m.content !== "string" || !m.content.includes("data:image/")) {
      return { role: m.role, content: typeof m.content === "string" ? cleanFileWrappers(m.content) : (m.content ?? "") };
    }

    if (!keepImageSet.has(index)) {
      return { role: m.role, content: stripImageDataUrls(m.content) };
    }

    const matches = [...m.content.matchAll(DATA_URL_RE)];
    if (matches.length === 0) return { role: m.role, content: cleanFileWrappers(m.content) };

    const parts: ApiContentPart[] = [];
    let cursor = 0;
    for (const match of matches) {
      const textBefore = cleanFileWrappers(m.content.slice(cursor, match.index));
      if (textBefore) parts.push({ type: "text", text: textBefore });
      parts.push({ type: "image_url", image_url: { url: match[1] } });
      cursor = (match.index ?? 0) + match[0].length;
    }
    const tail = cleanFileWrappers(m.content.slice(cursor));
    if (tail) parts.push({ type: "text", text: tail });
    if (!parts.some((p) => p.type === "text")) {
      parts.unshift({ type: "text", text: "(пользователь прикрепил изображение — проанализируй его)" });
    }
    if (parts.length === 1 && parts[0].type === "text") {
      return { role: m.role, content: parts[0].text };
    }
    return { role: m.role, content: parts };
  });
}

async function generateImage(prompt: string): Promise<string> {
  const res = await generateImageWithGptImage2(prompt);
  return res.dataUrl;
}

async function streamFallbackToClient(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  send: (event: string, data: string) => void,
  uiModel: UiModel = "instinct",
): Promise<string> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
  const apimiraKey = process.env.APIMIRA_API_KEY?.trim() || "";
  const apimiraBase = (process.env.APIMIRA_BASE_URL || "https://apimira.com/v1").trim().replace(/\/+$/, "");

  const endpoints: Array<{ url: string; apiKey: string; model: string; isDirect: boolean }> = [];
  if (shouldTryDirectDeepSeek(deepseekKey, apimiraKey)) {
    endpoints.push({
      url: "https://api.deepseek.com/chat/completions",
      apiKey: deepseekKey,
      model: resolveDirectDeepSeekModel(uiModel, false),
      isDirect: true,
    });
  }
  if (apimiraKey) {
    for (const modelId of getApimiraFallbackChain(uiModel, false)) {
      endpoints.push({ url: `${apimiraBase}/chat/completions`, apiKey: apimiraKey, model: modelId, isDirect: false });
    }
  }
  if (endpoints.length === 0) throw new Error("No DeepSeek text provider configured");

  let upstream: Response | null = null;
  let lastStatus = 0;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ep.apiKey}`,
        },
        body: JSON.stringify({
          model: ep.model,
          stream: true,
          ...(!ep.isDirect ? APIMIRA_NO_REASONING_PARAMS : {}),
          messages,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (r.ok && r.body) {
        if (!ep.isDirect) markApimiraModelHealthy(ep.model);
        upstream = r;
        break;
      }
      if (ep.isDirect) markDirectDeepSeekUnavailable(r.status);
      else markApimiraModelUnhealthy(ep.model, r.status);
      lastStatus = r.status;
    } catch {
    }
  }

  if (!upstream || !upstream.body) {
    throw new Error(`deepseek fallback ${lastStatus || "failed"}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          assistantText += delta;
          send("delta", JSON.stringify(delta));
        }
      } catch {
      }
    }
  }
  return assistantText;
}

type HfTool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

async function callPrimary(
  apiKey: string,
  messages: ChatMessage[],
  tools: HfTool[] | null,
  reasoning: boolean,
  uiModel: UiModel,
  temperature: number,
  modelOverride?: string,
) {
  const profile = MODEL_PROFILES[uiModel];
  const targetModel = modelOverride || resolveDirectDeepSeekModel(uiModel, reasoning);
  const isReasonerModel = targetModel === DEEPSEEK_DIRECT_REASONER;
  const bodyPayload: Record<string, unknown> = {
    model: targetModel,
    stream: true,
    messages: toApiMessages(messages),
    ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
  };
  if (!reasoning && !isReasonerModel) {
    bodyPayload.temperature = temperature;
    bodyPayload.top_p = profile.top_p;
  }
  return fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
    signal: AbortSignal.timeout(120_000),
  });
}

async function callApimiraDeepSeek(
  apiKey: string,
  baseUrl: string,
  messages: ChatMessage[],
  tools: HfTool[] | null,
  uiModel: UiModel,
  reasoning: boolean,
  temperature: number,
  modelOverride?: string,
  stripImages = false,
  omitNoReasoningParams = false,
  options?: { signal?: AbortSignal; headerTimeoutMs?: number },
) {
  const profile = MODEL_PROFILES[uiModel];
  const targetModel = modelOverride || resolveApimiraDeepSeekModel(uiModel, reasoning);
  const normalizedMessages = stripImages
    ? messages.map((m) =>
        m.role === "user" && typeof m.content === "string"
          ? { ...m, content: stripImageDataUrls(m.content) }
          : m,
      )
    : messages;
  const bodyPayload: Record<string, unknown> = {
    model: targetModel,
    stream: true,
    messages: toApiMessages(normalizedMessages),
    ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
  };
  if (!reasoning) {
    bodyPayload.temperature = temperature;
    bodyPayload.top_p = profile.top_p;
    if (!omitNoReasoningParams) {
      Object.assign(bodyPayload, APIMIRA_NO_REASONING_PARAMS);
    }
  }
  const ac = new AbortController();
  const externalSignal = options?.signal;
  const onExternalAbort = () => ac.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      ac.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  const headerTimeoutMs = options?.headerTimeoutMs ?? (reasoning ? 90_000 : 18_000);
  const timer = setTimeout(() => ac.abort(new Error("apimira_header_timeout")), headerTimeoutMs);
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: ac.signal,
    });
  } finally {
    // Clear header timeout as soon as headers arrive (or fetch throws) so long streams are never cut short
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function handleChatPost(request: Request): Promise<Response> {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  const apimiraKey = (process.env.APIMIRA_API_KEY || "").trim();
  const apimiraBaseUrl = (process.env.APIMIRA_BASE_URL || "https://apimira.com/v1").trim().replace(/\/+$/, "");
  if (!deepseekKey && !apimiraKey) {
    return new Response(JSON.stringify({ error: "DeepSeek provider not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const isEngineRequest = parsed.workspace === "engine";
        const effectiveReasoning = parsed.reasoning;
        const effectiveWebSearch = parsed.webSearch;
        const clientSystemBlocks = parsed.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content.trim())
          .filter(Boolean);
        const cleanMessages = parsed.messages.filter((m) => m.role !== "system");

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
        let currentImageQuotaHint = parsed.imageQuota;

        const lastUserMessage = stripImageDataUrls(
          [...cleanMessages].reverse().find((m) => m.role === "user")?.content ?? "",
        );

        const primaryHistory = cleanMessages.filter((message, index, messages) => {
          if (message.role === "user" && isChinaSensitive(stripImageDataUrls(message.content))) return false;
          if (message.role !== "assistant") return true;

          for (let previous = index - 1; previous >= 0; previous -= 1) {
            const candidate = messages[previous];
            if (candidate.role === "user") return !isChinaSensitive(stripImageDataUrls(candidate.content));
          }
          return true;
        });

        const preCheck = checkContent(lastUserMessage);
        if (preCheck.blocked) {
          const refusal = refusalMessage(preCheck.category, "ru");
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              const send = (event: string, data: string) =>
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              send("delta", JSON.stringify(refusal));
              send("done", "1");
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              "x-accel-buffering": "no",
            },
          });
        }

        let streamClosed = false;
        const streamAbort = new AbortController();
        if (request.signal) {
          if (request.signal.aborted) {
            streamAbort.abort(request.signal.reason);
          } else {
            request.signal.addEventListener("abort", () => streamAbort.abort(request.signal.reason), { once: true });
          }
        }
        let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
        const stopKeepAlive = () => {
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }
        };
        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            streamClosed = true;
            streamAbort.abort();
            stopKeepAlive();
          },
          async start(controller) {
            const encoder = new TextEncoder();
            const sendComment = (comment: string) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`: ${comment}\n\n`));
              } catch {
                streamClosed = true;
                stopKeepAlive();
              }
            };
            const send = (event: string, data: string) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              } catch {
                streamClosed = true;
                stopKeepAlive();
              }
            };
            const safeClose = () => {
              if (streamClosed) return;
              streamClosed = true;
              stopKeepAlive();
              try {
                controller.close();
              } catch {
              }
            };

            sendComment("connected");
            keepAliveTimer = setInterval(() => {
              sendComment("ping");
            }, 2500);

            // Classify pure-sync intent flags BEFORE any Firestore I/O so normal chat skips unnecessary library reads (0ms)
            const mentionsFileOrLibrary =
              Boolean(parsed.userAttachments?.length) ||
              /(library|библиотек|файл|документ|отч[её]т|презентац|таблиц|pdf|doc|docx|ppt|pptx|xls|xlsx|rtf|odt|архив|zip|прочитай|изучи|что там)/i.test(
                lastUserMessage,
              );
            const hasEditableImageContext =
              Boolean(parsed.previousGeneratedImage?.dataUrl?.startsWith("data:image/")) ||
              Boolean(parsed.userAttachments?.some((a) => a.dataUrl?.startsWith("data:image/"))) ||
              cleanMessages.some((m) => m.role === "user" && typeof m.content === "string" && m.content.includes("data:image/"));
            const hasFileTranslatorContext =
              mentionsFileOrLibrary ||
              Boolean(parsed.userAttachments?.length) ||
              cleanMessages.some((m) => typeof m.content === "string" && m.content.includes("<!--IGFILE:"));

            // For short follow-up confirmations ("да", "ок", "отправляй", "сделай", "yes", "go ahead"),
            // also inspect the immediately preceding turn so multi-step tool flows never miss a tool.
            const isShortFollowup = lastUserMessage.trim().length <= 48 && cleanMessages.length >= 2;
            const intentProbeText = isShortFollowup
              ? [
                  lastUserMessage,
                  ...cleanMessages
                    .slice(-3, -1)
                    .map((m) => stripImageDataUrls(m.content).slice(0, 400)),
                ].join("\n")
              : lastUserMessage;

            const wantsImageGen =
              /(нарисуй|сгенерируй|нарисовать|сгенерировать|создай.{0,28}(картин|изображ|фото|арт|открыт|лого|аватар|постер|обложк|иллюстр|баннер|рисун)|сделай.{0,24}(картин|изображ|фото|арт|открыт|лого|аватар|постер|обложк|иллюстр)|картинк|изображен|открытк|иллюстрац|рисунок|draw\b|generate.{0,16}(image|pic|photo|art|logo)|create.{0,16}(image|picture|photo|art|logo|poster|illustration))/i.test(
                intentProbeText,
              );
            const wantsImageEdit =
              hasEditableImageContext &&
              /(отредактир|измени|поменяй|перекрас|убери|удали|добав|замен|отретуш|улучш|сделай.{0,24}(фон|цвет|стил|темн|светл|размыт|ч[её]рно|красн|син|другой)|перерисуй|дорисуй|edit|modify|change|remove|add|replace|restyle|retouch|background|photoshop|в стиле|на фото|эту картин|это фото|изображен)/i.test(
                intentProbeText,
              );
            const wantsWebImage =
              /(покажи.{0,18}(фото|картин|изображ|как выгляд)|как выглядит|как выглядят|найди.{0,18}(фото|картин|изображ)|фотографи|схема|чертеж|чертёж|show.{0,14}(photo|picture|image)|what does.{0,24}look like|find.{0,14}(photo|image|picture))/i.test(
                intentProbeText,
              );
            const wantsGmail =
              /(письм|почт|gmail|email|e-mail|имэйл|имейл|входящ|рассылк|отправ.{0,30}(@|маме|папе|босс|коллег|друг|клиент|почт|письм|открытк|файл|отч[её]т)|напиши.{0,24}(письм|на почт|@)|send.{0,18}(mail|email)|inbox|check.{0,12}mail)/i.test(
                intentProbeText,
              );
            const wantsCalendar =
              /(календар|встреч|событ|напомн|запланир|расписан|созвон|свободн.{0,14}врем|calendar|meeting|event|schedule|remind|appointment|free.?busy)/i.test(
                intentProbeText,
              );
            const wantsTasks =
              /(задач|список дел|todo|to-do|task|чеклист|дел[ао]\b|напомни сделать|добавь.{0,18}дел|выполн.{0,18}задач|отмет.{0,18}задач|google tasks)/i.test(
                intentProbeText,
              );
            const wantsMemory =
              /(запомн|забудь|память|memory|remember|forget|сохрани.{0,24}(памят|факт|контакт|обо мне)|меня зовут|мо[её] имя|мой (номер|email|почт|город|проект|стиль|стек)|маме|папе|боссу|жене|мужу|другу|контакт|как меня зовут|что ты (знаешь|помнишь) обо мне|мои заметк)/i.test(
                intentProbeText,
              );
            const wantsLibrary =
              mentionsFileOrLibrary ||
              wantsGmail ||
              (wantsMemory && /(файл|документ|отч[её]т|библиотек|library|report|doc|pdf)/i.test(intentProbeText));
            const wantsArtifact =
              /(создай.{0,24}(файл|артефакт|страниц|сайт|лендинг|html|скрипт|документ|отч[её]т|таблиц|json|yaml|sql|код|прилож|игр|калькулятор)|сделай.{0,24}(сайт|лендинг|html|калькулятор|игр|скрипт|артефакт|файл|документ|резюме)|напиши.{0,24}(код|скрипт|программ|html|сайт|калькулятор|игр|класс|модуль|документ|отч[её]т|резюме|статью|конфиг|sql|python|js|ts|c\+\+)|артефакт|artifact|create.{0,18}(file|html|script|page|app|document|artifact)|write.{0,18}(code|script|program|html|app|document))/i.test(
                intentProbeText,
              );
            const wantsRefusalCheck =
              /(позвон|набери номер|отправ.{0,12}(смс|sms)|перевед.{0,16}(денег|деньг|рубл|доллар|на карт)|оплат.{0,14}(счет|счёт|заказ)|банк.{0,14}перевод|взломай.{0,24}(аккаунт|инстаграм|телеграм|telegram|вк|vk|телефон|сайт|почт|вайфай|wi-?fi)|вызови такси|закажи еду|купи билет|включи свет|открой дверь|опубликуй в (инст|тг|телеграм|вк|тикток)|call.{0,14}(phone|number|\+\d)|send.{0,10}sms|transfer.{0,14}money|order.{0,12}food|book.{0,12}flight|hack.{0,16}(account|instagram|telegram|phone)|post to (instagram|tiktok|vk|telegram))/i.test(
                intentProbeText,
              );
            const wantsTabTransition =
              /(engine|энжин|движок|live preview|предпросмотр|full.?stack|фуллстек|ide\b|веб-приложени|github|гитхаб|git push|ci\/cd|терминал|bash|flow\b|флоу|воркфлоу|автономн.{0,14}агент|открой библиотек|open library|вкладк.{0,14}(библиотек|engine|flow|saved)|сохран[её]нн)/i.test(
                intentProbeText,
              );

            const needsLibraryPrefetch = isEngineRequest || wantsLibrary || hasFileTranslatorContext;

            const authed = token
              ? await Promise.race([
                  getUserFromToken(token).catch(() => null),
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
                ])
              : null;
            const photoQuotaActorKey = resolvePhotoQuotaActorKey(request, authed?.id, parsed.deviceFp);

            const [memories, initialLibraryItems]: [MemoryRow[], ServerLibraryItem[]] = await Promise.all([
              authed && lastUserMessage
                ? Promise.race([
                    loadRelevantMemories(authed.client, authed.id, lastUserMessage, 12, authed.token).catch(() => []),
                    new Promise<MemoryRow[]>((resolve) => setTimeout(() => resolve([]), 350)),
                  ])
                : Promise.resolve([]),
              needsLibraryPrefetch
                ? Promise.race([
                    listAllLibraryFilesServer(authed, parsed.libraryFiles || [], { includeChatMediaScan: false }).catch(() => []),
                    new Promise<ServerLibraryItem[]>((resolve) => setTimeout(() => resolve([]), 650)),
                  ])
                : Promise.resolve([]),
            ]);
            let libraryItems: ServerLibraryItem[] = initialLibraryItems;
            let fullLibraryLoaded = false;
            const ensureFullLibraryItems = async (): Promise<ServerLibraryItem[]> => {
              if (fullLibraryLoaded) return libraryItems;
              fullLibraryLoaded = true;
              try {
                const full = await Promise.race([
                  listAllLibraryFilesServer(authed, parsed.libraryFiles || [], { includeChatMediaScan: Boolean(authed?.isJwt) }).catch(() => libraryItems),
                  new Promise<ServerLibraryItem[]>((resolve) => setTimeout(() => resolve(libraryItems), 3500)),
                ]);
                if (full.length >= libraryItems.length) {
                  libraryItems = full;
                }
              } catch {
              }
              return libraryItems;
            };

            // Pre-extract text for rich Office/Word/RTF/ODT library items ONLY when the message relates to files/library
            if (mentionsFileOrLibrary && libraryItems.length > 0) {
              await Promise.all(
                libraryItems
                  .filter((it) => !it.content && it.dataUrl && isRichDocumentExtension(it.name))
                  .slice(0, 6)
                  .map(async (it) => {
                    try {
                      const extracted = await Promise.race([
                        extractLibraryTextAsync(it),
                        new Promise<string>((resolve) => setTimeout(() => resolve(""), 1500)),
                      ]);
                      if (extracted && !looksCorruptedBinaryString(extracted)) {
                        it.content = extracted;
                      }
                    } catch {
                    }
                  }),
              );
            }

            // Pre-extract any Word/PowerPoint/Excel/PDF/D/RTF/ODT/binary attachments directly uploaded in this turn
            const extractedAttachmentTexts = new Map<string, string>();
            if (parsed.userAttachments?.length) {
              await Promise.all(
                parsed.userAttachments.slice(0, 6).map(async (a, idx) => {
                  if (!a?.dataUrl || a.dataUrl.startsWith("data:image/")) return;
                  const decoded = decodeBase64DataUrlToBytes(a.dataUrl);
                  if (!decoded) return;
                  try {
                    const isPdf =
                      a.name.toLowerCase().endsWith(".pdf") ||
                      (decoded.mime || a.type || "").toLowerCase().includes("pdf") ||
                      (decoded.bytes.length >= 4 &&
                        decoded.bytes[0] === 0x25 &&
                        decoded.bytes[1] === 0x50 &&
                        decoded.bytes[2] === 0x44 &&
                        decoded.bytes[3] === 0x46);
                    const extracted = await Promise.race([
                      isPdf
                        ? Promise.resolve(extractPdfServerFallback(decoded.bytes))
                        : extractDocumentTextFromBytes(decoded.bytes, a.name, decoded.mime || a.type || ""),
                      new Promise<string>((resolve) => setTimeout(() => resolve(""), 2500)),
                    ]);
                    if (extracted && !looksCorruptedBinaryString(extracted)) {
                      extractedAttachmentTexts.set(`${idx}:${a.name}`, extracted);
                    }
                  } catch {
                  }
                }),
              );
            }

            const memoryBlock = memories.length
              ? sanitizeTextForApi(`\n\nUSER LONG-TERM MEMORY (relevant facts and attachments remembered from previous conversations — treat as trusted context, refer to naturally, do not mention IDs):\n${memories
                  .map((m) => {
                    let s = `- [id:${m.id}] (${m.kind}) ${m.content}`;
                    if (m.attachment) {
                      s += ` [Вложение в памяти: "${m.attachment.name}" (${m.attachment.type}${m.attachment.textContent ? `, текст: "${m.attachment.textContent.slice(0, 500)}"` : ""})]`;
                    }
                    return s;
                  })
                  .join("\n")}`)
              : "";

            const supportsTools = !isEngineRequest;
            const activeTools = supportsTools
              ? [
                  ...(hasFileTranslatorContext && (mentionsFileOrLibrary || Boolean(parsed.userAttachments?.length))
                    ? [FILE_TRANSLATOR_TOOL]
                    : []),
                  ...(wantsArtifact ? [ARTIFACT_TOOL] : []),
                  ...(wantsImageGen ? [IMAGE_TOOL] : []),
                  ...(wantsImageEdit || (hasEditableImageContext && wantsImageGen) ? [EDIT_IMAGE_TOOL] : []),
                  ...(wantsWebImage ? [WEB_IMAGE_TOOL] : []),
                  ...(wantsCalendar ? [CALENDAR_TOOL] : []),
                  ...(wantsTasks ? [TASKS_TOOL] : []),
                  ...(wantsGmail ? [GMAIL_TOOL] : []),
                  ...(wantsLibrary ? [SEARCH_AND_READ_LIBRARY_TOOL] : []),
                  ...(wantsMemory ? [MANAGE_MEMORY_TOOL, MEMORY_TOOL] : wantsGmail ? [MEMORY_TOOL] : []),
                  ...(wantsRefusalCheck ? [REFUSAL_TOOL] : []),
                  ...(wantsTabTransition ? [TAB_TRANSITION_TOOL] : []),
                  ...(effectiveWebSearch ? [WEB_SEARCH_TOOL] : []),
                ]
              : [];

            const libraryCatalogBlock =
              libraryItems.length > 0 && (isEngineRequest || wantsLibrary || hasFileTranslatorContext)
                ? sanitizeTextForApi(`\n\nUSER LIBRARY CATALOG (files, documents, reports, Flow artifacts & images currently available in the shared Library — use search_and_read_library or translate_file_with_deepseek to read full content):\n${libraryItems
                    .slice(0, 25)
                    .map((item) => {
                      const txt = extractLibraryText(item).slice(0, 140).replace(/\s+/g, " ").trim();
                      return `- [lib_id:${item.id}] "${item.name}" (${item.type}, source: ${item.source}${item.chatTitle ? `, from: ${item.chatTitle}` : ""}${txt ? `, preview: "${txt}"` : ""})`;
                    })
                    .join("\n")}`)
                : "";

            const userAttachmentsBlock = parsed.userAttachments?.length
              ? sanitizeTextForApi(`\n\nUSER ATTACHMENTS IN THIS MESSAGE (files/documents attached directly by the user — read the extracted content from the user message or call translate_file_with_deepseek to interpret Word/PowerPoint/Excel/PDF/D/archive/binary internals; do NOT call search_and_read_library for these direct attachments unless the user explicitly asked for a separate Library file):\n${parsed.userAttachments
                  .map((a, i) => {
                    const serverExtracted = extractedAttachmentTexts.get(`${i}:${a.name}`);
                    const alreadyInMsg = Boolean(
                      (serverExtracted &&
                        serverExtracted.length >= 10 &&
                        lastUserMessage.includes(serverExtracted.slice(0, 60))) ||
                      (lastUserMessage.includes(a.name) &&
                        (lastUserMessage.includes("```") || lastUserMessage.includes("[PDF содержит") || lastUserMessage.includes("[PowerPoint презентация"))),
                    );
                    const inlineSnippet = serverExtracted && !alreadyInMsg
                      ? `\n[Извлечённое содержимое "${a.name}"]:\n${serverExtracted.slice(0, 24_000)}`
                      : alreadyInMsg
                        ? " (содержимое файла уже извлечено в сообщении пользователя — для глубокой расшифровки или перевода используй translate_file_with_deepseek либо отвечай напрямую, НЕ ищи в Library)"
                        : " (для чтения внутренностей этого файла вызови translate_file_with_deepseek)";
                    return `- [attachment_${i + 1}] "${a.name}" (${a.type || "file"})${inlineSnippet}`;
                  })
                  .join("\n")}`)
              : "";

            const gmailStatusInfo = parsed.gmailConnected
              ? "Google Workspace (Gmail, Calendar, Tasks): connected."
              : "Google Workspace (Gmail, Calendar, Tasks): not yet signed in — still call manage_gmail / manage_calendar_event / manage_google_task so an interactive card appears where the user can sign in to Google and confirm execution.";

            const capabilities =
              activeTools.length > 0
                ? `\n\nAutonomous tool rules (${gmailStatusInfo}):
- Files/Docs: call translate_file_with_deepseek for Word/PPT/Excel/PDF/.d/archive/binary interpretation; call search_and_read_library for files stored in Library.
- Memory: call manage_memory (save/update/delete) when asked to remember/forget or given durable personal facts (for Library files: search_and_read_library first, then manage_memory with library_id/library_filename); call search_and_read_memory for contacts ("мама", "босс") or saved docs.
- Email: call manage_gmail autonomously; supports attachments from library (search_and_read_library + library_id), generated_image (generate_image first), user_upload, or memory (memory_id).
- Images: analyze attached images directly; call edit_image whenever asked to modify/add/remove/restyle an attached or previously generated image; call generate_image to create a new image from scratch; call find_web_image ONLY when asked how something real looks ("покажи фото", "как выглядит").
- Productivity & Web: call manage_calendar_event for events/reminders, manage_google_task for tasks, create_artifact for substantial code/docs${effectiveWebSearch ? ", web_search for live/current info (cite sources)" : ""}.
- Google Workspace honesty: manage_calendar_event, manage_google_task, and manage_gmail create an interactive confirmation card in the UI. NEVER claim the email is already sent or the event/task is already saved in Google — tell the user to click the Confirm button on the card (and sign in to Google if prompted).
- Boundaries & Tabs: call refuse_unsupported_request immediately for impossible actions (calls, SMS, banking, physical acts, live hacking); call suggest_tab_transition ONLY for full-stack/IDE live preview ('engine'), GitHub/CI-CD/terminal ('flow'), or opening Library UI ('library' — NOT when asked to read/remember/email a Library file).
- Never print raw tool markup; after tools, confirm briefly without repeating full payloads.`
                : "";
            const effectiveSystemCore = buildEffectiveWorkspacePrompt(
              parsed.agent as AgentId,
              parsed.workspace,
            );
            const personalizationBlock = isEngineRequest
              ? ""
              : buildPersonalizationDirective({
                  aiStyle: parsed.aiStyle,
                  aiLength: parsed.aiLength,
                });
            const effectiveTemperature = resolveEffectiveTemperature(
              parsed.model,
              parsed.aiCreativity,
            );
            const engineContextBlock =
              isEngineRequest && clientSystemBlocks.length > 0
                ? `\n\nENGINE WORKSPACE FORMAT CONTRACT:\n${clientSystemBlocks.join("\n\n")}`
                : "";
            const systemMessage: ChatMessage = {
              role: "system",
              content: isEngineRequest
                ? `${effectiveSystemCore}${engineContextBlock}${memoryBlock}${libraryCatalogBlock}${userAttachmentsBlock}`
                : `${effectiveSystemCore}${personalizationBlock}${capabilities}${memoryBlock}${libraryCatalogBlock}${userAttachmentsBlock}`,
            };
            const baseMessages: ChatMessage[] = [
              systemMessage,
              ...primaryHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
            ];

            type StreamOutcome = {
              finishReason: string | null;
              toolCalls: ToolCall[];
              assistantText: string;
              reasoningText: string;
            };

            async function consumeOpenAiSse(
              upstream: Response,
              forwardText: boolean,
            ): Promise<StreamOutcome> {
              if (!upstream.body) {
                throw new Error(`upstream ${upstream.status}`);
              }
              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              const toolAcc = new Map<number, { id: string; name: string; args: string }>();
              let finishReason: string | null = null;
              let assistantText = "";
              let reasoningText = "";

              const processLines = (lines: string[]) => {
                for (const raw of lines) {
                  const line = raw.trim();
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") continue;
                  try {
                    const json = JSON.parse(payload) as {
                      choices?: Array<{
                        delta?: {
                          content?: string;
                          reasoning_content?: string;
                          reasoning?: string;
                          tool_calls?: Array<{
                            index: number;
                            id?: string;
                            function?: { name?: string; arguments?: string };
                          }>;
                        };
                        finish_reason?: string | null;
                      }>;
                    };
                    const choice = json.choices?.[0];
                    const delta = choice?.delta;
                    if (choice?.finish_reason) finishReason = choice.finish_reason;
                    const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
                    if (reasoningDelta) {
                      reasoningText += reasoningDelta;
                      if (forwardText && effectiveReasoning) {
                        send("reasoning", JSON.stringify(reasoningDelta));
                      }
                    }
                    if (delta?.content) {
                      assistantText += delta.content;
                      if (forwardText) send("delta", JSON.stringify(delta.content));
                    }
                    if (delta?.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        const existing = toolAcc.get(tc.index) ?? { id: "", name: "", args: "" };
                        if (tc.id) existing.id = tc.id;
                        if (tc.function?.name) existing.name = tc.function.name;
                        if (tc.function?.arguments) existing.args += tc.function.arguments;
                        toolAcc.set(tc.index, existing);
                      }
                    }
                  } catch {
                  }
                }
              };

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                processLines(lines);
              }
              if (buffer.trim()) {
                processLines(buffer.split("\n"));
              }

              const toolCalls: ToolCall[] = Array.from(toolAcc.entries())
                .sort(([a], [b]) => a - b)
                .map(([, v]) => ({
                  id: v.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                  type: "function" as const,
                  function: { name: v.name, arguments: v.args },
                }));

              return { finishReason, toolCalls, assistantText, reasoningText };
            }

            /**
             * TTFT Hedged Racing for ApiMira DeepSeek <= 4.0:
             * ApiMira workers occasionally stall 15-30s+ on a single connection while another worker
             * for the exact same DeepSeek <= 4.0 model responds in ~4.5-6s.
             * When reasoning is OFF, if attempt 1 has not returned HTTP headers after 4.2s, we launch
             * a hedged parallel request to the SAME model, take whichever returns HTTP 200 first,
             * and immediately abort the slower connection.
             */
            async function fetchApimiraWithHedge(att: {
              msgs: ChatMessage[];
              useTools: typeof activeTools | null;
              modelOverride: string;
              stripImages?: boolean;
            }): Promise<Response> {
              if (effectiveReasoning) {
                return callApimiraDeepSeek(
                  apimiraKey,
                  apimiraBaseUrl,
                  att.msgs,
                  att.useTools,
                  parsed.model,
                  effectiveReasoning,
                  effectiveTemperature,
                  att.modelOverride,
                  Boolean(att.stripImages),
                  false,
                  { signal: streamAbort.signal, headerTimeoutMs: 90_000 },
                );
              }

              const HEDGE_1_DELAY_MS = 2_500;
              const HEDGE_2_DELAY_MS = 6_500;
              const HEADER_TIMEOUT_MS = 16_000;

              return new Promise<Response>((resolve, reject) => {
                const controllers = [new AbortController(), new AbortController(), new AbortController()];
                let settled = false;
                let launchedCount = 0;
                let pending = 0;
                let fallbackNonOk: Response | null = null;
                let lastError: unknown = null;
                const timers: Array<ReturnType<typeof setTimeout>> = [];

                const onStreamAbort = () => {
                  for (const ac of controllers) ac.abort(streamAbort.signal.reason);
                };
                if (streamAbort.signal.aborted) {
                  onStreamAbort();
                } else {
                  streamAbort.signal.addEventListener("abort", onStreamAbort, { once: true });
                }

                const clearTimers = () => {
                  while (timers.length > 0) {
                    const t = timers.pop();
                    if (t) clearTimeout(t);
                  }
                };

                const cleanup = () => {
                  clearTimers();
                  streamAbort.signal.removeEventListener("abort", onStreamAbort);
                };

                const finishOk = (res: Response, winnerIdx: number) => {
                  if (settled) {
                    try {
                      void res.body?.cancel();
                    } catch {}
                    return;
                  }
                  settled = true;
                  cleanup();
                  controllers.forEach((ac, i) => {
                    if (i !== winnerIdx) ac.abort();
                  });
                  resolve(res);
                };

                const finishFailIfDone = () => {
                  if (settled || pending > 0) return;
                  settled = true;
                  cleanup();
                  if (fallbackNonOk) {
                    resolve(fallbackNonOk);
                  } else {
                    reject(lastError ?? new Error("apimira_hedged_failed"));
                  }
                };

                const launchAttempt = (idx: number) => {
                  if (settled || idx >= controllers.length || streamAbort.signal.aborted) return;
                  launchedCount = Math.max(launchedCount, idx + 1);
                  pending += 1;
                  const ac = controllers[idx];
                  void callApimiraDeepSeek(
                    apimiraKey,
                    apimiraBaseUrl,
                    att.msgs,
                    att.useTools,
                    parsed.model,
                    false,
                    effectiveTemperature,
                    att.modelOverride,
                    Boolean(att.stripImages),
                    false,
                    { signal: ac.signal, headerTimeoutMs: HEADER_TIMEOUT_MS },
                  )
                    .then((res) => {
                      pending -= 1;
                      if (settled) {
                        try {
                          void res.body?.cancel();
                        } catch {}
                        return;
                      }
                      if (res.ok && res.body) {
                        finishOk(res, idx);
                        return;
                      }
                      // If primary returned an immediate error (502/401/402/400) before any hedge launched,
                      // stop scheduled hedges and fail over immediately to the next DeepSeek <= 4.0 shard.
                      if (launchedCount === 1) {
                        clearTimers();
                      }
                      if (!fallbackNonOk) {
                        fallbackNonOk = res;
                      } else {
                        try {
                          void res.body?.cancel();
                        } catch {}
                      }
                      finishFailIfDone();
                    })
                    .catch((err) => {
                      pending -= 1;
                      if (settled) return;
                      lastError = err;
                      if (idx === 0 && launchedCount === 1 && !streamAbort.signal.aborted) {
                        launchAttempt(1);
                        return;
                      }
                      finishFailIfDone();
                    });
                };

                launchAttempt(0);

                timers.push(
                  setTimeout(() => {
                    if (!settled && launchedCount < 2 && !streamAbort.signal.aborted) {
                      launchAttempt(1);
                    }
                  }, HEDGE_1_DELAY_MS),
                );
                timers.push(
                  setTimeout(() => {
                    if (!settled && launchedCount < 3 && !streamAbort.signal.aborted) {
                      launchAttempt(2);
                    }
                  }, HEDGE_2_DELAY_MS),
                );
              });
            }

            async function runApimiraDeepSeek(
              messages: ChatMessage[],
              tools: typeof activeTools,
              forwardText: boolean,
            ): Promise<{ outcome: StreamOutcome | null; error?: unknown }> {
              if (!apimiraKey) return { outcome: null };
              const modelChain = getApimiraFallbackChain(parsed.model, effectiveReasoning);
              const attempts: Array<{
                msgs: ChatMessage[];
                useTools: typeof activeTools | null;
                modelOverride: string;
                stripImages?: boolean;
              }> = [
                ...modelChain.map((m) => ({
                  msgs: messages,
                  useTools: tools.length ? tools : null,
                  modelOverride: m,
                })),
                {
                  msgs: trimMessagesForRetry(messages, 45_000),
                  useTools: null,
                  modelOverride: modelChain[1] || modelChain[0],
                  stripImages: true,
                },
              ];
              let lastErr: unknown = null;
              for (const att of attempts) {
                if (streamClosed || streamAbort.signal.aborted) break;
                try {
                  let upstream = await fetchApimiraWithHedge(att);
                  if (upstream.status === 400 && !effectiveReasoning) {
                    upstream = await callApimiraDeepSeek(
                      apimiraKey,
                      apimiraBaseUrl,
                      att.msgs,
                      att.useTools,
                      parsed.model,
                      effectiveReasoning,
                      effectiveTemperature,
                      att.modelOverride,
                      Boolean(att.stripImages),
                      true,
                      { signal: streamAbort.signal, headerTimeoutMs: 18_000 },
                    );
                  }
                  if (upstream.ok && upstream.body) {
                    markApimiraModelHealthy(att.modelOverride);
                    const outcome = await consumeOpenAiSse(upstream, forwardText);
                    if (outcome.assistantText || outcome.toolCalls.length > 0) {
                      return { outcome };
                    }
                    lastErr = new Error("deepseek gateway empty response");
                  } else {
                    markApimiraModelUnhealthy(att.modelOverride, upstream.status);
                    const text = await upstream.text().catch(() => "");
                    lastErr = new Error(`deepseek gateway ${upstream.status}: ${text.slice(0, 160)}`);
                    if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
                      break;
                    }
                  }
                } catch (aErr) {
                  lastErr = aErr;
                }
              }
              if (lastErr) {
                console.warn("DeepSeek gateway fallback chain exhausted:", (lastErr as Error)?.message || lastErr);
              }
              return { outcome: null, error: lastErr };
            }

            function trimMessagesForRetry(messages: ChatMessage[], maxMsgChars = 60_000): ChatMessage[] {
              const sys: ChatMessage[] = [];
              for (const m of messages) {
                if (m.role === "system") {
                  sys.push({
                    role: "system",
                    content: sanitizeTextForApi(m.content).slice(0, maxMsgChars),
                  });
                  break;
                }
              }
              const nonSys: ChatMessage[] = messages
                .filter((m) => m.role !== "system")
                .slice(-10)
                .map((m): ChatMessage => {
                  if (m.role === "user") {
                    return {
                      role: "user",
                      content: sanitizeTextForApi(m.content).slice(0, maxMsgChars),
                    };
                  }
                  if (m.role === "assistant") {
                    return {
                      ...m,
                      content: typeof m.content === "string" ? sanitizeTextForApi(m.content).slice(0, 24_000) : m.content,
                    };
                  }
                  return m;
                });
              return [...sys, ...nonSys];
            }

            async function runStream(
              messages: ChatMessage[],
              tools: typeof activeTools,
              forwardText: boolean,
            ): Promise<StreamOutcome> {
              let lastErr: unknown = null;

              if (shouldTryDirectDeepSeek(deepseekKey, apimiraKey)) {
                const dsAttempts: Array<{
                  msgs: ChatMessage[];
                  useTools: typeof activeTools | null;
                  useReasoning: boolean;
                  modelOverride?: string;
                }> = [
                  { msgs: messages, useTools: tools.length ? tools : null, useReasoning: effectiveReasoning },
                  { msgs: trimMessagesForRetry(messages, 55_000), useTools: tools.length ? tools : null, useReasoning: false, modelOverride: DEEPSEEK_DIRECT_CHAT },
                  { msgs: trimMessagesForRetry(messages, 35_000), useTools: null, useReasoning: false, modelOverride: DEEPSEEK_DIRECT_INSTINCT },
                ];

                for (const att of dsAttempts) {
                  try {
                    const upstream = await callPrimary(
                      deepseekKey,
                      att.msgs,
                      att.useTools,
                      att.useReasoning,
                      parsed.model,
                      effectiveTemperature,
                      att.modelOverride,
                    );
                    if (upstream.ok && upstream.body) {
                      const outcome = await consumeOpenAiSse(upstream, forwardText);
                      if (outcome.assistantText || outcome.toolCalls.length > 0) {
                        return outcome;
                      }
                      lastErr = new Error("upstream empty response");
                    } else {
                      markDirectDeepSeekUnavailable(upstream.status);
                      const text = await upstream.text().catch(() => "");
                      if (!apimiraKey || (upstream.status !== 401 && upstream.status !== 402 && upstream.status !== 403)) {
                        console.warn("DeepSeek primary fallback status", upstream.status, text.slice(0, 200));
                      }
                      lastErr = new Error(`deepseek ${upstream.status}`);
                      if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
                        break;
                      }
                    }
                  } catch (primaryErr) {
                    if (!apimiraKey) {
                      console.warn("DeepSeek primary stream failed, retrying:", (primaryErr as Error)?.message || primaryErr);
                    }
                    lastErr = primaryErr;
                  }
                }
              }

              const dsGateway = await runApimiraDeepSeek(messages, tools, forwardText);
              if (dsGateway.outcome) return dsGateway.outcome;
              if (dsGateway.error) lastErr = dsGateway.error;

              throw lastErr instanceof Error ? lastErr : new Error("deepseek_unavailable");
            }

            let finalAssistantText = "";
            let memoryMutatedInTool = false;
            let hitImageLimit = false;
            let lastTranslatedFileText: string | null = null;
            let lastGeneratedImageDataUrl: string | null =
              parsed.previousGeneratedImage?.dataUrl?.startsWith("data:image/")
                ? parsed.previousGeneratedImage.dataUrl
                : null;
            let lastGeneratedImageState: { dataUrl: string; messageIndex: number; sameTurn?: boolean } | null =
              lastGeneratedImageDataUrl
                ? {
                    dataUrl: lastGeneratedImageDataUrl,
                    messageIndex: parsed.previousGeneratedImage?.messageIndex ?? cleanMessages.length - 1,
                    sameTurn: false,
                  }
                : null;

            try {
              if (isChinaSensitive(lastUserMessage)) {
                const custom = getCustomGlobalPromptForWorkspace(parsed.workspace);
                const customDirective = custom ? `${custom}\n\n` : "";
                const fallbackMessages = [
                  {
                    role: "system" as const,
                    content:
                      `${customDirective}Answer the user's question directly, factually, and neutrally. Do not discuss unrelated topics.`,
                  },
                  { role: "user" as const, content: lastUserMessage },
                ];
                finalAssistantText = await streamFallbackToClient(fallbackMessages, send, parsed.model);
                send("done", "1");
                safeClose();
                if (authed && lastUserMessage) {
                  void analyzeAndUpdateMemory(
                    authed.client,
                    authed.id,
                    lastUserMessage,
                    finalAssistantText,
                    authed.token,
                  ).catch((e) => console.error("memory analyze error", e));
                }
                return;
              }

              let conversationMessages: ChatMessage[] = [...baseMessages];
              let currentOutcome = await runStream(conversationMessages, activeTools, true);
              finalAssistantText = currentOutcome.assistantText;

              let toolRound = 0;
              while ((currentOutcome.finishReason === "tool_calls" || (!currentOutcome.assistantText && currentOutcome.toolCalls.length > 0)) && currentOutcome.toolCalls.length > 0 && toolRound < 4) {
                toolRound += 1;
                const followupMessages: ChatMessage[] = [
                  ...conversationMessages,
                  {
                    role: "assistant",
                    content: currentOutcome.assistantText || null,
                    ...(currentOutcome.reasoningText ? { reasoning_content: currentOutcome.reasoningText } : {}),
                    tool_calls: currentOutcome.toolCalls,
                  },
                ];

                for (const tc of currentOutcome.toolCalls) {
                  if (tc.function.name === "create_artifact") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        language?: string;
                        content?: string;
                        description?: string;
                      };
                      const artifact = {
                        id: tc.id,
                        title: String(parsedArgs.title ?? "Artifact"),
                        language: String(parsedArgs.language ?? "text"),
                        content: String(parsedArgs.content ?? ""),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                      };
                      send("artifact", JSON.stringify(artifact));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Артефакт «${artifact.title}» создан и показан пользователю карточкой. Не повторяй его содержимое в тексте — просто кратко подтверди.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "generate_image") {
                    try {
                      const quotaStatus = checkServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      if (!quotaStatus.allowed) {
                        hitImageLimit = true;
                        send(
                          "image_limit",
                          JSON.stringify({
                            scope: "image",
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                          }),
                        );
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            limit_reached: true,
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                            message:
                              "Дневной лимит генерации и редактирования фото (8 фото в день) исчерпан. Пользователю уже показана карточка с таймером до обновления. Кратко подтверди, что лимит на сегодня исчерпан, и напомни, что обычный текстовый чат работает без ограничений.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        prompt?: string;
                        description?: string;
                      };
                      if (!parsedArgs.prompt) throw new Error("missing prompt");
                      const imageTitle = String(parsedArgs.title ?? "Generated image");
                      send("image_start", JSON.stringify({ title: imageTitle, prompt: parsedArgs.prompt }));
                      const dataUrl = await generateImage(parsedArgs.prompt);
                      const updatedQuota = consumeServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      currentImageQuotaHint = { used: updatedQuota.used, resetAt: updatedQuota.resetAt };
                      send("photo_usage", JSON.stringify(updatedQuota));
                      lastGeneratedImageDataUrl = dataUrl;
                      lastGeneratedImageState = {
                        dataUrl,
                        messageIndex: cleanMessages.length,
                        sameTurn: true,
                      };
                      const image: GeneratedImage = {
                        id: tc.id,
                        title: imageTitle,
                        prompt: String(parsedArgs.prompt),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                        dataUrl,
                      };
                      send("image", JSON.stringify(image));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Изображение «${image.title}» сгенерировано и показано пользователю карточкой. Не описывай картинку подробно — просто кратко подтверди.`,
                        }),
                      });
                    } catch (e) {
                      const errMsg = (e as Error).message || "Image generation failed";
                      send("image_error", JSON.stringify({ message: errMsg }));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: errMsg }),
                      });
                    }
                  } else if (tc.function.name === "edit_image") {
                    try {
                      const quotaStatus = checkServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      if (!quotaStatus.allowed) {
                        hitImageLimit = true;
                        send(
                          "image_limit",
                          JSON.stringify({
                            scope: "image",
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                          }),
                        );
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            limit_reached: true,
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                            message:
                              "Дневной лимит генерации и редактирования фото (8 фото в день) исчерпан. Пользователю уже показана карточка с таймером до обновления. Кратко подтверди, что лимит на сегодня исчерпан, и напомни, что обычный текстовый чат работает без ограничений.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        prompt?: string;
                        description?: string;
                      };
                      if (!parsedArgs.prompt) throw new Error("missing edit prompt");
                      const sourceImages = collectLatestSourceImages(
                        parsed.userAttachments,
                        cleanMessages,
                        lastGeneratedImageState,
                      );
                      if (sourceImages.length === 0) {
                        throw new Error("No source image found for editing");
                      }
                      const imageTitle = String(parsedArgs.title ?? "Edited image");
                      send("image_start", JSON.stringify({ title: imageTitle, prompt: parsedArgs.prompt }));
                      const edited = await editImageWithGptImage2(parsedArgs.prompt, sourceImages);
                      const updatedQuota = consumeServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      currentImageQuotaHint = { used: updatedQuota.used, resetAt: updatedQuota.resetAt };
                      send("photo_usage", JSON.stringify(updatedQuota));
                      lastGeneratedImageDataUrl = edited.dataUrl;
                      lastGeneratedImageState = {
                        dataUrl: edited.dataUrl,
                        messageIndex: cleanMessages.length,
                        sameTurn: true,
                      };
                      const image: GeneratedImage = {
                        id: tc.id,
                        title: imageTitle,
                        prompt: String(parsedArgs.prompt),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                        dataUrl: edited.dataUrl,
                      };
                      send("image", JSON.stringify(image));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Изображение «${image.title}» отредактировано по запросу и показано пользователю карточкой. Кратко подтверди, что правка выполнена.`,
                        }),
                      });
                    } catch (e) {
                      const errMsg = (e as Error).message || "Image editing failed";
                      send("image_error", JSON.stringify({ message: errMsg }));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: errMsg }),
                      });
                    }
                  } else if (tc.function.name === "web_search") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as { query?: string };
                      const query = String(parsedArgs.query ?? "").trim() || lastUserMessage.slice(0, 200);
                      if (!query) throw new Error("missing query");
                      send("web_search", JSON.stringify({ query }));
                      const { results, groundedSummary } = await webSearch(query);
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          query,
                          ...(groundedSummary ? { groundedSummary } : {}),
                          results,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "find_web_image") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as { query?: string; caption?: string };
                      const query = String(parsedArgs.query ?? "").trim();
                      if (!query) throw new Error("missing query");
                      const imgResults = await searchWebImages(query);
                      const webImagePayload = {
                        id: tc.id,
                        query,
                        caption: parsedArgs.caption,
                        images: imgResults,
                      };
                      send("web_image", JSON.stringify(webImagePayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          query,
                          count: imgResults.length,
                          message: `Найдены изображения по запросу "${query}" (${imgResults.length} шт.) и отображены пользователю карточкой.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_calendar_event") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        summary?: string;
                        description?: string;
                        start_time?: string;
                        end_time?: string;
                        location?: string;
                        reminder_minutes?: number;
                        event_id?: string;
                        query?: string;
                      };
                      const parseIsoSafe = (raw?: string, fallbackMs?: number): string => {
                        if (raw && raw.trim()) {
                          const d = new Date(raw.trim());
                          if (!Number.isNaN(d.getTime())) return d.toISOString();
                        }
                        return new Date(fallbackMs ?? Date.now() + 3600_000).toISOString();
                      };
                      const startIso = parseIsoSafe(parsedArgs.start_time, Date.now() + 3600_000);
                      const endIso = parseIsoSafe(
                        parsedArgs.end_time,
                        new Date(startIso).getTime() + 3600_000,
                      );
                      const remArray =
                        typeof parsedArgs.reminder_minutes === "number" && Number.isFinite(parsedArgs.reminder_minutes)
                          ? [Math.max(0, Math.round(parsedArgs.reminder_minutes))]
                          : undefined;
                      const calendarPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "create",
                        summary: parsedArgs.summary || "Calendar Event",
                        description: parsedArgs.description,
                        location: parsedArgs.location,
                        start: { dateTime: startIso },
                        end: { dateTime: endIso },
                        startTime: startIso,
                        endTime: endIso,
                        reminderMinutes: remArray,
                        eventId: parsedArgs.event_id,
                        query: parsedArgs.query,
                      };
                      send("calendar_event", JSON.stringify(calendarPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          pendingConfirmation: true,
                          action: calendarPayload.action,
                          event: calendarPayload,
                          message: `Подготовлена карточка Google Calendar для события «${calendarPayload.summary}» (${calendarPayload.action}). Оно ЕЩЁ НЕ записано в Google Calendar — сообщи пользователю нажать кнопку подтверждения в карточке (и при необходимости войти в Google), чтобы выполнить действие.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_google_task") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        title?: string;
                        notes?: string;
                        due?: string;
                        task_id?: string;
                        task_list_id?: string;
                      };
                      let normalizedDue: string | undefined;
                      if (parsedArgs.due && parsedArgs.due.trim()) {
                        const rawDue = parsedArgs.due.trim();
                        const parsedDue = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? `${rawDue}T00:00:00.000Z` : rawDue);
                        normalizedDue = !Number.isNaN(parsedDue.getTime()) ? parsedDue.toISOString() : undefined;
                      }
                      const taskPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "create",
                        title: parsedArgs.title || "New Task",
                        notes: parsedArgs.notes,
                        due: normalizedDue,
                        taskId: parsedArgs.task_id,
                        taskListId: parsedArgs.task_list_id || "@default",
                        status: parsedArgs.action === "complete" ? "completed" : "needsAction",
                      };
                      send("task_event", JSON.stringify(taskPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          pendingConfirmation: true,
                          action: taskPayload.action,
                          task: taskPayload,
                          message: `Подготовлена карточка Google Tasks для задачи «${taskPayload.title}» (${taskPayload.action}). Она ЕЩЁ НЕ записана в Google Tasks — сообщи пользователю нажать кнопку подтверждения в карточке (и при необходимости войти в Google), чтобы выполнить действие.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_gmail") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        to?: string;
                        subject?: string;
                        body?: string;
                        message_id?: string;
                        query?: string;
                        attachments?: Array<{
                          filename?: string;
                          source?: "generated_image" | "user_upload" | "memory" | "library";
                          data_url?: string;
                          memory_id?: string;
                          library_id?: string;
                        }>;
                      };

                      const resolvedAttachments: Array<{ filename: string; mimeType?: string; dataUrl?: string }> = [];

                      if (Array.isArray(parsedArgs.attachments) && parsedArgs.attachments.length > 0) {
                        for (const att of parsedArgs.attachments) {
                          let dataUrl = att.data_url;
                          let filename = att.filename || "attachment";
                          let mimeOverride: string | undefined;

                          if (!dataUrl && (att.source === "generated_image" || filename.includes("card") || filename.includes("image") || filename.includes("открытк")) && lastGeneratedImageDataUrl) {
                            dataUrl = lastGeneratedImageDataUrl;
                          }

                          if (!dataUrl && (att.source === "library" || att.library_id) && libraryItems.length > 0) {
                            const matches = findLibraryFiles(libraryItems, {
                              id: att.library_id,
                              filename: att.filename,
                              query: att.filename,
                            });
                            const libMatch = matches[0];
                            if (libMatch) {
                              dataUrl = libraryItemToBase64DataUrl(libMatch);
                              filename = libMatch.name;
                              mimeOverride = libMatch.mimeType;
                            }
                          }

                          if (!dataUrl && parsed.userAttachments?.length && att.source !== "library" && att.source !== "memory") {
                            const match = parsed.userAttachments.find((ua) => ua.name.toLowerCase() === filename.toLowerCase()) || parsed.userAttachments[0];
                            if (match) {
                              dataUrl = match.dataUrl;
                              filename = match.name;
                            }
                          }

                          if (!dataUrl && authed && att.memory_id) {
                            let targetMem = memories.find((m) => m.id === att.memory_id);
                            if (!targetMem) {
                              const freshAll = await listAllMemories(authed.client, authed.id, authed.token).catch(() => []);
                              targetMem = freshAll.find((m) => m.id === att.memory_id);
                            }
                            if (targetMem?.attachment?.dataUrl) {
                              dataUrl = targetMem.attachment.dataUrl;
                              filename = targetMem.attachment.name;
                            } else if (targetMem?.attachment?.textContent) {
                              dataUrl = `data:text/plain;base64,${Buffer.from(targetMem.attachment.textContent, "utf-8").toString("base64")}`;
                              filename = targetMem.attachment.name;
                              mimeOverride = targetMem.attachment.type;
                            }
                          }

                          if (!dataUrl && libraryItems.length > 0) {
                            const fallbackLib = findLibraryFiles(libraryItems, {
                              id: att.library_id,
                              filename: att.filename,
                              query: att.filename,
                            })[0];
                            if (fallbackLib) {
                              dataUrl = libraryItemToBase64DataUrl(fallbackLib);
                              filename = fallbackLib.name;
                              mimeOverride = fallbackLib.mimeType;
                            }
                          }

                          if (dataUrl) {
                            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
                            resolvedAttachments.push({
                              filename,
                              mimeType: mimeOverride || (mimeMatch ? mimeMatch[1] : undefined),
                              dataUrl,
                            });
                          }
                        }
                      } else if (lastGeneratedImageDataUrl && (lastUserMessage.toLowerCase().includes("отправ") || lastUserMessage.toLowerCase().includes("send")) && (lastUserMessage.toLowerCase().includes("открытк") || lastUserMessage.toLowerCase().includes("фото") || lastUserMessage.toLowerCase().includes("картинк") || lastUserMessage.toLowerCase().includes("карточк"))) {
                        resolvedAttachments.push({
                          filename: "greeting_card.png",
                          mimeType: "image/png",
                          dataUrl: lastGeneratedImageDataUrl,
                        });
                      } else if (parsed.userAttachments?.length && (lastUserMessage.toLowerCase().includes("отправ") || lastUserMessage.toLowerCase().includes("send"))) {
                        for (const ua of parsed.userAttachments) {
                          if (!ua.dataUrl) continue;
                          const mimeMatch = ua.dataUrl.match(/^data:([^;]+);/);
                          resolvedAttachments.push({
                            filename: ua.name,
                            mimeType: mimeMatch ? mimeMatch[1] : undefined,
                            dataUrl: ua.dataUrl,
                          });
                        }
                      } else if (
                        libraryItems.length > 0 &&
                        (parsedArgs.action || "send") === "send" &&
                        /(library|библиотек|отч[её]т|report|файл|документ)/i.test(lastUserMessage)
                      ) {
                        const libMatch = findLibraryFiles(libraryItems, { query: lastUserMessage })[0];
                        if (libMatch) {
                          const dataUrl = libraryItemToBase64DataUrl(libMatch);
                          if (dataUrl) {
                            resolvedAttachments.push({
                              filename: libMatch.name,
                              mimeType: libMatch.mimeType,
                              dataUrl,
                            });
                          }
                        }
                      }

                      const gmailPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "list",
                        to: parsedArgs.to,
                        subject: parsedArgs.subject || "Gmail Message",
                        body: parsedArgs.body,
                        messageId: parsedArgs.message_id,
                        query: parsedArgs.query,
                        attachments: resolvedAttachments,
                      };
                      send("gmail_event", JSON.stringify(gmailPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          pendingConfirmation: true,
                          action: gmailPayload.action,
                          gmail: gmailPayload,
                          message: `Подготовлена карточка Gmail (${gmailPayload.action}).${resolvedAttachments.length ? ` Вложено файлов: ${resolvedAttachments.map((a) => a.filename).join(", ")}.` : ""} Действие ЕЩЁ НЕ выполнено и письмо ЕЩЁ НЕ отправлено — попроси пользователя проверить данные и нажать кнопку подтверждения в карточке (при необходимости войдя в Google).`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "search_and_read_library") {
                    try {
                      await ensureFullLibraryItems();
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as {
                        query?: string;
                        library_id?: string;
                        filename?: string;
                      };
                      const matches = findLibraryFiles(libraryItems, {
                        id: parsedArgs.library_id,
                        filename: parsedArgs.filename,
                        query: parsedArgs.query || lastUserMessage,
                      });
                      const filesOut = await Promise.all(
                        matches.slice(0, 8).map(async (item) => {
                          const text = await extractLibraryTextAsync(item);
                          return {
                            id: item.id,
                            name: item.name,
                            type: item.type,
                            mimeType: item.mimeType,
                            source: item.source,
                            chatTitle: item.chatTitle,
                            updatedAt: item.updatedAt,
                            textContent: text
                              ? text.slice(0, 32_000)
                              : "(бинарный файл или изображение без текстового содержимого)",
                            hasBinaryData: Boolean(item.dataUrl),
                          };
                        }),
                      );
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          total_in_library: libraryItems.length,
                          count: filesOut.length,
                          files: filesOut,
                          message: filesOut.length
                            ? `Найдено файлов в Library: ${filesOut.length}. Используй их содержимое и id (library_id) для ответа, сохранения в память (manage_memory) или отправки через Gmail (manage_gmail с source: "library").`
                            : "Подходящие файлы в Library не найдены. Сообщи об этом пользователю честно.",
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "translate_file_with_deepseek") {
                    try {
                      await ensureFullLibraryItems();
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as {
                        filename?: string;
                        source?: "auto" | "user_upload" | "library" | "memory";
                        library_id?: string;
                        memory_id?: string;
                        attachment_index?: number;
                        user_question?: string;
                      };
                      const res = await translateFileWithDeepSeek(parsedArgs, {
                        deepseekKey,
                        apimiraKey,
                        apimiraBaseUrl,
                        userAttachments: parsed.userAttachments,
                        libraryItems,
                        memories,
                        messages: cleanMessages,
                        lastUserMessage,
                        preExtractedAttachments: extractedAttachmentTexts,
                      });
                      if (res.ok && res.translatedText) {
                        lastTranslatedFileText = res.translatedText;
                      }
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: res.ok,
                          filename: res.filename,
                          detectedFormat: res.detectedFormat,
                          source: res.source,
                          extractionMethod: res.extractionMethod,
                          ...(res.translatedText ? { translated_text: res.translatedText } : {}),
                          ...(res.error ? { error: res.error } : {}),
                          message: res.ok
                            ? `Инструмент-переводчик DeepSeek успешно прочитал файл «${res.filename}» (${res.detectedFormat}) и сформулировал текст. Передай это объяснение пользователю в чат сообщением (полно, понятно и без потери деталей).`
                            : res.error || "Не удалось расшифровать файл.",
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_memory") {
                    try {
                      if (!authed) {
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            error: "unauthorized",
                            message: "Пользователь не авторизован в облачном аккаунте, поэтому сохранить запись в облачную память нельзя.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as {
                        action?: "save" | "update" | "delete" | "list";
                        content?: string;
                        kind?: string;
                        memory_id?: string;
                        attachment_filename?: string;
                        library_id?: string;
                        library_filename?: string;
                      };
                      const action = parsedArgs.action || "save";
                      if (action === "list") {
                        const all = await listAllMemories(authed.client, authed.id, authed.token);
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            count: all.length,
                            memories: all.slice(0, 40).map((m) => ({
                              id: m.id,
                              kind: m.kind,
                              content: m.content,
                              hasAttachment: Boolean(m.attachment),
                            })),
                          }),
                        });
                      } else if (action === "delete") {
                        if (!parsedArgs.memory_id) {
                          throw new Error("missing memory_id for delete");
                        }
                        await deleteMemory(authed.token, parsedArgs.memory_id);
                        memoryMutatedInTool = true;
                        send("memory_updated", "1");
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            deleted_id: parsedArgs.memory_id,
                            message: "Запись удалена из памяти пользователя.",
                          }),
                        });
                      } else if (action === "update") {
                        if (!parsedArgs.memory_id || !parsedArgs.content?.trim()) {
                          throw new Error("missing memory_id or content for update");
                        }
                        const updated = await updateMemory(authed.id, authed.token, parsedArgs.memory_id, {
                          content: parsedArgs.content.trim(),
                          kind: parsedArgs.kind,
                        });
                        memoryMutatedInTool = true;
                        send("memory_updated", "1");
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            memory: { id: updated.id, content: updated.content, kind: updated.kind },
                            message: `Запись памяти обновлена: «${updated.content}».`,
                          }),
                        });
                      } else {
                        let attachmentToSave: MemoryAttachment | undefined;
                        if (parsedArgs.library_id || parsedArgs.library_filename || (parsedArgs.attachment_filename && !parsed.userAttachments?.length)) {
                          const libMatch = findLibraryFiles(libraryItems, {
                            id: parsedArgs.library_id,
                            filename: parsedArgs.library_filename || parsedArgs.attachment_filename,
                            query: parsedArgs.library_filename || parsedArgs.attachment_filename || lastUserMessage,
                          })[0];
                          if (libMatch) {
                            const textContent = (await extractLibraryTextAsync(libMatch)).slice(0, 24_000);
                            const safeB64 = libraryItemToBase64DataUrl(libMatch);
                            attachmentToSave = {
                              name: libMatch.name,
                              type: libMatch.mimeType || "text/plain",
                              ...(safeB64 && safeB64.length <= 750_000 ? { dataUrl: safeB64 } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        if (!attachmentToSave && (parsedArgs.attachment_filename || (parsed.userAttachments?.length && !parsedArgs.content?.trim()))) {
                          const targetName = (parsedArgs.attachment_filename || "").toLowerCase();
                          const ua =
                            parsed.userAttachments?.find((a) => a.name.toLowerCase() === targetName) ||
                            parsed.userAttachments?.[0];
                          if (ua) {
                            const mime = ua.type || (ua.dataUrl.startsWith("data:") ? ua.dataUrl.slice(5, ua.dataUrl.indexOf(";")) : "application/octet-stream");
                            let textContent: string | undefined;
                            if (isRichDocumentExtension(ua.name)) {
                              const decoded = decodeBase64DataUrlToBytes(ua.dataUrl);
                              if (decoded) {
                                const parsedDoc = await extractDocumentTextFromBytes(decoded.bytes, ua.name, decoded.mime || mime).catch(() => "");
                                if (parsedDoc) textContent = parsedDoc.slice(0, 24_000);
                              }
                            } else {
                              const isTextLike =
                                mime.startsWith("text/") ||
                                /\.(txt|md|json|csv|js|ts|tsx|py|html|css|xml|yaml|yml|log)$/i.test(ua.name);
                              if (isTextLike && ua.dataUrl.includes(",")) {
                                try {
                                  const b64 = ua.dataUrl.split(",")[1] || "";
                                  textContent = Buffer.from(b64, "base64").toString("utf-8").slice(0, 24000);
                                } catch {  }
                              }
                            }
                            attachmentToSave = {
                              name: ua.name,
                              type: mime,
                              ...(ua.dataUrl.length <= 750_000 ? { dataUrl: ua.dataUrl } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        if (!attachmentToSave && libraryItems.length > 0 && /(library|библиотек|отч[её]т|report|файл)/i.test(lastUserMessage)) {
                          const libMatch = findLibraryFiles(libraryItems, { query: lastUserMessage })[0];
                          if (libMatch) {
                            const textContent = (await extractLibraryTextAsync(libMatch)).slice(0, 24_000);
                            const safeB64 = libraryItemToBase64DataUrl(libMatch);
                            attachmentToSave = {
                              name: libMatch.name,
                              type: libMatch.mimeType || "text/plain",
                              ...(safeB64 && safeB64.length <= 750_000 ? { dataUrl: safeB64 } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        const contentText = (parsedArgs.content || "").trim() || (attachmentToSave ? `Файл из Library: ${attachmentToSave.name}` : "");
                        if (!contentText) {
                          throw new Error("missing content to save");
                        }
                        const existing = await listAllMemories(authed.client, authed.id, authed.token);
                        const matchExisting = existing.find(
                          (m) => m.content.trim().toLowerCase() === contentText.toLowerCase(),
                        );
                        if (matchExisting && !attachmentToSave) {
                          followupMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify({
                              ok: true,
                              already_existed: true,
                              memory: { id: matchExisting.id, content: matchExisting.content, kind: matchExisting.kind },
                              message: `Эта информация уже сохранена в памяти: «${matchExisting.content}».`,
                            }),
                          });
                        } else {
                          const created = await createMemory(authed.id, authed.token, {
                            content: contentText,
                            kind: parsedArgs.kind || "other",
                            ...(attachmentToSave ? { attachment: attachmentToSave } : {}),
                          });
                          memoryMutatedInTool = true;
                          send("memory_updated", "1");
                          followupMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify({
                              ok: true,
                              memory: { id: created.id, content: created.content, kind: created.kind, attachmentName: attachmentToSave?.name },
                              message: `Сохранено в долговременную память (Memory HUD): «${created.content}»${attachmentToSave ? ` с вложением «${attachmentToSave.name}»` : ""}. Кратко подтверди пользователю.`,
                            }),
                          });
                        }
                      }
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "search_and_read_memory") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as { query?: string; memory_id?: string };
                      let results: MemoryRow[] = [];
                      if (authed) {
                        const allMemories = await listAllMemories(authed.client, authed.id, authed.token);
                        if (parsedArgs.memory_id) {
                          results = allMemories.filter((m) => m.id === parsedArgs.memory_id);
                        } else if (parsedArgs.query) {
                          const q = parsedArgs.query.toLowerCase();
                          results = allMemories.filter((m) =>
                            m.content.toLowerCase().includes(q) ||
                            m.kind.toLowerCase().includes(q) ||
                            (m.attachment?.name && m.attachment.name.toLowerCase().includes(q)) ||
                            (m.attachment?.textContent && m.attachment.textContent.toLowerCase().includes(q))
                          );
                          if (results.length === 0) results = allMemories.slice(0, 10);
                        } else {
                          results = allMemories.slice(0, 10);
                        }
                      }
                      const memoryDetails = results.map((m) => ({
                        id: m.id,
                        kind: m.kind,
                        content: m.content,
                        attachment: m.attachment
                          ? {
                              name: m.attachment.name,
                              type: m.attachment.type,
                              size: m.attachment.size,
                              textContent: m.attachment.textContent || "(бинарное вложение или изображение)",
                            }
                          : null,
                      }));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          count: memoryDetails.length,
                          memories: memoryDetails,
                          message: `Найдено записей в памяти: ${memoryDetails.length}. Используй их контекст и вложения для ответа пользователю или отправки писем.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "refuse_unsupported_request") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        reason?: string;
                        alternative?: string;
                      };
                      const refusalPayload = {
                        id: tc.id,
                        action: String(parsedArgs.action || "Requested action"),
                        reason: String(parsedArgs.reason || "Outside technical capabilities"),
                        alternative: String(parsedArgs.alternative || "I can help with code, writing, or research instead"),
                      };
                      send("refusal_event", JSON.stringify(refusalPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          refused: true,
                          message: `Честный отказ зафиксирован: ты прямо признаешь, что не умеешь «${refusalPayload.action}» (причина: ${refusalPayload.reason}). Теперь скажи пользователю прямо, без виляний и без морализаторства: четко подтверди, что не умеешь это делать, и предложи альтернативу: «${refusalPayload.alternative}».`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "suggest_tab_transition") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        target_tab?: "engine" | "flow" | "library" | "saved";
                        title?: string;
                        reason?: string;
                        suggested_prompt?: string;
                      };
                      const transitionPayload = {
                        id: tc.id,
                        targetTab: parsedArgs.target_tab || "engine",
                        title: parsedArgs.title || "Open dedicated workspace",
                        reason: parsedArgs.reason || "This request requires tools from a dedicated workspace tab",
                        suggestedPrompt: parsedArgs.suggested_prompt || lastUserMessage,
                      };
                      send("tab_transition_event", JSON.stringify(transitionPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          target_tab: transitionPayload.targetTab,
                          message: `Интерактивная кнопка перехода во вкладку «${transitionPayload.targetTab}» показана пользователю в чате. Теперь обязательно объясни пользователю границы возможностей текстового чата (почему нельзя полноценно собрать/запустить или выгрузить проект прямо здесь в обычном тексте) и предложи нажать на появившуюся кнопку перехода.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else {
                    followupMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ ok: false, error: "unknown_tool" }),
                    });
                  }

                }

                conversationMessages = followupMessages;
                try {
                  const nextTools = toolRound < 4 ? activeTools : [];
                  currentOutcome = await runStream(conversationMessages, nextTools, true);
                  if (currentOutcome.assistantText) {
                    finalAssistantText = currentOutcome.assistantText;
                  } else if (!finalAssistantText && lastTranslatedFileText) {
                    finalAssistantText = lastTranslatedFileText;
                    send("delta", JSON.stringify(finalAssistantText));
                  }
                } catch (secondErr) {
                  console.warn("Followup tool streaming non-fatal fallback:", secondErr);
                  if (!finalAssistantText && lastTranslatedFileText) {
                    finalAssistantText = lastTranslatedFileText;
                    send("delta", JSON.stringify(finalAssistantText));
                  } else if (!finalAssistantText && lastGeneratedImageDataUrl) {
                    finalAssistantText = "Image created.";
                    send("delta", JSON.stringify(finalAssistantText));
                  }
                  break;
                }
              }

              send("done", "1");
              safeClose();
              if (authed && lastUserMessage && !memoryMutatedInTool) {
                void analyzeAndUpdateMemory(
                  authed.client,
                  authed.id,
                  lastUserMessage,
                  finalAssistantText,
                  authed.token,
                ).catch((e) => console.error("memory analyze error", e));
              }
            } catch (err) {
              console.error("stream error", err);
              if (!lastGeneratedImageDataUrl && !finalAssistantText && !hitImageLimit) {
                const errDetail = err instanceof Error ? err.message.slice(0, 120) : "stream_failed";
                send("error", JSON.stringify(errDetail || "stream_failed"));
              } else {
                send("done", "1");
              }
              safeClose();
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: any) => handleChatPost(request),
    },
  },
} as any);
