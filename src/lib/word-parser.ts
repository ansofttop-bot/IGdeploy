export function sanitizeTextForApi(input: string): string {
  if (!input) return "";
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      out += " ";
      continue;
    }
    out += input[i];
  }
  return out;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/g, " ");
}

function stripXmlAndFormat(xml: string, mode: "word" | "odf" | "html" | "generic"): string {
  let s = xml;
  if (mode === "word") {
    s = s
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<w:cr\b[^>]*\/?>/g, "\n")
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:tr>/g, "\n");
  } else if (mode === "odf") {
    s = s
      .replace(/<\/text:p>/g, "\n")
      .replace(/<\/text:h>/g, "\n")
      .replace(/<text:line-break\b[^>]*\/?>/g, "\n")
      .replace(/<text:tab\b[^>]*\/?>/g, "\t")
      .replace(/<text:s\b[^>]*\/>/g, " ")
      .replace(/<\/table:table-cell>/g, "\t")
      .replace(/<\/table:table-row>/g, "\n");
  } else if (mode === "html") {
    s = s
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t");
  } else if (mode === "generic") {
    s = s.replace(/<\/[^>]+>/g, " ");
  }

  return decodeXmlEntities(s.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractRtfText(raw: string): string {
  const skipDestinations = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "header",
    "footer",
    "headerl",
    "headerr",
    "headerf",
    "footerl",
    "footerr",
    "footerf",
    "footnote",
    "fldinst",
    "themedata",
    "colorschememapping",
    "latentstyles",
    "datastore",
    "xmlnstbl",
    "rsidtbl",
    "mmathPr",
    "generator",
  ]);

  let out = "";
  let i = 0;
  let ucSkip = 1;
  const groupStack: Array<{ uc: number; skip: boolean }> = [];
  let skipGroup = false;

  const decodeWin1251Byte = (byte: number): string => {
    try {
      return new TextDecoder("windows-1251").decode(new Uint8Array([byte]));
    } catch {
      return String.fromCharCode(byte);
    }
  };

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "{") {
      groupStack.push({ uc: ucSkip, skip: skipGroup });
      i += 1;
      continue;
    }
    if (ch === "}") {
      const prev = groupStack.pop();
      if (prev) {
        ucSkip = prev.uc;
        skipGroup = prev.skip;
      }
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = raw[i + 1];
      if (!next) break;
      if (next === "\\" || next === "{" || next === "}") {
        if (!skipGroup) out += next;
        i += 2;
        continue;
      }
      if (next === "*") {
        skipGroup = true;
        i += 2;
        continue;
      }
      if (next === "~") {
        if (!skipGroup) out += " ";
        i += 2;
        continue;
      }
      if (next === "_") {
        if (!skipGroup) out += "-";
        i += 2;
        continue;
      }
      if (next === "'" && /^[0-9a-fA-F]{2}/.test(raw.slice(i + 2, i + 4))) {
        const byteVal = Number.parseInt(raw.slice(i + 2, i + 4), 16);
        if (!skipGroup) out += decodeWin1251Byte(byteVal);
        i += 4;
        continue;
      }
      if (next === "\n" || next === "\r") {
        if (!skipGroup) out += "\n";
        i += 2;
        continue;
      }
      const ctrlMatch = /^([a-zA-Z]+)(-?\d+)? ?/.exec(raw.slice(i + 1));
      if (ctrlMatch) {
        const word = ctrlMatch[1];
        const param = ctrlMatch[2] !== undefined ? Number.parseInt(ctrlMatch[2], 10) : null;
        i += 1 + ctrlMatch[0].length;
        if (skipDestinations.has(word)) {
          skipGroup = true;
          continue;
        }
        if (word === "uc" && param !== null) {
          ucSkip = Math.max(0, param);
          continue;
        }
        if (word === "u" && param !== null) {
          const code = param < 0 ? 65536 + param : param;
          if (!skipGroup && code > 0 && !(code >= 0xd800 && code <= 0xdfff)) {
            out += code <= 0xffff ? String.fromCharCode(code) : String.fromCodePoint(code);
          }
          let skipped = 0;
          while (skipped < ucSkip && i < raw.length) {
            if (raw[i] === "\\" && raw[i + 1] === "'" && /^[0-9a-fA-F]{2}/.test(raw.slice(i + 2, i + 4))) {
              i += 4;
            } else if (raw[i] === "{" || raw[i] === "}") {
              break;
            } else {
              i += 1;
            }
            skipped += 1;
          }
          continue;
        }
        if (!skipGroup) {
          if (word === "par" || word === "line") out += "\n";
          else if (word === "tab") out += "\t";
          else if (word === "emdash") out += "—";
          else if (word === "endash") out += "–";
          else if (word === "bullet") out += "• ";
          else if (word === "lquote" || word === "rquote") out += "'";
          else if (word === "ldblquote" || word === "rdblquote") out += '"';
        }
        continue;
      }
      i += 2;
      continue;
    }
    if (ch !== "\r" && ch !== "\n" && !skipGroup) {
      out += ch;
    }
    i += 1;
  }

  return sanitizeTextForApi(out)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function extractWordDocumentStreamFromOle2(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.length < 512 ||
    bytes[0] !== 0xd0 ||
    bytes[1] !== 0xcf ||
    bytes[2] !== 0x11 ||
    bytes[3] !== 0xe0
  ) {
    return null;
  }
  try {
    const sectorShift = readUint16LE(bytes, 30);
    const sectorSize = 1 << (sectorShift >= 9 && sectorShift <= 12 ? sectorShift : 9);
    const firstDirSector = readUint32LE(bytes, 48);
    const fatSectors: number[] = [];
    for (let i = 0; i < 109; i += 1) {
      const s = readUint32LE(bytes, 76 + i * 4);
      if (s < 0xfffffffa) fatSectors.push(s);
    }
    const fat: number[] = [];
    for (const s of fatSectors) {
      const start = 512 + s * sectorSize;
      if (start + sectorSize > bytes.length) break;
      for (let off = 0; off < sectorSize; off += 4) {
        fat.push(readUint32LE(bytes, start + off));
      }
    }

    const readChain = (startSector: number, maxSize = 10 * 1024 * 1024): Uint8Array => {
      const chunks: Uint8Array[] = [];
      const visited = new Set<number>();
      let cur = startSector;
      let total = 0;
      while (cur < 0xfffffffa && !visited.has(cur) && total < maxSize) {
        visited.add(cur);
        const pos = 512 + cur * sectorSize;
        if (pos + sectorSize > bytes.length) break;
        chunks.push(bytes.slice(pos, pos + sectorSize));
        total += sectorSize;
        cur = fat[cur] ?? 0xffffffff;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    };

    const dirBytes = readChain(firstDirSector, 512 * 1024);
    for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
      const nameLen = Math.min(64, readUint16LE(dirBytes, off + 64));
      if (nameLen < 2) continue;
      let entryName = "";
      for (let j = 0; j + 1 < nameLen - 2; j += 2) {
        entryName += String.fromCharCode(readUint16LE(dirBytes, off + j));
      }
      if (entryName.toLowerCase() === "worddocument") {
        const startSector = readUint32LE(dirBytes, off + 116);
        const streamSize = readUint32LE(dirBytes, off + 120);
        if (streamSize >= 64 && startSector < 0xfffffffa) {
          const rawStream = readChain(startSector, Math.min(streamSize + sectorSize, 10 * 1024 * 1024));
          return rawStream.slice(0, Math.min(streamSize, rawStream.length));
        }
      }
    }
  } catch {
  }
  return null;
}

