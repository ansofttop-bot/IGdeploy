import { isRichDocumentExtension, sanitizeTextForApi } from "./word-parser";

export type ParseResult = {
  kind: "text" | "image" | "binary";
  content: string;
  note?: string;
};

const TEXT_EXT = new Set([
  "txt","md","markdown","rst","log","csv","tsv","json","json5","jsonl","xml","yaml","yml","toml","ini","cfg","conf","env",
  "html","htm","xhtml","css","scss","sass","less","styl",
  "js","jsx","mjs","cjs","ts","tsx","vue","svelte","astro",
  "py","rb","go","rs","java","kt","kts","scala","groovy","clj","cljs","cljc","edn",
  "c","h","cpp","cc","cxx","hpp","hh","hxx","m","mm","cs","fs","fsx","vb",
  "php","phtml","pl","pm","lua","dart","swift","r","jl","nim","zig","d","di","hs","elm","ex","exs","erl","hrl",
  "sh","bash","zsh","fish","ps1","bat","cmd","awk","sed",
  "sql","psql","graphql","gql","proto","thrift","prisma",
  "dockerfile","dockerignore","gitignore","gitattributes","editorconfig","npmrc","nvmrc","prettierrc","eslintrc","babelrc",
  "makefile","mk","cmake","gradle","bazel","bzl","nix","tf","tfvars","hcl","pp","srt","vtt","ass","tex","bib","rmd","patch","diff","po","pot",
]);

const IMG_EXT = new Set(["png","jpg","jpeg","gif","webp","bmp","avif","heic","heif","ico"]);

function fence(lang: string, body: string) {
  return "```" + lang + "\n" + body + "\n```";
}

function truncate(s: string, max = 120_000) {
  const clean = sanitizeTextForApi(s);
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + `\n\n… [truncated ${clean.length - max} chars]`;
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const max = Math.min(doc.numPages, 100);
  let meaningfulChars = 0;
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rawPageText = content.items.map((it: any) => String(it.str || "")).join(" ");
    const text = sanitizeTextForApi(rawPageText).replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      meaningfulChars += text.length;
      parts.push(`--- Page ${i} ---\n${text}`);
    }
  }
  if (meaningfulChars === 0) {
    return `[PDF содержит ${doc.numPages} стр., но не содержит встроенного текстового слоя — вероятно, это скан или чертёж в виде изображений.]`;
  }
  if (doc.numPages > max) parts.push(`\n[… ${doc.numPages - max} more pages omitted]`);
  return parts.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let mammothText = "";
  try {
    const mammothMod: any = await import("mammoth/mammoth.browser" as any);
    const mammoth = mammothMod?.default || mammothMod;
    if (typeof mammoth?.extractRawText === "function") {
      const res = await mammoth.extractRawText({ arrayBuffer: buf });
      mammothText = (res?.value || "").trim();
    }
  } catch {
  }

  try {
    const { extractDocumentTextFromBytes } = await import("./word-parser");
    const xmlText = await extractDocumentTextFromBytes(bytes, file.name, file.type);
    if (xmlText && xmlText.length > mammothText.length) {
      return sanitizeTextForApi(xmlText);
    }
  } catch {
  }

  return sanitizeTextForApi(mammothText);
}

async function parseXlsx(file: File): Promise<string> {
  const XLSXMod: any = await import("xlsx");
  const XLSX = XLSXMod?.default || XLSXMod;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws);
    if (csv && csv.trim()) {
      parts.push(`### Лист: ${name}\n${fence("csv", csv.trim())}`);
    }
  }
  return parts.join("\n\n");
}

async function parsePptx(file: File): Promise<string> {
  const { extractDocumentTextFromBytes } = await import("./word-parser");
  const buf = await file.arrayBuffer();
  return extractDocumentTextFromBytes(new Uint8Array(buf), file.name, file.type);
}

async function parseZip(file: File): Promise<string> {
  const JSZipMod: any = await import("jszip");
  const JSZip = JSZipMod?.default || JSZipMod;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files) as any[];
  const list: string[] = [];
  const files: string[] = [];
  let inlined = 0;
  const MAX_INLINE_FILES = 25;
  const MAX_FILE_BYTES = 100_000;
  for (const e of entries) {
    if (e.dir) { list.push(`📁 ${e.name}`); continue; }
    const sz = e._data?.uncompressedSize ?? 0;
    list.push(`📄 ${e.name} (${sz} B)`);
    if (inlined >= MAX_INLINE_FILES) continue;
    const ext = (e.name.split(".").pop() || "").toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    if (sz > MAX_FILE_BYTES) continue;
    try {
      const txt = await e.async("string");
      files.push(`### ${e.name}\n${fence(ext, truncate(txt, MAX_FILE_BYTES))}`);
      inlined++;
    } catch {}
  }
  return `**Archive contents (${entries.length} entries):**\n${list.join("\n")}\n\n${files.join("\n\n")}`;
}

