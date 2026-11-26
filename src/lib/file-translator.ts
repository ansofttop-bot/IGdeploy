import { inflateSync, inflateRawSync } from "node:zlib";
import { findLibraryFiles, extractLibraryTextAsync, type ServerLibraryItem } from "./library-server";
import type { MemoryRow } from "./memory-server";
import {
  decodeBase64DataUrlToBytes,
  extractDocumentTextFromBytes,
  extractUniversalBinaryStrings,
  extractZipInternalsFromBytes,
  isRichDocumentExtension,
  looksCorruptedBinaryString,
  sanitizeTextForApi,
} from "./word-parser";
import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
} from "./deepseek-models";
import { callGeminiFreeText } from "./gemini-free";

export type FileTranslatorArgs = {
  filename?: string;
  source?: "auto" | "user_upload" | "library" | "memory";
  library_id?: string;
  memory_id?: string;
  attachment_index?: number;
  user_question?: string;
};

export type FileTranslatorContext = {
  deepseekKey: string;
  apimiraKey: string;
  apimiraBaseUrl: string;
  useFreeModel?: boolean;
  userAttachments?: Array<{ name: string; dataUrl: string; type?: string }>;
  libraryItems: ServerLibraryItem[];
  memories: MemoryRow[];
  messages: Array<{ role: string; content: string }>;
  lastUserMessage: string;
  preExtractedAttachments?: Map<string, string>;
};

export type FileTranslationResult = {
  ok: boolean;
  filename: string;
  detectedFormat: string;
  source: string;
  byteSize?: number;
  extractionMethod: string;
  translatedText: string;
  rawPreview?: string;
  error?: string;
};

function decodePdfLiteralString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "n") {
        out += "\n";
        i += 1;
      } else if (next === "r") {
        out += "\r";
        i += 1;
      } else if (next === "t") {
        out += "\t";
        i += 1;
      } else if (next === "b" || next === "f") {
        i += 1;
      } else if (/[0-7]/.test(next)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || "";
        out += String.fromCharCode(Number.parseInt(oct, 8));
        i += oct.length;
      } else {
        out += next;
        i += 1;
      }
    } else {
      out += ch;
    }
  }
  if (out.length >= 2 && out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let u16 = "";
    for (let j = 2; j + 1 < out.length; j += 2) {
      const code = (out.charCodeAt(j) << 8) | out.charCodeAt(j + 1);
      if (!(code >= 0xd800 && code <= 0xdfff)) {
        u16 += String.fromCharCode(code);
      }
    }
    return sanitizeTextForApi(u16);
  }
  return sanitizeTextForApi(out);
}

export function extractPdfServerFallback(bytes: Uint8Array): string {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const pageMatches = latin1.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 0;

  const metaFields: string[] = [];
  for (const key of ["Title", "Author", "Subject", "Creator", "Producer"]) {
    const m = latin1.match(new RegExp(`/${key}\\s*\\(([^()]{1,300})\\)`));
    if (m?.[1]) {
      const val = decodePdfLiteralString(m[1]).trim();
      if (val) metaFields.push(`${key}: ${val}`);
    }
  }

  const collected: string[] = [];
  const collectTextOperators = (source: string) => {
    const tjMatches = source.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")/g);
    for (const m of tjMatches) {
      const txt = decodePdfLiteralString(m[1]).trim();
      if (txt && /[a-zA-Zа-яА-ЯёЁ0-9]{2,}/.test(txt)) {
        collected.push(txt);
      }
    }
    const tjArrMatches = source.matchAll(/\[([\s\S]{1,4000}?)\]\s*TJ/g);
    for (const arr of tjArrMatches) {
      const inner: string[] = [];
      for (const part of arr[1].matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g)) {
        const dec = decodePdfLiteralString(part[1]);
        if (dec) inner.push(dec);
      }
      const joined = inner.join("").trim();
      if (joined && /[a-zA-Zа-яА-ЯёЁ0-9]{2,}/.test(joined)) {
        collected.push(joined);
      }
    }
  };

  collectTextOperators(latin1);

  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamCount = 0;
  for (const m of latin1.matchAll(streamRe)) {
    streamCount += 1;
    if (streamCount > 80 || collected.length > 4000) break;
    const rawStr = m[1];
    const startIdx = m.index! + m[0].indexOf(rawStr);
    const slice = Buffer.from(bytes.subarray(startIdx, startIdx + rawStr.length));
    let inflated: Buffer | null = null;
    try {
      inflated = inflateSync(slice);
    } catch {
      try {
        inflated = inflateRawSync(slice);
      } catch {
        inflated = null;
      }
    }
    if (inflated && inflated.length > 0 && inflated.length < 2_000_000) {
      const text = inflated.toString("latin1");
      if (text.includes("BT") || text.includes("Tj") || text.includes("TJ")) {
        collectTextOperators(text);
      }
    }
  }

  const uniqueLines = Array.from(new Set(collected)).slice(0, 2500);
  const metaHeader = `[PDF-документ${pageCount ? ` | Страниц: ~${pageCount}` : ""}${metaFields.length ? ` | ${metaFields.join(" | ")}` : ""}]`;
  if (uniqueLines.length > 0) {
    return sanitizeTextForApi(`${metaHeader}\n\n${uniqueLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 60_000)}`);
  }
  const readableFallback = extractUniversalBinaryStrings(bytes, "document.pdf", "application/pdf");
  return sanitizeTextForApi(`${metaHeader}\n${readableFallback}`);
}