function isReadableCharCode(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0x0400 && code <= 0x04ff) return true;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  if (code >= 0x00a0 && code <= 0x024f) return true;
  if (code === 0x2013 || code === 0x2014 || code === 0x201c || code === 0x201d || code === 0x00ab || code === 0x00bb || code === 0x2116) return true;
  return false;
}

function filterMeaningfulSegments(segments: string[]): string {
  const noiseRe = /^(Microsoft Word|Normal\.dotm?|Word\.Document|Times New Roman|Calibri|Arial|Cambria|Courier New|Tahoma|Verdana|Heading \d|Default Paragraph Font|Table Normal|No List|Root Entry|WordDocument|SummaryInformation|DocumentSummaryInformation|CompObj|\d+Table|ObjectPool|_Toc\d+)$/i;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const seg of segments) {
    const normalized = seg
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (normalized.length < 4) continue;
    if (noiseRe.test(normalized)) continue;
    if (!/[a-zA-Zа-яА-ЯёЁ]{2,}/.test(normalized)) continue;
    const key = normalized.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(normalized);
  }
  return clean.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractLegacyDocText(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(512, bytes.length)));
  if (head.trimStart().startsWith("{\\rtf")) {
    return extractRtfText(new TextDecoder("latin1").decode(bytes));
  }
  if (/^\s*(?:<!doctype html|<html|<xml|<\?xml|MIME-Version:)/i.test(head)) {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return stripXmlAndFormat(utf8, "html");
  }

  const stream = extractWordDocumentStreamFromOle2(bytes) || bytes;

  // Scan UTF-16LE runs (modern/Unicode sections in .doc)
  const utf16Runs: string[] = [];
  for (const alignment of [0, 1]) {
    let cur = "";
    for (let i = alignment; i + 1 < stream.length; i += 2) {
      const code = stream[i] | (stream[i + 1] << 8);
      if (isReadableCharCode(code)) {
        cur += code === 13 ? "\n" : String.fromCharCode(code);
      } else {
        if (cur.trim().length >= 8) utf16Runs.push(cur);
        cur = "";
      }
    }
    if (cur.trim().length >= 8) utf16Runs.push(cur);
  }
  const utf16Text = filterMeaningfulSegments(utf16Runs);
  if (utf16Text.length >= 40) {
    return utf16Text;
  }

  // Fallback: single-byte CP1251/ASCII runs
  const win1251 = new TextDecoder("windows-1251", { fatal: false }).decode(stream);
  const cpRuns: string[] = [];
  let curCp = "";
  for (let i = 0; i < win1251.length; i += 1) {
    const code = win1251.charCodeAt(i);
    if (isReadableCharCode(code)) {
      curCp += code === 13 ? "\n" : win1251[i];
    } else {
      if (curCp.trim().length >= 12) cpRuns.push(curCp);
      curCp = "";
    }
  }
  if (curCp.trim().length >= 12) cpRuns.push(curCp);
  const cpText = filterMeaningfulSegments(cpRuns);
  return cpText.length > utf16Text.length ? cpText : utf16Text;
}