export async function parseAttachment(file: File): Promise<ParseResult> {
  const name = file.name;
  const ext = (name.split(".").pop() || "").toLowerCase();
  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  const sizeKb = (file.size / 1024).toFixed(1);
  const sizeLabel = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;
  const header = (icon: string) => `${icon} **${name}** (${sizeLabel})`;

  if (
    !isRichDocumentExtension(name) &&
    ext !== "pdf" &&
    (TEXT_EXT.has(ext) ||
      file.type.startsWith("text/") ||
      file.type.includes("json") ||
      file.type.includes("xml") ||
      file.type.includes("javascript"))
  ) {
    if (file.size <= 5 * 1024 * 1024) {
      const txt = await file.text();
      return { kind: "text", content: `${header("📎")}\n${fence(ext || "text", truncate(txt))}` };
    }
  }

  if (IMG_EXT.has(ext) || file.type.startsWith("image/")) {
    if (file.size <= 10 * 1024 * 1024) {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      return { kind: "image", content: `![${name}](${dataUrl})` };
    }
  }

  try {
    if (ext === "pdf" || file.type === "application/pdf") {
      const text = await parsePdf(file);
      return { kind: "text", content: `${header("📕")}\n${fence("text", truncate(text))}` };
    }
    if (ext === "docx" || ext === "docm" || ext === "dotx" || ext === "dotm" || file.type.includes("wordprocessingml")) {
      const text = await parseDocx(file);
      if (text.trim()) {
        return { kind: "text", content: `${header("📘")}\n${fence("text", truncate(text))}` };
      }
    }
    if (
      ext === "doc" ||
      ext === "odt" ||
      ext === "ott" ||
      ext === "rtf" ||
      ext === "fb2" ||
      ext === "epub" ||
      file.type === "application/msword" ||
      file.type.includes("opendocument.text") ||
      file.type.includes("rtf")
    ) {
      const { extractDocumentTextFromBytes } = await import("./word-parser");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = await extractDocumentTextFromBytes(bytes, name, file.type);
      if (text.trim()) {
        return { kind: "text", content: `${header("📘")}\n${fence("text", truncate(text))}` };
      }
    }
    if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "xlsb" || ext === "xltx" || ext === "xltm" || ext === "ods" || ext === "ots") {
      const text =
        ext === "ods" || ext === "ots"
          ? await (await import("./word-parser")).extractDocumentTextFromBytes(new Uint8Array(await file.arrayBuffer()), name, file.type)
          : await parseXlsx(file);
      if (text.trim()) {
        return { kind: "text", content: `${header("📊")}\n${truncate(text)}` };
      }
    }
    if (
      ext === "pptx" ||
      ext === "pptm" ||
      ext === "ppsx" ||
      ext === "ppsm" ||
      ext === "potx" ||
      ext === "potm" ||
      ext === "ppt" ||
      ext === "odp" ||
      ext === "otp" ||
      file.type.includes("presentationml") ||
      file.type.includes("powerpoint")
    ) {
      const text = await parsePptx(file);
      if (text.trim()) {
        return { kind: "text", content: `${header("📙")}\n${fence("text", truncate(text))}` };
      }
    }
    if (ext === "zip" || ext === "jar" || ext === "apk") {
      const text = await parseZip(file);
      return { kind: "text", content: `${header("🗜️")}\n${truncate(text)}` };
    }
    if (ext === "ipynb") {
      const txt = await file.text();
      try {
        const nb = JSON.parse(txt);
        const parts: string[] = [];
        for (const cell of nb.cells || []) {
          const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
          if (cell.cell_type === "code") parts.push(fence("python", src));
          else parts.push(src);
        }
        return { kind: "text", content: `${header("📓")}\n${truncate(parts.join("\n\n"))}` };
      } catch {
        return { kind: "text", content: `${header("📓")}\n${fence("json", truncate(txt))}` };
      }
    }

    // Fallback for any other binary / proprietary / custom format <= 15 MB
    if (file.size <= 15 * 1024 * 1024) {
      const { extractDocumentTextFromBytes } = await import("./word-parser");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractDocumentTextFromBytes(bytes, name, file.type);
      if (extracted.trim()) {
        return { kind: "text", content: `${header("📎")}\n${fence("text", truncate(extracted))}` };
      }
    }
  } catch (err: any) {
    return {
      kind: "binary",
      content: `${header("📎")} — failed to parse: ${err?.message || String(err)}`,
    };
  }

  return {
    kind: "binary",
    content: `${header("📎")} — attached (binary, ${file.type || "unknown type"})`,
  };
}