function detectFileFormatLabel(filename: string, mimeType: string, bytes?: Uint8Array): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return `PDF (.${ext || "pdf"})`;
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      if (ext === "ppt") return "Microsoft PowerPoint 97-2003 (.ppt, OLE2)";
      if (ext === "xls") return "Microsoft Excel 97-2003 (.xls, OLE2)";
      if (ext === "doc") return "Microsoft Word 97-2003 (.doc, OLE2)";
      return `Microsoft OLE2 Compound Document (.${ext || "ole2"})`;
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      if (/^ppt|pps|pot/.test(ext)) return `PowerPoint Presentation (.${ext}, OOXML)`;
      if (/^doc|dot/.test(ext)) return `Word Document (.${ext}, OOXML)`;
      if (/^xls|xlt/.test(ext)) return `Excel Spreadsheet (.${ext}, OOXML)`;
      if (ext === "odp" || ext === "otp") return `OpenDocument Presentation (.${ext})`;
      if (ext === "odt" || ext === "ott") return `OpenDocument Text (.${ext})`;
      if (ext === "ods" || ext === "ots") return `OpenDocument Spreadsheet (.${ext})`;
      if (ext === "epub") return "EPUB eBook (.epub)";
      return `ZIP Archive / Container (.${ext || "zip"})`;
    }
  }
  if (/^doc|dot/.test(ext) || ext === "odt" || ext === "ott" || ext === "rtf") return `Word / Text Document (.${ext})`;
  if (/^ppt|pps|pot/.test(ext) || ext === "odp" || ext === "otp") return `PowerPoint Presentation (.${ext})`;
  if (/^xls|xlt/.test(ext) || ext === "ods" || ext === "ots" || ext === "csv" || ext === "tsv") return `Excel / Table (.${ext})`;
  if (ext === "pdf") return "PDF Document (.pdf)";
  if (ext === "d" || ext === "di") return `D Language Source / Dependency File (.${ext})`;
  if (ext === "fb2" || ext === "epub") return `eBook (.${ext})`;
  return mimeType ? `${mimeType} (.${ext || "bin"})` : `.${ext || "file"}`;
}

function extractInlineAttachmentsFromMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ name: string; content: string }> {
  const found: Array<{ name: string; content: string }> = [];
  const blockRe = /<!--IGFILE:([^>]+)-->\s*([\s\S]*?)\s*<!--\/IGFILE-->/g;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== "user" || typeof msg.content !== "string") continue;
    for (const m of msg.content.matchAll(blockRe)) {
      try {
        const meta = JSON.parse(decodeURIComponent(m[1])) as { name?: string };
        const name = meta?.name || "attachment";
        const body = sanitizeTextForApi(m[2] || "").trim();
        if (name && body) {
          found.push({ name, content: body });
        }
      } catch {
      }
    }
  }
  return found;
}

function isUsableText(text: string | undefined): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (looksCorruptedBinaryString(trimmed)) return false;
  if (/^📎\s+\*\*[^*]+\*\*(?:\s+\([^)]+\))?\s+—\s+(?:attached \(binary|failed to parse)/i.test(trimmed)) {
    return false;
  }
  return true;
}