async function getJSZip(): Promise<any> {
  const mod: any = await import("jszip");
  return mod?.default || mod;
}

export async function extractDocxFromBytes(bytes: Uint8Array): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const xmlPaths = Object.keys(zip.files)
    .filter(
      (n) =>
        /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(n),
    )
    .sort((a, b) => {
      if (a.toLowerCase() === "word/document.xml") return -1;
      if (b.toLowerCase() === "word/document.xml") return 1;
      return a.localeCompare(b);
    });

  const sections: string[] = [];
  for (const p of xmlPaths) {
    try {
      const xml = await zip.files[p].async("string");
      const text = stripXmlAndFormat(xml, "word");
      if (text) sections.push(text);
    } catch {
    }
  }
  return sections.join("\n\n").trim();
}

export async function extractOdfFromBytes(bytes: Uint8Array): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.files["content.xml"];
  if (!file) return "";
  const xml = await file.async("string");
  return stripXmlAndFormat(xml, "odf");
}

export async function extractPptxFromBytes(bytes: Uint8Array): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const allNames = Object.keys(zip.files);

  const slideFiles = allNames
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/slide(\d+)/i)?.[1] || "0", 10);
      const nb = Number.parseInt(b.match(/slide(\d+)/i)?.[1] || "0", 10);
      return na - nb;
    });

  const notesFiles = allNames
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/notesSlide(\d+)/i)?.[1] || "0", 10);
      const nb = Number.parseInt(b.match(/notesSlide(\d+)/i)?.[1] || "0", 10);
      return na - nb;
    });

  const extraXmlFiles = allNames
    .filter((n) => /^ppt\/(charts|diagrams|comments)\/[^/]+\.xml$/i.test(n))
    .sort();

  const mediaFiles = allNames.filter((n) => /^ppt\/media\/.+/i.test(n) && !n.endsWith("/"));

  const extractTagsText = (xml: string, tagPattern: RegExp): string => {
    const texts = Array.from(xml.matchAll(tagPattern)).map((m: RegExpMatchArray) =>
      decodeXmlEntities(m[1]),
    );
    const joined = texts.join(" ").replace(/\s+/g, " ").trim();
    if (joined) return joined;
    return stripXmlAndFormat(xml, "generic").replace(/\s+/g, " ").trim();
  };

  const out: string[] = [];

  if (zip.files["docProps/core.xml"]) {
    try {
      const coreXml = String(await zip.files["docProps/core.xml"].async("string"));
      const meta = stripXmlAndFormat(coreXml, "generic").replace(/\s+/g, " ").trim();
      if (meta && meta.length >= 3) {
        out.push(`[Метаданные презентации]: ${meta.slice(0, 600)}`);
      }
    } catch {
    }
  }

  for (let i = 0; i < slideFiles.length; i += 1) {
    const n = slideFiles[i];
    try {
      const xml = String(await zip.files[n].async("string"));
      const body = extractTagsText(xml, /<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
      if (body) {
        out.push(`--- Слайд ${i + 1} (${n.split("/").pop()}) ---\n${body}`);
      }
    } catch {
    }
  }

  for (let i = 0; i < notesFiles.length; i += 1) {
    const n = notesFiles[i];
    try {
      const xml = String(await zip.files[n].async("string"));
      const body = extractTagsText(xml, /<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
      if (body) {
        out.push(`--- Заметки (${n.split("/").pop()}) ---\n${body}`);
      }
    } catch {
    }
  }

  for (const n of extraXmlFiles.slice(0, 30)) {
    try {
      const xml = String(await zip.files[n].async("string"));
      const body = extractTagsText(xml, /<(?:a:t|c:v|v)[^>]*>([\s\S]*?)<\/(?:a:t|c:v|v)>/g);
      if (body) {
        out.push(`--- ${n.split("/").pop()} ---\n${body}`);
      }
    } catch {
    }
  }

  if (out.length === 0 && (slideFiles.length > 0 || mediaFiles.length > 0)) {
    return `[PowerPoint презентация: слайдов ${slideFiles.length}, медиафайлов ${mediaFiles.length} (${mediaFiles.slice(0, 12).map((m) => m.split("/").pop()).join(", ")}). Текстовых блоков <a:t> на слайдах не обнаружено — возможно, слайды состоят из встроенных изображений.]`;
  }

  return sanitizeTextForApi(out.join("\n\n").trim());
}

export function extractLegacyPptText(bytes: Uint8Array): string {
  const utf16Runs: string[] = [];
  for (const alignment of [0, 1]) {
    let cur = "";
    for (let i = alignment; i + 1 < bytes.length; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (isReadableCharCode(code)) {
        cur += code === 13 ? "\n" : String.fromCharCode(code);
      } else {
        if (cur.trim().length >= 6) utf16Runs.push(cur);
        cur = "";
      }
    }
    if (cur.trim().length >= 6) utf16Runs.push(cur);
  }
  const utf16Text = filterMeaningfulSegments(utf16Runs);
  if (utf16Text.length >= 40) return sanitizeTextForApi(utf16Text);

  const win1251 = new TextDecoder("windows-1251", { fatal: false }).decode(bytes);
  const cpRuns: string[] = [];
  let curCp = "";
  for (let i = 0; i < win1251.length; i += 1) {
    const code = win1251.charCodeAt(i);
    if (isReadableCharCode(code)) {
      curCp += code === 13 ? "\n" : win1251[i];
    } else {
      if (curCp.trim().length >= 10) cpRuns.push(curCp);
      curCp = "";
    }
  }
  if (curCp.trim().length >= 10) cpRuns.push(curCp);
  const cpText = filterMeaningfulSegments(cpRuns);
  return sanitizeTextForApi(cpText.length > utf16Text.length ? cpText : utf16Text);
}

export async function extractZipInternalsFromBytes(bytes: Uint8Array): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files) as any[];
  const list: string[] = [];
  const inlinedTexts: string[] = [];
  let inlinedCount = 0;
  for (const e of entries.slice(0, 120)) {
    if (e.dir) {
      list.push(`📁 ${e.name}`);
      continue;
    }
    const sz = e._data?.uncompressedSize ?? 0;
    list.push(`📄 ${e.name} (${sz} B)`);
    if (
      inlinedCount < 25 &&
      sz > 0 &&
      sz <= 120_000 &&
      /\.(txt|md|json|xml|csv|tsv|html?|css|js|ts|tsx|jsx|py|d|c|h|cpp|yml|yaml|ini|cfg|conf|properties|sql|rels|svg)$/i.test(e.name)
    ) {
      try {
        const txt = String(await e.async("string"));
        const clean = sanitizeTextForApi(txt).trim();
        if (clean && !looksCorruptedBinaryString(clean)) {
          inlinedTexts.push(`### ${e.name}\n${clean.slice(0, 12_000)}`);
          inlinedCount += 1;
        }
      } catch {
      }
    }
  }
  const extraCount = entries.length > 120 ? `\n… и ещё ${entries.length - 120} элементов` : "";
  return sanitizeTextForApi(
    `[ZIP-контейнер: ${entries.length} элементов]\n${list.join("\n")}${extraCount}` +
      (inlinedTexts.length ? `\n\n${inlinedTexts.join("\n\n")}` : ""),
  );
}

export function extractUniversalBinaryStrings(bytes: Uint8Array, filename = "", mimeType = ""): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  let signature = mimeType || "binary/octet-stream";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    signature = "ZIP / OOXML container (PK)";
  } else if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    signature = "PDF document (%PDF-)";
  } else if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    signature = "Microsoft OLE2 Compound Document (.doc/.xls/.ppt)";
  } else if (bytes.length >= 5 && new TextDecoder("latin1").decode(bytes.slice(0, 6)).startsWith("{\\rtf")) {
    signature = "RTF Rich Text Document";
  }

  // Try clean UTF-8 text decode first if mostly printable (covers .d, .txt, .json, .xml, scripts)
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 400_000));
    const cleanUtf8 = sanitizeTextForApi(utf8);
    if (cleanUtf8.trim().length > 0 && !looksCorruptedBinaryString(cleanUtf8)) {
      return cleanUtf8.trim();
    }
  } catch {
  }

  const utf16Runs: string[] = [];
  for (const alignment of [0, 1]) {
    let cur = "";
    for (let i = alignment; i + 1 < Math.min(bytes.length, 2_500_000); i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (isReadableCharCode(code)) {
        cur += code === 13 ? "\n" : String.fromCharCode(code);
      } else {
        if (cur.trim().length >= 6) utf16Runs.push(cur);
        cur = "";
      }
    }
    if (cur.trim().length >= 6) utf16Runs.push(cur);
  }
  const utf16 = filterMeaningfulSegments(utf16Runs);

  const win1251 = new TextDecoder("windows-1251", { fatal: false }).decode(bytes.slice(0, 2_500_000));
  const cpRuns: string[] = [];
  let curCp = "";
  for (let i = 0; i < win1251.length; i += 1) {
    const code = win1251.charCodeAt(i);
    if (isReadableCharCode(code)) {
      curCp += code === 13 ? "\n" : win1251[i];
    } else {
      if (curCp.trim().length >= 8) cpRuns.push(curCp);
      curCp = "";
    }
  }
  if (curCp.trim().length >= 8) cpRuns.push(curCp);
  const cpText = filterMeaningfulSegments(cpRuns);

  const combined = [utf16, cpText].filter(Boolean).join("\n\n").trim();
  const header = `[Файл: ${filename || "unknown"} | Формат: ${signature} | Расширение: .${ext || "?"} | Размер: ${bytes.length} B]`;
  return sanitizeTextForApi(combined ? `${header}\n\n${combined.slice(0, 60_000)}` : `${header}\n(Читаемые текстовые строки не обнаружены — файл представляет собой сжатые/зашифрованные бинарные данные.)`);
}