async function callDeepSeekFileTranslator(
  ctx: FileTranslatorContext,
  payload: {
    filename: string;
    detectedFormat: string;
    extractionMethod: string;
    extractedContent: string;
    userQuestion: string;
  },
): Promise<string> {
  const systemPrompt = `Ты — специализированный «Инструмент-переводчик внутренностей файлов» на базе DeepSeek.
Тебе передаются извлечённые технические внутренности файла любого типа: Word (.doc/.docx/.docm/.odt/.rtf), PowerPoint (.ppt/.pptx/.ppsx/.odp), Excel (.xls/.xlsx/.xlsm/.xlsb/.ods/.csv), PDF (.pdf), файлов языка D / зависимостей (.d), архивов (.zip/.apk/.jar), электронных книг (.fb2/.epub), исходников, конфигов или бинарных контейнеров.

ТВОЯ ЗАДАЧА:
1. Проанализировать переданные внутренние данные (слайды, заметки, таблицы/листы, страницы, XML/структуру, код .d, метаданные, извлечённые строки).
2. «Перевести» внутренности файла на понятный, структурированный и связный человеческий язык (по умолчанию — на русском, либо на языке запроса пользователя), чтобы текст можно было сразу передать сообщением в чат.
3. Обязательно отрази:
   - Что это за файл и какая у него структура (количество слайдов/листов/страниц/модулей).
   - Полное и точное содержание по существу: все ключевые тезисы, тексты слайдов, данные таблиц и формул, пункты документа, назначение и логику .d/кода/конфигов.
   - Если в файле обнаружены только изображения/сканы без встроенного текстового слоя или зашифрованные бинарные блоки — прямо и точно сообщи, какие элементы и метаданные найдены внутри.
4. Строго опирайся только на факты из переданных внутренностей. Ничего не выдумывай и не домысливай. Не выводи сырые управляющие символы или бинарный мусор.`;

  const userPrompt = `Запрос пользователя: ${sanitizeTextForApi(payload.userQuestion || "Прочитай и подробно объясни содержимое файла")}

Файл: ${payload.filename}
Определённый формат: ${payload.detectedFormat}
Способ извлечения: ${payload.extractionMethod}

=== ИЗВЛЕЧЁННЫЕ ВНУТРЕННОСТИ ФАЙЛА ===
${sanitizeTextForApi(payload.extractedContent).slice(0, 72_000)}`;

  const apiMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  if (ctx.useFreeModel) {
    const geminiText = await callGeminiFreeText({
      messages: apiMessages,
      maxTokens: 3000,
    });
    if (geminiText) return sanitizeTextForApi(geminiText);
    return sanitizeTextForApi(payload.extractedContent).slice(0, 16_000);
  }

  if (shouldTryDirectDeepSeek(ctx.deepseekKey, ctx.apimiraKey)) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctx.deepseekKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_DIRECT_CHAT,
          stream: false,
          temperature: 0.2,
          messages: apiMessages,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = String(json?.choices?.[0]?.message?.content || "").trim();
        if (text) return sanitizeTextForApi(text);
      } else {
        markDirectDeepSeekUnavailable(res.status);
        const errTxt = await res.text().catch(() => "");
        console.warn("DeepSeek file-translator error:", res.status, errTxt.slice(0, 300));
      }
    } catch (err) {
      console.warn("DeepSeek file-translator request failed:", (err as Error)?.message || err);
    }
  }

  if (ctx.apimiraKey) {
    for (const dsModel of getApimiraFallbackChain("f1", false)) {
      try {
        const res = await fetch(`${ctx.apimiraBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ctx.apimiraKey}`,
          },
          body: JSON.stringify({
            model: dsModel,
            stream: false,
            temperature: 0.2,
            ...APIMIRA_NO_REASONING_PARAMS,
            messages: apiMessages,
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (res.ok) {
          markApimiraModelHealthy(dsModel);
          const json = (await res.json()) as any;
          const text = String(json?.choices?.[0]?.message?.content || "").trim();
          if (text) return sanitizeTextForApi(text);
        } else {
          markApimiraModelUnhealthy(dsModel, res.status);
          if (res.status === 401 || res.status === 402 || res.status === 403) {
            break;
          }
        }
      } catch (err) {
        console.warn(`DeepSeek gateway (${dsModel}) file-translator failed:`, (err as Error)?.message || err);
      }
    }
  }

  return sanitizeTextForApi(payload.extractedContent).slice(0, 16_000);
}

export async function translateFileWithDeepSeek(
  args: FileTranslatorArgs,
  ctx: FileTranslatorContext,
): Promise<FileTranslationResult> {
  const sourcePref = args.source || "auto";
  const targetNameRaw = (args.filename || "").trim();
  const targetNameLower = targetNameRaw.toLowerCase();
  const inlineBlocks = extractInlineAttachmentsFromMessages(ctx.messages);

  let resolvedName = targetNameRaw;
  let resolvedSource = "unknown";
  let resolvedMime = "";
  let resolvedDataUrl = "";
  let resolvedText = "";

  // 1. Check current userAttachments
  if (
    (sourcePref === "auto" || sourcePref === "user_upload") &&
    ctx.userAttachments &&
    ctx.userAttachments.length > 0
  ) {
    let idx = -1;
    if (typeof args.attachment_index === "number" && args.attachment_index >= 1) {
      idx = Math.min(ctx.userAttachments.length - 1, Math.max(0, args.attachment_index - 1));
    } else if (targetNameLower) {
      idx = ctx.userAttachments.findIndex(
        (a) =>
          a.name.toLowerCase() === targetNameLower ||
          a.name.toLowerCase().includes(targetNameLower) ||
          targetNameLower.includes(a.name.toLowerCase()),
      );
    } else if (sourcePref === "user_upload" || !args.library_id) {
      idx = ctx.userAttachments.findIndex((a) => !a.dataUrl?.startsWith("data:image/"));
      if (idx < 0) idx = 0;
    }

    if (idx >= 0 && ctx.userAttachments[idx]) {
      const ua = ctx.userAttachments[idx];
      resolvedName = ua.name;
      resolvedSource = "user_upload";
      resolvedMime = ua.type || "";
      resolvedDataUrl = ua.dataUrl || "";
      const preText = ctx.preExtractedAttachments?.get(`${idx}:${ua.name}`);
      if (isUsableText(preText)) {
        resolvedText = preText;
      }
    }
  }

  // 2. Check inline IGFILE blocks in messages (covers current & earlier chat turns and omitted 4G dataUrl!)
  if (inlineBlocks.length > 0 && (!resolvedText || !resolvedDataUrl)) {
    const inlineMatch = resolvedName
      ? inlineBlocks.find(
          (b) =>
            b.name.toLowerCase() === resolvedName.toLowerCase() ||
            b.name.toLowerCase().includes(resolvedName.toLowerCase()),
        )
      : sourcePref === "auto" || sourcePref === "user_upload"
        ? inlineBlocks[0]
        : undefined;
    if (inlineMatch) {
      if (!resolvedName) resolvedName = inlineMatch.name;
      if (resolvedSource === "unknown") resolvedSource = "chat_attachment";
      if (!resolvedText && isUsableText(inlineMatch.content)) {
        resolvedText = inlineMatch.content;
      }
    }
  }

  // 3. Check Library items (covers Library uploads + auto-saved user uploads + Flow files)
  if (
    (sourcePref === "library" ||
      args.library_id ||
      (!resolvedDataUrl && !resolvedText)) &&
    ctx.libraryItems.length > 0
  ) {
    const matches = findLibraryFiles(ctx.libraryItems, {
      id: args.library_id,
      filename: resolvedName || targetNameRaw || undefined,
      query: resolvedName || targetNameRaw || args.user_question || ctx.lastUserMessage,
    });
    const lib = matches[0];
    if (lib && (sourcePref === "library" || !resolvedDataUrl || lib.name.toLowerCase() === (resolvedName || "").toLowerCase())) {
      if (!resolvedName) resolvedName = lib.name;
      if (resolvedSource === "unknown" || sourcePref === "library") resolvedSource = `library (${lib.source})`;
      if (!resolvedMime) resolvedMime = lib.mimeType || "";
      if (!resolvedDataUrl && lib.dataUrl) resolvedDataUrl = lib.dataUrl;
      if (!resolvedText) {
        const libText = await extractLibraryTextAsync(lib).catch(() => "");
        if (isUsableText(libText)) {
          resolvedText = libText;
        }
      }
    }
  }

  // 4. Check Memory attachments
  if ((sourcePref === "memory" || args.memory_id || (!resolvedDataUrl && !resolvedText)) && ctx.memories.length > 0) {
    const mem = ctx.memories.find((m) => {
      if (args.memory_id && m.id === args.memory_id) return true;
      if (!m.attachment) return false;
      if (resolvedName && m.attachment.name.toLowerCase().includes(resolvedName.toLowerCase())) return true;
      return sourcePref === "memory";
    });
    if (mem?.attachment) {
      if (!resolvedName) resolvedName = mem.attachment.name;
      if (resolvedSource === "unknown" || sourcePref === "memory") resolvedSource = "memory";
      if (!resolvedMime) resolvedMime = mem.attachment.type || "";
      if (!resolvedDataUrl && mem.attachment.dataUrl) resolvedDataUrl = mem.attachment.dataUrl;
      if (!resolvedText && isUsableText(mem.attachment.textContent)) resolvedText = mem.attachment.textContent;
    }
  }

  // Extract from raw bytes if we have dataUrl
  let bytes: Uint8Array | undefined;
  let deepExtracted = "";
  let extractionMethod = "";

  if (resolvedDataUrl) {
    const decoded = decodeBase64DataUrlToBytes(resolvedDataUrl);
    if (decoded && decoded.bytes.length > 0) {
      bytes = decoded.bytes;
      const effMime = decoded.mime || resolvedMime;
      const ext = (resolvedName.split(".").pop() || "").toLowerCase();
      const isPdf = ext === "pdf" || effMime.toLowerCase().includes("pdf") ||
        (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

      if (isPdf) {
        deepExtracted = extractPdfServerFallback(bytes);
        extractionMethod = resolvedText
          ? "client-pdfjs + server-pdf-stream-inspector"
          : "server-pdf-stream-inspector";
      } else if (isRichDocumentExtension(resolvedName) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        try {
          deepExtracted = await extractDocumentTextFromBytes(bytes, resolvedName, effMime);
          extractionMethod = "deep-office-xml/ole2-extractor";
        } catch {
        }
        if (bytes[0] === 0x50 && bytes[1] === 0x4b && (!deepExtracted || deepExtracted.length < 150)) {
          const zipTree = await extractZipInternalsFromBytes(bytes).catch(() => "");
          if (zipTree) {
            deepExtracted = [deepExtracted, zipTree].filter(Boolean).join("\n\n");
            extractionMethod = `${extractionMethod || "deep-office"} + zip-container-inspector`;
          }
        }
      } else {
        deepExtracted = extractUniversalBinaryStrings(bytes, resolvedName, effMime);
        extractionMethod = ext === "d" || ext === "di" ? "d-source-inspector" : "universal-text/binary-inspector";
      }
    }
  }

  // Combine extracted layers safely (prefer richer non-corrupted content)
  const parts: string[] = [];
  if (isUsableText(resolvedText)) {
    parts.push(resolvedText);
  }
  if (isUsableText(deepExtracted)) {
    const normalizedResolved = resolvedText.replace(/\s+/g, " ").slice(0, 180);
    const normalizedDeep = deepExtracted.replace(/\s+/g, " ").slice(0, 180);
    if (!normalizedResolved || (normalizedDeep !== normalizedResolved && deepExtracted.length > 40)) {
      parts.push(deepExtracted);
    }
  }

  const combinedInternals = sanitizeTextForApi(parts.join("\n\n---\n\n")).trim();
  const detectedFormat = detectFileFormatLabel(resolvedName || "file", resolvedMime, bytes);

  if (!combinedInternals) {
    return {
      ok: false,
      filename: resolvedName || "unknown",
      detectedFormat,
      source: resolvedSource,
      byteSize: bytes?.length,
      extractionMethod: extractionMethod || "none",
      translatedText: "",
      error: resolvedName
        ? `Не удалось получить содержимое файла «${resolvedName}» (нет текста и бинарных данных для анализа).`
        : "Не найден целевой файл во вложениях, истории чата, Library или памяти.",
    };
  }

  if (!extractionMethod) {
    extractionMethod = "inline-extracted-content";
  }

  const translatedText = await callDeepSeekFileTranslator(ctx, {
    filename: resolvedName || "file",
    detectedFormat,
    extractionMethod,
    extractedContent: combinedInternals,
    userQuestion: args.user_question || ctx.lastUserMessage,
  });

  return {
    ok: true,
    filename: resolvedName || "file",
    detectedFormat,
    source: resolvedSource,
    byteSize: bytes?.length,
    extractionMethod,
    translatedText,
    rawPreview: combinedInternals.slice(0, 400),
  };
}