export async function extractXlsxFromBytes(bytes: Uint8Array): Promise<string> {
  const mod: any = await import("xlsx");
  const XLSX = mod?.default || mod;
  const wb = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames || []) {
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws);
    if (csv && csv.trim()) {
      parts.push(`### Лист: ${name}\n\`\`\`csv\n${csv.trim()}\n\`\`\``);
    }
  }
  return sanitizeTextForApi(parts.join("\n\n").trim());
}

export async function extractFb2OrEpubFromBytes(bytes: Uint8Array, ext: string): Promise<string> {
  if (ext === "fb2") {
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return stripXmlAndFormat(
      xml.replace(/<binary[\s\S]*?<\/binary>/gi, ""),
      "html",
    );
  }
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const htmlFiles = Object.keys(zip.files)
    .filter((n) => /\.(xhtml|html|htm)$/i.test(n))
    .sort();
  const out: string[] = [];
  for (const n of htmlFiles.slice(0, 40)) {
    try {
      const html = await zip.files[n].async("string");
      const text = stripXmlAndFormat(html, "html");
      if (text) out.push(text);
    } catch {
    }
  }
  return sanitizeTextForApi(out.join("\n\n").trim());
}

export function isRichDocumentExtension(filename: string): boolean {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return [
    "docx",
    "docm",
    "dotx",
    "dotm",
    "doc",
    "odt",
    "ott",
    "ods",
    "ots",
    "odp",
    "otp",
    "rtf",
    "xlsx",
    "xls",
    "xlsm",
    "xlsb",
    "xltx",
    "xltm",
    "pptx",
    "pptm",
    "ppsx",
    "ppsm",
    "potx",
    "potm",
    "ppt",
    "fb2",
    "epub",
  ].includes(ext);
}

export function looksCorruptedBinaryString(text?: string): boolean {
  if (!text) return false;
  if (text.startsWith("PK\u0003\u0004") || text.startsWith("PK\\x03\\x04")) return true;
  if (text.includes("word/document.xml") && text.includes("PK")) return true;
  if (text.includes("ppt/slides/slide") && text.includes("PK")) return true;
  if (text.includes("xl/workbook.xml") && text.includes("PK")) return true;
  const sample = text.slice(0, 600);
  let replacementCount = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      replacementCount += 1;
    }
  }
  return sample.length > 20 && replacementCount / sample.length > 0.08;
}

export async function extractDocumentTextFromBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = "",
): Promise<string> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  const isZipHeader = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle2Header =
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;

  let rawResult = "";
  if (
    ext === "docx" ||
    ext === "docm" ||
    ext === "dotx" ||
    ext === "dotm" ||
    lowerMime.includes("wordprocessingml") ||
    (ext === "doc" && isZipHeader)
  ) {
    rawResult = await extractDocxFromBytes(bytes);
  } else if (ext === "doc" || lowerMime === "application/msword") {
    rawResult = extractLegacyDocText(bytes);
  } else if (ext === "rtf" || lowerMime.includes("rtf")) {
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      raw = new TextDecoder("latin1").decode(bytes);
    }
    rawResult = extractRtfText(raw);
  } else if (
    ext === "odt" ||
    ext === "ott" ||
    ext === "ods" ||
    ext === "ots" ||
    ext === "odp" ||
    ext === "otp" ||
    lowerMime.includes("opendocument")
  ) {
    rawResult = await extractOdfFromBytes(bytes);
  } else if (
    ext === "pptx" ||
    ext === "pptm" ||
    ext === "ppsx" ||
    ext === "ppsm" ||
    ext === "potx" ||
    ext === "potm" ||
    lowerMime.includes("presentationml") ||
    (ext === "ppt" && isZipHeader)
  ) {
    rawResult = await extractPptxFromBytes(bytes);
  } else if (ext === "ppt" || lowerMime === "application/vnd.ms-powerpoint" || lowerMime === "application/mspowerpoint") {
    rawResult = extractLegacyPptText(bytes);
  } else if (
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "xlsm" ||
    ext === "xlsb" ||
    ext === "xltx" ||
    ext === "xltm" ||
    lowerMime.includes("spreadsheetml") ||
    lowerMime.includes("ms-excel")
  ) {
    rawResult = await extractXlsxFromBytes(bytes);
  } else if (ext === "fb2" || ext === "epub") {
    rawResult = await extractFb2OrEpubFromBytes(bytes, ext);
  } else if (isZipHeader) {
    rawResult = await extractZipInternalsFromBytes(bytes);
  } else if (isOle2Header) {
    rawResult = extractUniversalBinaryStrings(bytes, filename, mimeType);
  }

  if (!rawResult.trim() && bytes.length > 0) {
    rawResult = isZipHeader
      ? await extractZipInternalsFromBytes(bytes).catch(() => extractUniversalBinaryStrings(bytes, filename, mimeType))
      : extractUniversalBinaryStrings(bytes, filename, mimeType);
  }

  return sanitizeTextForApi(rawResult);
}

export function decodeBase64DataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  const meta = dataUrl.slice(5, commaIdx);
  const mime = meta.split(";")[0] || "";
  const body = dataUrl.slice(commaIdx + 1);
  if (meta.toLowerCase().includes(";base64")) {
    if (typeof Buffer !== "undefined") {
      return { mime, bytes: new Uint8Array(Buffer.from(body, "base64")) };
    }
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return { mime, bytes: arr };
  }
  try {
    const decoded = decodeURIComponent(body);
    return { mime, bytes: new TextEncoder().encode(decoded) };
  } catch {
    return null;
  }
}
